import type { TaskSpec } from '../lib/tasks'
import { trustedNow } from '../lib/trustedTime'
import { useNow } from '../hooks/useNow'
import { FocusTask } from './FocusTask'
import { HoldTask } from './HoldTask'
import { TapTask } from './TapTask'
import { SequenceTask } from './SequenceTask'
import { JigsawTask2 } from './JigsawTask2'
import { LockedPanel } from './LockedPanel'
import { MemoryTask } from './MemoryTask'
import { ProceedPanel } from './ProceedPanel'
import { Slideshow } from './Slideshow'
import { SlidingTask } from './SlidingTask'
import { SteadyTask } from './SteadyTask'
import { TypingTask } from './TypingTask'
import { useState } from 'react'

interface PreviewScreenProps {
  spec: TaskSpec
  onExit: () => void
}

/**
 * Try a single task without locking anything. Mirrors the full-screen layout of
 * the locked puzzle screen, with a "Back" button that returns to the builder.
 * Completing the task also exits.
 */
export function PreviewScreen({ spec, onExit }: PreviewScreenProps) {
  return (
    <div className="puzzle-screen">
      <header className="puzzle-topbar">
        <div className="puzzle-topbar-left">
          <button type="button" onClick={onExit} className="puzzle-topbar-back">
            ← Back
          </button>
        </div>
        <div className="puzzle-topbar-center">
          <span className="puzzle-topbar-step">Preview</span>
        </div>
        <div className="puzzle-topbar-right" />
      </header>
      <main className="puzzle-stage">
        <PreviewBody spec={spec} onExit={onExit} />
      </main>
    </div>
  )
}

function PreviewBody({ spec, onExit }: { spec: TaskSpec; onExit: () => void }) {
  const nextLabel = 'Done'
  // Only the timed wait task needs `now`/`timeVerified` — hold/focus tick
  // internally on the local clock. Ticking is harmless for the others.
  const tick = useNow(true)
  const now = trustedNow() ?? tick

  switch (spec.kind) {
    case 'jigsaw':
      return (
        <JigsawTask2
          imageId={spec.imageId}
          pieces={spec.pieces}
          rotate={spec.rotate ?? false}
          nextLabel={nextLabel}
          onComplete={onExit}
        />
      )
    case 'sliding':
      return (
        <div className="task-runner">
          <SlidingTask
            imageId={spec.imageId}
            size={spec.size}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
    case 'memory':
      return (
        <div className="task-runner">
          <MemoryTask
            imageIds={spec.imageIds}
            mismatchMs={spec.mismatchMs}
            guessDelayMs={spec.guessDelayMs ?? 0}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
    case 'typing':
      return (
        <div className="task-runner">
          <TypingTask line={spec.line} reps={spec.reps} minPenaltyReps={spec.minPenaltyReps} maxPenaltyReps={spec.maxPenaltyReps} hideTimer={false} hideDetails={false} slideMs={spec.slideMs} nextLabel={nextLabel} onComplete={onExit} />
        </div>
      )
    case 'wait':
      return (
        <div className="task-runner">
          <PreviewWait
            durationMs={spec.durationMs}
            now={now}
            slideMs={spec.slideMs}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
    case 'hold':
      return (
        <div className="task-runner">
          <HoldTask
            durationMs={spec.durationMs}
            hideTimer={false}
            hideDetails={false}
            punishment={spec.punishment}
            speed={spec.speed}
            size={spec.size}
            slideMs={spec.slideMs}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
    case 'focus':
      return (
        <div className="task-runner">
          <FocusTask
            durationMs={spec.durationMs}
            hideTimer={false}
            hideDetails={false}
            punishment={spec.punishment}
            sensitivity={spec.sensitivity}
            requireFace={spec.requireFace}
            requireTabFocus={spec.requireTabFocus}
            showCamera={spec.showCamera}
            slideMs={spec.slideMs}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
    case 'sequence':
      return (
        <div className="task-runner">
          <SequenceTask
            imageIds={spec.imageIds}
            startLength={spec.startLength}
            targetLength={spec.targetLength}
            flashMs={spec.flashMs}
            punishment={spec.punishment}
            hideDetails={false}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
    case 'tap':
      return (
        <div className="task-runner">
          <TapTask
            durationMs={spec.durationMs}
            hideTimer={false}
            hideDetails={false}
            punishment={spec.punishment}
            intervalMs={spec.intervalMs}
            windowMs={spec.windowMs}
            slideMs={spec.slideMs}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
    case 'steady':
      return (
        <div className="task-runner">
          <SteadyTask
            difficulty={spec.difficulty}
            punishment={spec.punishment}
            hideDetails={false}
            slideMs={spec.slideMs}
            nextLabel={nextLabel}
            onComplete={onExit}
          />
        </div>
      )
  }
}

/** A simplified wait runner for preview (no auto-advance; proceed button once finished). */
function PreviewWait({
  durationMs,
  now,
  slideMs,
  nextLabel,
  onComplete,
}: {
  durationMs: number
  now: number
  slideMs: number | null
  nextLabel: string
  onComplete: () => void
}) {
  const [start] = useState(() => now)
  const unlockAt = start + durationMs
  if (now >= unlockAt) {
    return <ProceedPanel title="Time's up" note="The wait is over." nextLabel={nextLabel} onComplete={onComplete} />
  }
  if (slideMs !== null) {
    return (
      <div className="wait-arena">
        <Slideshow slideMs={slideMs} className="wait-slide" />
        <div className="wait-overlay">
          <LockedPanel unlockAt={unlockAt} now={now} timeVerified={true} hideTimer={false} />
        </div>
      </div>
    )
  }
  return <LockedPanel unlockAt={unlockAt} now={now} timeVerified={true} hideTimer={false} />
}
