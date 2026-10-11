import { useEffect, useRef, useState } from 'react'
import type { FaceDetector } from '@mediapipe/tasks-vision'
import { useCamera } from '../hooks/useCamera'
import { getFaceDetector } from '../lib/faceDetector'
import { meanAbsDiff, toGrayscale, type GrayFrame } from '../lib/imageMetrics'
import {
  FOCUS_MOTION_LIMIT,
  applyPunishment,
  penaltyLabel,
  type FocusSensitivity,
  type Punishment,
} from '../lib/tasks'
import { formatRemaining } from '../lib/time'
import { ProceedPanel } from './ProceedPanel'
import { Slideshow } from './Slideshow'

interface FocusTaskProps {
  durationMs: number
  /** Hide the target duration (random + hide-random). */
  hideTimer: boolean
  /** Hide punishment description and other non-essential details. */
  hideDetails: boolean
  punishment: Punishment
  sensitivity: FocusSensitivity
  requireFace: boolean
  requireTabFocus: boolean
  /** Show the live camera feed instead of hiding it behind the slideshow. */
  showCamera: boolean
  /** Optional background slideshow; null = no slideshow (plain background). */
  slideMs: number | null
  nextLabel: string
  onComplete: (errors: number) => void
}

const ANALYSIS_W = 64 // downscaled width for cheap motion analysis
const SAMPLE_MS = 100 // ~10 Hz

/**
 * Webcam hold-still task: turns on the camera (hidden), shows a slideshow, and
 * charges while you stay still + (optionally) present + (optionally) tab-focused.
 * Failure transitions trigger the configured punishment (reset or subtract).
 */
export function FocusTask({
  durationMs,
  hideTimer,
  hideDetails,
  punishment,
  sensitivity,
  requireFace,
  requireTabFocus,
  showCamera,
  slideMs,
  nextLabel,
  onComplete,
}: FocusTaskProps) {
  const { videoRef, status, error, resolvedFacingMode, start, stop } = useCamera({ facingMode: 'user' })
  const mirrorCam = resolvedFacingMode !== 'environment'
  const [progress, setProgress] = useState(0)
  const [level, setLevel] = useState(0) // current movement, 0..1 (0.5 = the limit)
  const [still, setStill] = useState(true)
  const [present, setPresent] = useState(true)
  const [focused, setFocused] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden && document.hasFocus(),
  )
  const [faceStatus, setFaceStatus] = useState<'loading' | 'ready' | 'unavailable'>(() =>
    requireFace ? 'loading' : 'unavailable',
  )
  const [done, setDone] = useState(false)

  const accRef = useRef(0)
  const lastRef = useRef(0)
  const prevRef = useRef<GrayFrame | null>(null)
  const smoothRef = useRef(0)
  const detectorRef = useRef<FaceDetector | null>(null)
  const wasChargingRef = useRef(false)
  const doneRef = useRef(false)
  // Capture the latest punishment for the rAF closure without re-creating it.
  const punishmentRef = useRef(punishment)
  const errorsRef = useRef(0)
  useEffect(() => {
    punishmentRef.current = punishment
  }, [punishment])

  const motionLimit = FOCUS_MOTION_LIMIT[sensitivity]

  useEffect(() => {
    start()
  }, [start])

  // Load the face detector once (for presence). If it can't load, fall back to
  // stillness-only so the user is never locked out. Skipped entirely when the
  // task isn't configured to require a face.
  useEffect(() => {
    if (!requireFace) return
    let cancelled = false
    getFaceDetector()
      .then((d) => {
        if (cancelled) return
        detectorRef.current = d
        setFaceStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setFaceStatus('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [requireFace])

  useEffect(() => {
    if (status !== 'ready') return
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    prevRef.current = null
    smoothRef.current = 0
    wasChargingRef.current = false
    lastRef.current = performance.now()

    const id = setInterval(() => {
      if (doneRef.current) return
      const now = performance.now()
      const dt = Math.min(250, now - lastRef.current)
      lastRef.current = now

      const isFocused = requireTabFocus ? !document.hidden && document.hasFocus() : true
      setFocused(isFocused)

      const video = videoRef.current
      const videoReady = !!(video && video.videoWidth)
      let raw = 0
      if (videoReady && ctx) {
        const w = ANALYSIS_W
        const h = Math.max(1, Math.round((ANALYSIS_W * video.videoHeight) / video.videoWidth))
        canvas.width = w
        canvas.height = h
        ctx.drawImage(video, 0, 0, w, h)
        const gray = toGrayscale(ctx.getImageData(0, 0, w, h))
        if (prevRef.current) raw = meanAbsDiff(prevRef.current, gray)
        prevRef.current = gray
      }

      // Presence: only check when required (and the tab is focused — model would
      // be running on a paused/stale video otherwise).
      let isPresent = true
      if (requireFace && isFocused && detectorRef.current && videoReady) {
        try {
          isPresent = detectorRef.current.detectForVideo(video, now).detections.length > 0
        } catch {
          isPresent = true
        }
      }

      // Smoothed motion gate: sensor noise can't punish, but real motion does.
      smoothRef.current = smoothRef.current * 0.5 + raw * 0.5
      const isStill = smoothRef.current <= motionLimit
      setStill(isStill)
      setPresent(isPresent)
      setLevel(Math.min(1, smoothRef.current / (motionLimit * 2)))

      const charging = isStill && isPresent && isFocused
      const wasCharging = wasChargingRef.current
      if (charging) {
        accRef.current += dt
      } else if (wasCharging) {
        errorsRef.current++
        accRef.current = applyPunishment(accRef.current, punishmentRef.current)
      }
      wasChargingRef.current = charging

      const p = Math.min(1, accRef.current / durationMs)
      setProgress(p)
      if (p >= 1) {
        doneRef.current = true
        clearInterval(id)
        stop()
        setDone(true)
      }
    }, SAMPLE_MS)

    return () => clearInterval(id)
  }, [status, durationMs, videoRef, stop, motionLimit, requireFace, requireTabFocus])

  if (done) return <ProceedPanel title="Held still" nextLabel={nextLabel} onComplete={() => onComplete(errorsRef.current)} />

  const charging = still && present && focused
  const lossLabel = punishment.mode === 'penalty' ? penaltyLabel(punishment) : null
  const status_ = requireTabFocus && !focused
    ? 'Tab not focused — return to the page'
    : requireFace && faceStatus === 'ready' && !present
      ? 'No face detected — stay in frame'
      : !still
        ? lossLabel && !hideDetails
          ? `Too much motion — forfeit ${lossLabel}`
          : 'Too much motion — penalised'
        : 'Holding still'

  return (
    <div className="focus-arena">
      {/* The video element is always mounted so motion + face detection keep
          running. When showCamera is off, it's clipped to a 1px sliver and the
          slideshow takes the visible area. */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={
          showCamera
            ? `focus-cam-visible${mirrorCam ? ' mirrored' : ''}`
            : 'focus-cam-hidden'
        }
      />
      {status === 'ready' && !showCamera && slideMs !== null && <Slideshow slideMs={slideMs} />}
      {status !== 'ready' && (
        <div className="focus-cam-cover">
          {status === 'requesting' ? (
            <p>Starting camera…</p>
          ) : status === 'denied' || status === 'error' ? (
            <>
              <p className="camera-error">{error}</p>
              <button type="button" className="primary" onClick={start}>
                Try again
              </button>
            </>
          ) : (
            <p>Camera off</p>
          )}
        </div>
      )}

      <div className={`focus-overlay${charging ? '' : ' alert'}`}>
        <h2>Hold still</h2>
        {!hideDetails && (
          <p className="panel-note">
            Stay on camera{requireFace ? ', keep your face in frame,' : ''} hold still
            {requireTabFocus ? ", and don't leave the tab" : ''} — any of those{' '}
            {punishment.mode === 'reset' ? 'resets the timer' : `forfeits ${lossLabel}`}.
          </p>
        )}
        {/* Live movement meter: stay UNDER the marker — crossing it punishes you. */}
        <div className="focus-meter">
          <div className={`focus-meter-fill${still ? ' ok' : ''}`} style={{ width: `${level * 100}%` }} />
          <div className="focus-meter-min" />
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="unlock-preview">
          {status_}
          {!hideTimer && ` · ${formatRemaining(durationMs)} total`}
          {requireFace && faceStatus === 'loading' && ' · loading presence check…'}
          {requireFace && faceStatus === 'unavailable' && ' · presence check unavailable'}
        </p>
      </div>
    </div>
  )
}
