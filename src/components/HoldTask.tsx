import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  HOLD_SIZE_FRACTION,
  HOLD_SPEED_PX_PER_MS,
  applyPunishment,
  penaltyLabel,
  type HoldSize,
  type HoldSpeed,
  type Punishment,
} from '../lib/tasks'
import { formatRemaining } from '../lib/time'
import { accentRing } from '../lib/ui'
import { ProceedPanel } from './ProceedPanel'
import { SlideBackdrop } from './SlideBackdrop'

interface HoldTaskProps {
  durationMs: number
  /** Hide the target duration (random + hide-random). */
  hideTimer: boolean
  /** Hide punishment description and other non-essential details. */
  hideDetails: boolean
  /** What happens when contact is lost. */
  punishment: Punishment
  speed: HoldSpeed
  size: HoldSize
  /** Optional background slideshow; null = no slideshow. */
  slideMs: number | null
  nextLabel: string
  onComplete: (errors: number) => void
}

/**
 * Press and hold a circle that drifts around the play area, keeping the pointer
 * on it as it moves. Charge accumulates only while the pointer is down AND
 * inside the moving circle — a stationary (weighted-down) pointer falls behind
 * and the timer is punished (full reset, or subtract seconds, per `punishment`).
 */
export function HoldTask({
  durationMs,
  hideTimer,
  hideDetails,
  punishment,
  speed,
  size,
  slideMs,
  nextLabel,
  onComplete,
}: HoldTaskProps) {
  const arenaRef = useRef<HTMLDivElement>(null)
  const circleRef = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)

  const pos = useRef({ x: 0, y: 0 })
  const vel = useRef({ x: 0, y: 0 })
  const ptr = useRef({ x: -1e4, y: -1e4 })
  const downRef = useRef(false)
  const accRef = useRef(0)
  const lastRef = useRef(0)
  const steerRef = useRef(0)
  const rafRef = useRef(0)
  const doneRef = useRef(false)
  const wasInsideRef = useRef(false)
  // Capture the latest punishment for the rAF closure without re-creating it.
  const punishmentRef = useRef(punishment)
  const errorsRef = useRef(0)
  useEffect(() => {
    punishmentRef.current = punishment
  }, [punishment])

  // Min and max radius bounds keep the circle reasonable on small/huge screens.
  const radiusBounds = (W: number, H: number, sz: HoldSize) => {
    const min = sz === 'small' ? 18 : sz === 'large' ? 60 : 36
    const max = sz === 'small' ? 46 : sz === 'large' ? 130 : 80
    return Math.max(min, Math.min(max, Math.min(W, H) * HOLD_SIZE_FRACTION[sz]))
  }

  useEffect(() => {
    const arena = arenaRef.current
    if (!arena) return
    const b0 = arena.getBoundingClientRect()
    const v = HOLD_SPEED_PX_PER_MS[speed]
    const angle = Math.random() * Math.PI * 2
    pos.current = { x: b0.width / 2, y: b0.height / 2 }
    vel.current = { x: Math.cos(angle) * v, y: Math.sin(angle) * v }
    lastRef.current = performance.now()
    wasInsideRef.current = false

    const frame = (t: number) => {
      if (doneRef.current) return
      const dt = Math.min(50, t - lastRef.current) // clamp after tab pauses
      lastRef.current = t
      const b = arena.getBoundingClientRect()
      const W = b.width
      const H = b.height
      const r = radiusBounds(W, H, size)

      // Occasionally steer for unpredictability.
      steerRef.current += dt
      if (steerRef.current > 1500) {
        steerRef.current = 0
        const a = Math.atan2(vel.current.y, vel.current.x) + (Math.random() - 0.5) * 0.8
        const sp = Math.hypot(vel.current.x, vel.current.y)
        vel.current = { x: Math.cos(a) * sp, y: Math.sin(a) * sp }
      }

      // Move and bounce off the walls.
      let nx = pos.current.x + vel.current.x * dt
      let ny = pos.current.y + vel.current.y * dt
      if (nx < r) {
        nx = r
        vel.current.x = Math.abs(vel.current.x)
      } else if (nx > W - r) {
        nx = W - r
        vel.current.x = -Math.abs(vel.current.x)
      }
      if (ny < r) {
        ny = r
        vel.current.y = Math.abs(vel.current.y)
      } else if (ny > H - r) {
        ny = H - r
        vel.current.y = -Math.abs(vel.current.y)
      }
      pos.current = { x: nx, y: ny }

      const inside = downRef.current && Math.hypot(ptr.current.x - nx, ptr.current.y - ny) <= r
      const wasInside = wasInsideRef.current
      if (inside) {
        accRef.current += dt
      } else if (wasInside) {
        errorsRef.current++
        accRef.current = applyPunishment(accRef.current, punishmentRef.current)
      }
      wasInsideRef.current = inside

      const prog = Math.min(1, accRef.current / durationMs)

      const c = circleRef.current
      if (c) {
        c.style.width = `${r * 2}px`
        c.style.height = `${r * 2}px`
        c.style.transform = `translate(${nx - r}px, ${ny - r}px)`
        c.style.background = accentRing(prog * 360)
        c.classList.toggle('held', inside)
      }

      if (prog >= 1) {
        doneRef.current = true
        setDone(true)
        return
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [durationMs, speed, size])

  const setPtr = (e: ReactPointerEvent) => {
    const b = arenaRef.current?.getBoundingClientRect()
    if (b) ptr.current = { x: e.clientX - b.left, y: e.clientY - b.top }
  }

  if (done) return <ProceedPanel title="Done" nextLabel={nextLabel} onComplete={() => onComplete(errorsRef.current)} />

  const punishmentNote =
    punishment.mode === 'reset'
      ? 'lose it and the timer resets'
      : `lose contact and forfeit ${penaltyLabel(punishment)}`

  return (
    <div
      ref={arenaRef}
      className="hold-arena"
      onPointerDown={(e) => {
        setPtr(e)
        downRef.current = true
      }}
      onPointerMove={setPtr}
      onPointerUp={() => (downRef.current = false)}
      onPointerLeave={() => (downRef.current = false)}
      onPointerCancel={() => (downRef.current = false)}
    >
      <SlideBackdrop slideMs={slideMs} />
      <p className="hold-caption">
        Follow the circle — keep contact
        {!hideDetails && <> — {punishmentNote}</>}.
        {!hideTimer && <> Hold for {formatRemaining(durationMs)}.</>}
      </p>
      <div ref={circleRef} className="hold-circle" />
    </div>
  )
}
