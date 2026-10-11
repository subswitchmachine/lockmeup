import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { applyPunishment, penaltyLabel, type Punishment } from '../lib/tasks'
import { formatRemaining } from '../lib/time'
import { accentRing } from '../lib/ui'
import { ProceedPanel } from './ProceedPanel'
import { SlideBackdrop } from './SlideBackdrop'

interface TapTaskProps {
  durationMs: number
  hideTimer: boolean
  /** Hide punishment description and other non-essential details. */
  hideDetails: boolean
  punishment: Punishment
  intervalMs: number
  windowMs: number
  slideMs: number | null
  nextLabel: string
  onComplete: (errors: number) => void
}

/**
 * A button pops up at a random position every `intervalMs`. Tap it within
 * `windowMs` or the configured punishment is applied. Overall progress fills
 * over `durationMs` — the task completes when the bar is full.
 */
export function TapTask({
  durationMs,
  hideTimer,
  hideDetails,
  punishment,
  intervalMs,
  windowMs,
  slideMs,
  nextLabel,
  onComplete,
}: TapTaskProps) {
  const arenaRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLDivElement>(null)
  const progressFillRef = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)

  const accRef = useRef(0)
  const lastRef = useRef(0)
  const doneRef = useRef(false)
  const rafRef = useRef(0)
  const punishmentRef = useRef(punishment)
  const errorsRef = useRef(0)
  const btnActiveRef = useRef(false)
  const btnDeadlineRef = useRef(0)
  const nextSpawnRef = useRef(0)

  useEffect(() => {
    punishmentRef.current = punishment
  }, [punishment])

  useEffect(() => {
    const arena = arenaRef.current
    if (!arena) return
    const now = performance.now()
    lastRef.current = now
    accRef.current = 0
    doneRef.current = false
    btnActiveRef.current = false
    nextSpawnRef.current = now + intervalMs * (0.5 + Math.random() * 0.5)

    const R = 32

    const spawnBtn = (t: number) => {
      const b = arena.getBoundingClientRect()
      const x = R + Math.random() * (b.width - R * 2)
      const y = R + Math.random() * (b.height - R * 2)
      const btn = btnRef.current
      if (btn) {
        btn.style.display = 'block'
        btn.style.transform = `translate(${x - R}px, ${y - R}px)`
        btn.style.background = accentRing(360)
      }
      btnDeadlineRef.current = t + windowMs
      btnActiveRef.current = true
    }

    const frame = (t: number) => {
      if (doneRef.current) return
      const dt = Math.min(50, t - lastRef.current)
      lastRef.current = t
      accRef.current += dt

      if (btnActiveRef.current) {
        const remaining = btnDeadlineRef.current - t
        if (remaining <= 0) {
          errorsRef.current++
          accRef.current = applyPunishment(accRef.current, punishmentRef.current)
          btnActiveRef.current = false
          const btn = btnRef.current
          if (btn) btn.style.display = 'none'
          nextSpawnRef.current = t + intervalMs
        } else {
          const frac = remaining / windowMs
          const btn = btnRef.current
          if (btn)
            btn.style.background = accentRing(frac * 360)
        }
      } else if (t >= nextSpawnRef.current) {
        spawnBtn(t)
      }

      const prog = Math.min(1, accRef.current / durationMs)
      const fill = progressFillRef.current
      if (fill) fill.style.width = `${prog * 100}%`

      if (prog >= 1) {
        doneRef.current = true
        setDone(true)
        return
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [durationMs, intervalMs, windowMs])

  const handleTap = (e: ReactPointerEvent) => {
    e.stopPropagation()
    if (!btnActiveRef.current) return
    btnActiveRef.current = false
    const btn = btnRef.current
    if (btn) btn.style.display = 'none'
    nextSpawnRef.current = performance.now() + intervalMs
  }

  if (done) return <ProceedPanel title="Done" nextLabel={nextLabel} onComplete={() => onComplete(errorsRef.current)} />

  const punishmentNote =
    punishment.mode === 'reset'
      ? 'miss one and the timer resets'
      : `miss one and forfeit ${penaltyLabel(punishment)}`

  return (
    <div ref={arenaRef} className="tap-arena">
      <SlideBackdrop slideMs={slideMs} />
      <p className="hold-caption">
        Tap the circle when it appears
        {!hideDetails && <> — {punishmentNote}</>}.
        {!hideTimer && <> Hold out for {formatRemaining(durationMs)}.</>}
      </p>
      <div className="tap-progress">
        <div ref={progressFillRef} className="tap-progress-fill" />
      </div>
      <div ref={btnRef} className="tap-button" style={{ display: 'none' }} onPointerDown={handleTap} />
    </div>
  )
}
