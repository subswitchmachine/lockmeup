import { useRef, useState } from 'react'
import { randInt } from '../lib/random'
import { ProceedPanel } from './ProceedPanel'
import { Slideshow } from './Slideshow'

interface TypingTaskProps {
  line: string
  reps: number
  minPenaltyReps: number
  maxPenaltyReps: number
  /** Hide the rep count (shown as progress bar instead). */
  hideTimer: boolean
  /** Hide the penalty amount on mistake flash. */
  hideDetails: boolean
  slideMs: number | null
  nextLabel: string
  onComplete: (errors: number) => void
}

/**
 * Type a given line exactly, N times in a row. Any wrong character instantly
 * clears the input and adds a (re-rolled) penalty repetitions.
 */
export function TypingTask({ line, reps, minPenaltyReps, maxPenaltyReps, hideTimer, hideDetails, slideMs, nextLabel, onComplete }: TypingTaskProps) {
  const [value, setValue] = useState('')
  const [remaining, setRemaining] = useState(reps)
  const [done, setDone] = useState(false)
  const [mistakeKey, setMistakeKey] = useState(0)
  const [lastPenalty, setLastPenalty] = useState(0)
  const errorsRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  if (done) return <ProceedPanel title="Done" nextLabel={nextLabel} onComplete={() => onComplete(errorsRef.current)} />

  if (!line) {
    return (
      <div className="panel locked-panel">
        <p className="panel-note">No line configured for this task.</p>
      </div>
    )
  }

  const handleChange = (newVal: string) => {
    for (let i = 0; i < newVal.length; i++) {
      if (newVal[i] !== line[i]) {
        const penalty = randInt(minPenaltyReps, maxPenaltyReps)
        errorsRef.current++
        setLastPenalty(penalty)
        setMistakeKey((k) => k + 1)
        if (penalty > 0) setRemaining((r) => r + penalty)
        setValue('')
        return
      }
    }
    if (newVal === line) {
      const next = remaining - 1
      if (next <= 0) {
        setDone(true)
      } else {
        setRemaining(next)
        setValue('')
        inputRef.current?.focus()
      }
    } else {
      setValue(newVal)
    }
  }

  const panel = (
    <div className="panel locked-panel typing-task">
      <h2>Write the line</h2>
      <div className="typing-reps">
        {hideTimer ? (
          <div className="typing-progress-track">
            <div
              className="typing-progress-fill"
              style={{ width: `${((reps - remaining) / reps) * 100}%` }}
            />
          </div>
        ) : (
          <>{remaining} {remaining === 1 ? 'rep' : 'reps'} remaining</>
        )}
        {maxPenaltyReps > 0 && mistakeKey > 0 && (
          <span key={mistakeKey} className="typing-penalty-flash">
            {hideDetails ? '!' : `+${lastPenalty}`}
          </span>
        )}
      </div>
      <p className="typing-target">
        {line.split('').map((ch, i) => {
          const typed = value[i]
          const cls = typed == null ? 'pending' : typed === ch ? 'ok' : 'bad'
          return (
            <span key={i} className={`typing-char ${cls}`}>
              {ch}
            </span>
          )
        })}
      </p>
      <input
        ref={inputRef}
        type="text"
        className="typing-input"
        value={value}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => handleChange(e.target.value)}
        onPaste={(e) => e.preventDefault()}
        placeholder="Type here…"
      />
    </div>
  )

  if (slideMs !== null) {
    return (
      <div className="typing-arena">
        <Slideshow slideMs={slideMs} className="hold-slide" />
        <div className="typing-slide-overlay">{panel}</div>
      </div>
    )
  }

  return panel
}
