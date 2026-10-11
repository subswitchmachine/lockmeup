import { useCallback, useEffect, useRef, useState } from 'react'
import {
  accumulateBaseline,
  centerRoi,
  laplacianVariance,
  meanAbsDiff,
  toGrayscale,
  type GrayFrame,
} from '../lib/imageMetrics'
import {
  initialContext,
  nextState,
  type MachineContext,
} from '../lib/captureMachine'
import { DEFAULT_CONFIG, type CaptureConfig, type CaptureState } from '../lib/captureConfig'

export interface CaptureFrame {
  /** Full, unobscured frame (PNG data URL). */
  dataUrl: string
  /** Same frame with the centered ROI heavily blurred to hide the combo. */
  blurredDataUrl: string
}

/** A single capture: one trigger, a redundant burst of frames. */
export interface Capture {
  id: number
  at: number
  frames: CaptureFrame[]
}

export interface LiveMetrics {
  sharpness: number
  motion: number
  baselineDiff: number
  /** 0..1 progress through the settle window (only meaningful while settling). */
  settleProgress: number
}

export interface UseAutoCaptureResult {
  state: CaptureState
  metrics: LiveMetrics
  /** The current capture (a burst of frames), or null if none yet. */
  capture: Capture | null
  retake: () => void
  /** Fire a capture immediately, bypassing the focus/motion/settle gates. */
  captureNow: () => void
  roiFraction: number
}

const ZERO_METRICS: LiveMetrics = { sharpness: 0, motion: 0, baselineDiff: 0, settleProgress: 0 }

/**
 * Render `source` into `target` with the centered ROI square blurred heavily,
 * returning a PNG data URL. Lets a user confirm the lock was framed without
 * exposing the digits in the middle.
 */
function renderCenterBlurred(
  source: HTMLCanvasElement,
  target: HTMLCanvasElement,
  roiFraction: number,
): string {
  const w = source.width
  const h = source.height
  target.width = w
  target.height = h
  const ctx = target.getContext('2d')
  if (!ctx) return source.toDataURL('image/png')

  ctx.filter = 'none'
  ctx.drawImage(source, 0, 0) // sharp full frame underneath

  const side = Math.min(w, h) * roiFraction
  const x0 = (w - side) / 2
  const y0 = (h - side) / 2
  const radius = Math.max(12, Math.round(side * 0.12))

  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, y0, side, side)
  ctx.clip()
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(source, 0, 0) // blurred copy, painted only inside the clip
  ctx.restore()
  ctx.filter = 'none'

  return target.toDataURL('image/png')
}
/** Analyse at ~12fps — plenty for capture timing, far cheaper than every frame. */
const ANALYSIS_INTERVAL_MS = 80
/** EMA weight folding each calibration frame into the baseline. */
const BASELINE_WEIGHT = 0.15

/**
 * Drives the per-frame analysis loop: draws the webcam into a small offscreen
 * canvas, computes focus/motion/presence over the centered ROI, feeds them
 * through the capture state machine, and snapshots a full-resolution frame when
 * the machine fires.
 */
export function useAutoCapture(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  autoCapture: boolean,
  config: CaptureConfig = DEFAULT_CONFIG,
  onCaptureComplete?: () => void,
): UseAutoCaptureResult {
  const [state, setState] = useState<CaptureState>('idle')
  const [metrics, setMetrics] = useState<LiveMetrics>(ZERO_METRICS)
  const [capture, setCapture] = useState<Capture | null>(null)

  // Loop-internal mutable state (kept in refs to avoid re-render churn).
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const prevRoiRef = useRef<GrayFrame | null>(null)
  const baselineRef = useRef<GrayFrame | null>(null)
  const ctxRef = useRef<MachineContext | null>(null)
  const wasCalibratingRef = useRef(false)
  const captureIdRef = useRef(0)
  const burstTimersRef = useRef<number[]>([])
  // Live trigger for a manual capture, wired up inside the analysis effect so it
  // can reach the loop's `takeBurst`/canvas state. Null while inactive.
  const manualTriggerRef = useRef<(() => void) | null>(null)

  // Keep the latest completion callback in a ref so changing it doesn't restart
  // the analysis loop (which would reset the state machine).
  const onCompleteRef = useRef(onCaptureComplete)
  useEffect(() => {
    onCompleteRef.current = onCaptureComplete
  })

  // Live `autoCapture` flag in a ref so toggling it doesn't restart the loop.
  const autoCaptureRef = useRef(autoCapture)
  useEffect(() => {
    autoCaptureRef.current = autoCapture
  })

  // Re-arm the machine without re-baking the current scene into the baseline:
  // jump back to "waiting" (keeping the empty-scene baseline) so it captures the
  // next good shot, bypassing the post-capture cooldown.
  const reArm = useCallback(() => {
    const now = performance.now()
    const next: MachineContext = baselineRef.current
      ? { state: 'waiting', enteredAt: now, settleStartedAt: null, sawMotion: false }
      : initialContext(now)
    ctxRef.current = next
    prevRoiRef.current = null
    setState(next.state)
  }, [])

  const retake = useCallback(() => {
    burstTimersRef.current.forEach(clearTimeout)
    burstTimersRef.current = []
    setCapture(null)
    reArm()
  }, [reArm])

  // Fire a capture right now, skipping every gate the state machine enforces.
  const captureNow = useCallback(() => {
    manualTriggerRef.current?.()
  }, [])

  useEffect(() => {
    if (!active) return

    // Fresh run: reset all loop state. The first tick publishes the state via
    // setState (async, inside rAF) — we avoid setting state synchronously here.
    ctxRef.current = initialContext(performance.now())
    prevRoiRef.current = null
    baselineRef.current = null
    wasCalibratingRef.current = false

    if (!analysisCanvasRef.current) analysisCanvasRef.current = document.createElement('canvas')
    if (!captureCanvasRef.current) captureCanvasRef.current = document.createElement('canvas')
    if (!blurCanvasRef.current) blurCanvasRef.current = document.createElement('canvas')

    let rafId = 0
    let lastAnalysis = 0

    const tick = () => {
      rafId = requestAnimationFrame(tick)
      const now = performance.now()
      if (now - lastAnalysis < ANALYSIS_INTERVAL_MS) return

      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) return
      lastAnalysis = now

      // Downscale into the analysis canvas, preserving aspect ratio.
      const aw = config.analysisWidth
      const ah = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * aw))
      const canvas = analysisCanvasRef.current!
      canvas.width = aw
      canvas.height = ah
      const c2d = canvas.getContext('2d', { willReadFrequently: true })
      if (!c2d) return
      c2d.drawImage(video, 0, 0, aw, ah)

      const gray = toGrayscale(c2d.getImageData(0, 0, aw, ah))
      const roi = centerRoi(gray, config.roiFraction)

      const prevRoi = prevRoiRef.current
      const baseline = baselineRef.current
      const frameMetrics = {
        sharpness: laplacianVariance(roi),
        motion: prevRoi ? meanAbsDiff(roi, prevRoi) : 0,
        baselineDiff: baseline ? meanAbsDiff(roi, baseline) : 0,
      }

      const ctx = ctxRef.current!

      // When auto-capture is off we only publish live metrics; the state
      // machine is held at idle and its baseline cleared, so re-enabling it
      // recalibrates against the current scene.
      if (!autoCaptureRef.current) {
        ctxRef.current = initialContext(now)
        baselineRef.current = null
        wasCalibratingRef.current = false
        prevRoiRef.current = roi
        setState('idle')
        setMetrics({ ...frameMetrics, settleProgress: 0 })
        return
      }

      // Build/refresh the baseline only while calibrating; start fresh on entry.
      if (ctx.state === 'calibrating') {
        if (!wasCalibratingRef.current) baselineRef.current = null
        baselineRef.current = accumulateBaseline(baselineRef.current, roi, BASELINE_WEIGHT)
        wasCalibratingRef.current = true
      } else {
        wasCalibratingRef.current = false
      }

      const result = nextState(ctx, frameMetrics, now, config)
      ctxRef.current = result.context

      if (result.capture) takeBurst(video)

      const settleProgress =
        result.context.state === 'settling' && result.context.settleStartedAt !== null
          ? Math.min(1, (now - result.context.settleStartedAt) / config.settleMs)
          : 0

      prevRoiRef.current = roi
      setState(result.context.state)
      setMetrics({ ...frameMetrics, settleProgress })
    }

    // Grab one frame and append it to the current capture (or start a new one).
    const captureFrame = (video: HTMLVideoElement, shotId: number) => {
      const canvas = captureCanvasRef.current!
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const c2d = canvas.getContext('2d')
      if (!c2d) return
      c2d.drawImage(video, 0, 0, canvas.width, canvas.height)
      const frame: CaptureFrame = {
        dataUrl: canvas.toDataURL('image/png'),
        blurredDataUrl: renderCenterBlurred(canvas, blurCanvasRef.current!, config.roiFraction),
      }
      setCapture((prev) =>
        prev && prev.id === shotId
          ? { ...prev, frames: [...prev.frames, frame] }
          : { id: shotId, at: Date.now(), frames: [frame] },
      )
    }

    // One trigger -> a single capture made of a spread-out burst of frames, so
    // at least one is sharp even if focus hunts or the lock wobbles. The new
    // capture replaces any previous one (only one capture at a time).
    const takeBurst = (video: HTMLVideoElement) => {
      burstTimersRef.current.forEach(clearTimeout)
      burstTimersRef.current = []
      const shotId = captureIdRef.current++
      captureFrame(video, shotId)
      if (config.burstCount <= 1) {
        onCompleteRef.current?.()
        return
      }
      for (let i = 1; i < config.burstCount; i++) {
        const isLast = i === config.burstCount - 1
        const timer = window.setTimeout(() => {
          const v = videoRef.current
          if (v) captureFrame(v, shotId)
          if (isLast) onCompleteRef.current?.()
        }, i * config.burstIntervalMs)
        burstTimersRef.current.push(timer)
      }
    }

    // Manual capture: bypass the gates by jumping the machine straight to
    // "captured" and firing the burst from the current video frame.
    manualTriggerRef.current = () => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || video.videoWidth === 0) return
      ctxRef.current = {
        state: 'captured',
        enteredAt: performance.now(),
        settleStartedAt: null,
        sawMotion: false,
      }
      setState('captured')
      takeBurst(video)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafId)
      burstTimersRef.current.forEach(clearTimeout)
      burstTimersRef.current = []
      manualTriggerRef.current = null
    }
  }, [active, config, videoRef])

  // When inactive, present a clean idle state regardless of the last loop value.
  return {
    state: active ? state : 'idle',
    metrics: active ? metrics : ZERO_METRICS,
    capture,
    retake,
    captureNow,
    roiFraction: config.roiFraction,
  }
}
