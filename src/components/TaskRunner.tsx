import { useEffect, useRef, useState } from 'react'
import type { LockMeta } from '../hooks/useLockbox'
import type { TaskResult } from '../lib/tasks'
import { JigsawTask2 } from './JigsawTask2'
import { SlidingTask } from './SlidingTask'
import { MemoryTask } from './MemoryTask'
import { TypingTask } from './TypingTask'
import { HoldTask } from './HoldTask'
import { FocusTask } from './FocusTask'
import { TapTask } from './TapTask'
import { SequenceTask } from './SequenceTask'
import { SteadyTask } from './SteadyTask'
import { LockedPanel } from './LockedPanel'
import { ProceedPanel } from './ProceedPanel'
import { Slideshow } from './Slideshow'

interface TaskRunnerProps {
  meta: LockMeta
  /** Mark the active task complete and advance the series. */
  onTaskComplete: (result: TaskResult) => Promise<void>
  /** Trusted current time (for `wait` countdowns). */
  now: number
  timeVerified: boolean
}

/**
 * Runs the task series that gates the reveal: renders the current task, and the
 * task signals completion to advance. When every task is done, the parent
 * (useLockbox) decrypts and the revealed view takes over.
 */
export function TaskRunner({ meta, onTaskComplete, now, timeVerified }: TaskRunnerProps) {
  const { tasks, completedCount } = meta
  const current = tasks[completedCount]
  const { hideMode } = meta.options
  const shouldHideTimer = (random: boolean) =>
    hideMode === 'hide-all' || (hideMode === 'hide-random' && random)
  const hideDetails = hideMode === 'hide-all'

  // Track when the current task was mounted so we can report duration. The
  // start is reset in an effect (rather than during render) to keep this
  // component pure — Date.now is a side effect.
  const taskStartRef = useRef(0)
  useEffect(() => {
    taskStartRef.current = Date.now()
  }, [completedCount])

  const handleComplete = (errors: number) => {
    onTaskComplete({
      kind: current.kind,
      durationMs: Date.now() - taskStartRef.current,
      errors,
    })
  }

  if (!current) {
    return (
      <div className="panel locked-panel">
        <h2>Releasing…</h2>
        <p className="panel-note">All tasks complete — your combination is being revealed.</p>
      </div>
    )
  }

  const nextLabel = completedCount === tasks.length - 1 ? 'Unlock' : 'Next task'
  const key = completedCount // fresh mount per task

  switch (current.kind) {
    case 'jigsaw':
      return (
        <JigsawTask2
          key={key}
          imageId={current.imageId}
          pieces={current.pieces}
          rotate={current.rotate ?? false}
          persistKey={`${meta.lockedAt}:${completedCount}`}
          nextLabel={nextLabel}
          onComplete={handleComplete}
        />
      )
    case 'sliding':
      return (
        <div className="task-runner">
          <SlidingTask
            key={key}
            imageId={current.imageId}
            size={current.size}
            assist={current.assist}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'memory':
      return (
        <div className="task-runner">
          <MemoryTask
            key={key}
            imageIds={current.imageIds}
            mismatchMs={current.mismatchMs}
            guessDelayMs={current.guessDelayMs ?? 0}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'typing':
      return (
        <div className="task-runner">
          <TypingTask
            key={key}
            line={current.line}
            reps={current.reps}
            minPenaltyReps={current.minPenaltyReps}
            maxPenaltyReps={current.maxPenaltyReps}
            hideTimer={shouldHideTimer(current.random)}
            hideDetails={hideDetails}
            slideMs={current.slideMs}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'wait':
      return (
        <div className="task-runner">
          <WaitTask
            key={key}
            durationMs={current.durationMs}
            now={now}
            timeVerified={timeVerified}
            hideTimer={shouldHideTimer(current.random)}
            slideMs={current.slideMs}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'hold':
      return (
        <div className="task-runner">
          <HoldTask
            key={key}
            durationMs={current.durationMs}
            hideTimer={shouldHideTimer(current.random)}
            hideDetails={hideDetails}
            punishment={current.punishment}
            speed={current.speed}
            size={current.size}
            slideMs={current.slideMs}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'focus':
      return (
        <div className="task-runner">
          <FocusTask
            key={key}
            durationMs={current.durationMs}
            hideTimer={shouldHideTimer(current.random)}
            hideDetails={hideDetails}
            punishment={current.punishment}
            sensitivity={current.sensitivity}
            requireFace={current.requireFace}
            requireTabFocus={current.requireTabFocus}
            showCamera={current.showCamera}
            slideMs={current.slideMs}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'sequence':
      return (
        <div className="task-runner">
          <SequenceTask
            key={key}
            imageIds={current.imageIds}
            startLength={current.startLength}
            targetLength={current.targetLength}
            flashMs={current.flashMs}
            punishment={current.punishment}
            hideDetails={hideDetails}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'tap':
      return (
        <div className="task-runner">
          <TapTask
            key={key}
            durationMs={current.durationMs}
            hideTimer={shouldHideTimer(current.random)}
            hideDetails={hideDetails}
            punishment={current.punishment}
            intervalMs={current.intervalMs}
            windowMs={current.windowMs}
            slideMs={current.slideMs}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
    case 'steady':
      return (
        <div className="task-runner">
          <SteadyTask
            key={key}
            difficulty={current.difficulty}
            punishment={current.punishment}
            hideDetails={hideDetails}
            slideMs={current.slideMs}
            nextLabel={nextLabel}
            onComplete={handleComplete}
          />
        </div>
      )
  }
}

interface WaitTaskProps {
  durationMs: number
  now: number
  timeVerified: boolean
  hideTimer: boolean
  /** Optional background slideshow; null = no slideshow. */
  slideMs: number | null
  nextLabel: string
  onComplete: (errors: number) => void
}

/**
 * A single timed `wait` step: captures its start at mount and counts down. When
 * the time is up it does not auto-advance — it shows a proceed button so the
 * user moves on deliberately.
 */
function WaitTask({
  durationMs,
  now,
  timeVerified,
  hideTimer,
  slideMs,
  nextLabel,
  onComplete,
}: WaitTaskProps) {
  const [start] = useState(() => now)
  const unlockAt = start + durationMs
  const finished = now >= unlockAt // derived from trusted time — no auto-advance

  if (finished) {
    return <ProceedPanel title="Time's up" note="The wait is over — you may proceed." nextLabel={nextLabel} onComplete={() => onComplete(0)} />
  }

  if (slideMs !== null) {
    return (
      <div className="wait-arena">
        <Slideshow slideMs={slideMs} className="wait-slide" />
        <div className="wait-overlay">
          <LockedPanel unlockAt={unlockAt} now={now} timeVerified={timeVerified} hideTimer={hideTimer} />
        </div>
      </div>
    )
  }

  return (
    <LockedPanel unlockAt={unlockAt} now={now} timeVerified={timeVerified} hideTimer={hideTimer} />
  )
}
