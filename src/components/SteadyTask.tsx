import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { SteadyDifficulty, SteadyPunishment } from '../lib/tasks'
import { pick } from '../lib/random'
import { ProceedPanel } from './ProceedPanel'
import { SlideBackdrop } from './SlideBackdrop'
import { catmullRom, nearest, pathLengths, type Pt } from './steadyGeometry'

// Paths in normalised [0,1]×[0,1] space — selected randomly at mount.
const PATHS: Pt[][] = [
  // S-bend
  [[0.05,0.5],[0.18,0.5],[0.28,0.27],[0.42,0.27],[0.5,0.5],[0.58,0.73],[0.72,0.73],[0.82,0.5],[0.95,0.5]],
  // Z-shape (sharp diagonal)
  [[0.05,0.72],[0.25,0.72],[0.75,0.28],[0.95,0.28]],
  // Crank (right-angle turns)
  [[0.05,0.5],[0.25,0.5],[0.25,0.22],[0.5,0.22],[0.5,0.78],[0.75,0.78],[0.75,0.5],[0.95,0.5]],
  // Sine wave (3 peaks)
  catmullRom([[0.05,0.5],[0.2,0.15],[0.38,0.85],[0.5,0.5],[0.62,0.15],[0.8,0.85],[0.95,0.5]]),
  // Hairpin (U-turn at the right)
  catmullRom([[0.05,0.28],[0.42,0.25],[0.8,0.28],[0.92,0.5],[0.8,0.72],[0.42,0.75],[0.05,0.72]]),
  // Arch (rainbow peak)
  catmullRom([[0.05,0.82],[0.25,0.8],[0.4,0.2],[0.5,0.1],[0.6,0.2],[0.75,0.8],[0.95,0.82]]),
  // River bends (two gentle curves)
  catmullRom([[0.05,0.62],[0.22,0.38],[0.42,0.65],[0.62,0.35],[0.82,0.62],[0.95,0.4]]),
]

// Half-width of the corridor in pixels at each difficulty.
const HALF_PX: Record<SteadyDifficulty, number> = { easy: 40, normal: 24, hard: 13 }

// Draw the path from t=0 to t=progress on an already-open ctx path.
function traceUpTo(ctx: CanvasRenderingContext2D, pts: Pt[], cum: number[], total: number, progress: number) {
  if (progress <= 0 || total === 0) return
  const target = progress * total
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 0; i < pts.length - 1; i++) {
    if (cum[i+1] <= target) {
      ctx.lineTo(pts[i+1][0], pts[i+1][1])
    } else {
      const segLen = cum[i+1] - cum[i]
      const u = segLen === 0 ? 0 : (target - cum[i]) / segLen
      const [ax,ay] = pts[i], [bx,by] = pts[i+1]
      ctx.lineTo(ax + u*(bx-ax), ay + u*(by-ay))
      break
    }
  }
}

// ── component ─────────────────────────────────────────────────────────────────

interface SteadyTaskProps {
  difficulty: SteadyDifficulty
  punishment: SteadyPunishment
  hideDetails: boolean
  slideMs: number | null
  nextLabel: string
  onComplete: (errors: number) => void
}

export function SteadyTask({ difficulty, punishment, hideDetails, slideMs, nextLabel, onComplete }: SteadyTaskProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [done, setDone] = useState(false)

  const progressRef = useRef(0)
  const ptrRef = useRef<Pt>([-1, -1])
  const prevTRef = useRef(-1)  // t along path from the previous frame, -1 = unset
  const activeRef = useRef(false) // true once finger starts near the progress frontier
  const downRef = useRef(false)
  const flashRef = useRef(0)   // ms remaining in punishment flash
  const errorsRef = useRef(0)
  const punishRef = useRef(punishment)
  const doneRef = useRef(false)
  const rafRef = useRef(0)

  useEffect(() => { punishRef.current = punishment }, [punishment])

  useEffect(() => {
    const norm = pick(PATHS)
    progressRef.current = 0
    doneRef.current = false
    flashRef.current = 0
    errorsRef.current = 0
    prevTRef.current = -1
    activeRef.current = false

    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = canvas.clientWidth
      canvas.height = canvas.clientHeight
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let last = performance.now()

    const frame = (now: number) => {
      if (doneRef.current) return
      const dt = Math.min(50, now - last)
      last = now
      if (flashRef.current > 0) flashRef.current = Math.max(0, flashRef.current - dt)

      const W = canvas.width, H = canvas.height
      const px: Pt[] = norm.map(([x,y]) => [x*W, y*H])
      const { total, cum } = pathLengths(px)
      const hw = HALF_PX[difficulty]
      const probeR = Math.max(6, hw * 0.5)
      const wallDist = hw - probeR  // distance at which the probe circle touches the wall

      // ── update ──
      if (downRef.current && ptrRef.current[0] >= 0) {
        const [qx, qy] = ptrRef.current
        const { t, dist } = nearest(px, cum, total, qx, qy)
        if (dist > wallDist) {
          if (flashRef.current <= 0) {
            errorsRef.current++
            flashRef.current = 500
            prevTRef.current = -1
            activeRef.current = false
            const p = punishRef.current
            if (p.mode === 'reset') {
              progressRef.current = 0
            } else {
              progressRef.current = Math.max(0, progressRef.current - p.percent / 100)
            }
          }
        } else if (total > 0) {
          // Only count movement once the finger starts within wallDist pixels of the frontier.
          // This prevents clicking ahead and filling progress from the wrong position.
          if (!activeRef.current && Math.abs(t - progressRef.current) * total <= wallDist) {
            activeRef.current = true
            prevTRef.current = t
          }
          if (activeRef.current) {
            const prevT = prevTRef.current
            const dt = prevT < 0 ? 0 : t - prevT
            prevTRef.current = t
            if (dt > 0 && t > progressRef.current) {
              progressRef.current = Math.min(t, progressRef.current + dt)
              if (progressRef.current >= 0.99) {
                doneRef.current = true
                setDone(true)
                return
              }
            }
          }
        }
      }

      // ── render ──
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, W, H)
      const cs = getComputedStyle(canvas)
      const borderCol = cs.getPropertyValue('--border').trim() || '#e8dede'
      const accentCol = cs.getPropertyValue('--accent').trim() || '#c41c2a'
      const textCol   = cs.getPropertyValue('--text').trim()   || '#4a3335'
      const passCol   = cs.getPropertyValue('--pass').trim()   || '#16a34a'

      const strokePath = (color: string, lw: number, dash: number[] = []) => {
        ctx.beginPath()
        ctx.moveTo(px[0][0], px[0][1])
        for (let i = 1; i < px.length; i++) ctx.lineTo(px[i][0], px[i][1])
        ctx.strokeStyle = color
        ctx.lineWidth = lw
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.setLineDash(dash)
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Corridor background
      strokePath(borderCol, hw * 2)

      // Progress fill
      if (progressRef.current > 0) {
        ctx.beginPath()
        traceUpTo(ctx, px, cum, total, progressRef.current)
        ctx.strokeStyle = accentCol + 'aa'
        ctx.lineWidth = hw * 2 - 6
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      // Centre dotted guide
      strokePath(textCol + '44', 1.5, [6, 8])

      // Start / end markers
      const markerR = Math.max(8, hw * 0.65)
      const dot = ([x, y]: Pt, color: string) => {
        ctx.beginPath()
        ctx.arc(x, y, markerR, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }
      dot(px[0], passCol)
      dot(px[px.length - 1], accentCol)

      // Probe (while dragging)
      if (downRef.current && ptrRef.current[0] >= 0) {
        const [qx, qy] = ptrRef.current
        ctx.beginPath()
        ctx.arc(qx, qy, probeR, 0, Math.PI * 2)
        ctx.fillStyle = flashRef.current > 0 ? accentCol : passCol
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Punishment flash overlay
      if (flashRef.current > 0) {
        ctx.fillStyle = `rgba(196,28,42,${(flashRef.current / 500) * 0.22})`
        ctx.fillRect(0, 0, W, H)
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect() }
  }, [difficulty])

  const getPos = (e: ReactPointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  if (done) return <ProceedPanel title="Steady" nextLabel={nextLabel} onComplete={() => onComplete(errorsRef.current)} />

  const punishNote = punishment.mode === 'reset'
    ? 'touch the walls and you restart'
    : `touch the walls and lose ${punishment.percent}%`

  return (
    <div className="steady-arena">
      <SlideBackdrop slideMs={slideMs} />
      <canvas
        ref={canvasRef}
        className="steady-canvas"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); ptrRef.current = getPos(e); prevTRef.current = -1; activeRef.current = false; downRef.current = true }}
        onPointerMove={(e) => { if (downRef.current) ptrRef.current = getPos(e) }}
        onPointerUp={() => { downRef.current = false; activeRef.current = false }}
        onPointerCancel={() => { downRef.current = false; activeRef.current = false }}
      />
      <p className="hold-caption">
        Trace the path from start to end without touching the walls
        {!hideDetails && <> — {punishNote}</>}.
      </p>
    </div>
  )
}
