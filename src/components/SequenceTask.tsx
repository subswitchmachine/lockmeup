import { useEffect, useRef, useState } from 'react'
import { imageUrl } from '../lib/puzzleImages'
import type { SequencePunishment } from '../lib/tasks'
import { ProceedPanel } from './ProceedPanel'

interface SequenceTaskProps {
  imageIds: string[]
  startLength: number
  targetLength: number
  flashMs: number
  punishment: SequencePunishment
  /** Hide target length and other non-essential details. */
  hideDetails: boolean
  nextLabel: string
  onComplete: (errors: number) => void
}

type Phase = 'showing' | 'input' | 'wrong'

/**
 * Simon-style image sequence task. A sequence of tiles flashes; repeat it by
 * clicking. Each correct round extends the sequence by one. Wrong clicks
 * trigger the configured punishment.
 */
export function SequenceTask({
  imageIds,
  startLength,
  targetLength,
  flashMs,
  punishment,
  hideDetails,
  nextLabel,
  onComplete,
}: SequenceTaskProps) {
  // Full sequence pre-generated at mount — grows by revealing more of it each round.
  const [fullSeq] = useState<number[]>(() =>
    Array.from({ length: targetLength }, () => Math.floor(Math.random() * imageIds.length)),
  )

  const [phase, setPhase] = useState<Phase>('showing')
  const [currentLength, setCurrentLength] = useState(startLength)
  const [done, setDone] = useState(false)
  const [highlight, setHighlight] = useState<number | null>(null)
  const [wrongTile, setWrongTile] = useState<number | null>(null)
  const [correctTile, setCorrectTile] = useState<number | null>(null)
  const [inputPos, setInputPos] = useState(0)
  const correctTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const punishmentRef = useRef(punishment)
  const errorsRef = useRef(0)
  const startLengthRef = useRef(startLength)
  useEffect(() => {
    punishmentRef.current = punishment
    startLengthRef.current = startLength
  }, [punishment, startLength])

  // Animate the current sequence, then hand control to the user.
  useEffect(() => {
    if (phase !== 'showing') return
    const seq = fullSeq.slice(0, currentLength)
    const ids: ReturnType<typeof setTimeout>[] = []

    let t = 500
    for (const tileIdx of seq) {
      ids.push(setTimeout(() => setHighlight(tileIdx), t))
      t += flashMs
      ids.push(setTimeout(() => setHighlight(null), t))
      t += 200
    }
    ids.push(
      setTimeout(() => {
        setInputPos(0)
        setPhase('input')
      }, t),
    )

    return () => ids.forEach(clearTimeout)
  }, [phase, currentLength, flashMs, fullSeq])

  // Brief wrong-tile feedback, then apply punishment and replay.
  useEffect(() => {
    if (phase !== 'wrong') return
    const id = setTimeout(() => {
      const p = punishmentRef.current
      setCurrentLength((prev) =>
        p.mode === 'reset'
          ? startLengthRef.current
          : Math.max(startLengthRef.current, prev - p.steps),
      )
      setWrongTile(null)
      setInputPos(0)
      setPhase('showing')
    }, 900)
    return () => clearTimeout(id)
  }, [phase])

  const handleTile = (tileIdx: number) => {
    if (phase !== 'input') return
    if (tileIdx === fullSeq[inputPos]) {
      if (correctTimerRef.current) clearTimeout(correctTimerRef.current)
      setCorrectTile(tileIdx)
      correctTimerRef.current = setTimeout(() => setCorrectTile(null), 220)

      const nextPos = inputPos + 1
      if (nextPos === currentLength) {
        if (currentLength === targetLength) {
          setDone(true)
        } else {
          setCurrentLength((n) => n + 1)
          setPhase('showing')
        }
      } else {
        setInputPos(nextPos)
      }
    } else {
      if (correctTimerRef.current) clearTimeout(correctTimerRef.current)
      setCorrectTile(null)
      errorsRef.current++
      setWrongTile(tileIdx)
      setPhase('wrong')
    }
  }

  if (done) return <ProceedPanel title="Complete" nextLabel={nextLabel} onComplete={() => onComplete(errorsRef.current)} />

  const cols = Math.ceil(Math.sqrt(imageIds.length))
  const rows = Math.ceil(imageIds.length / cols)

  return (
    <div className="sequence-task">
      <div className="sequence-header">
        <span className="sequence-status-msg">
          {phase === 'showing' && 'Watch carefully…'}
          {phase === 'input' && `Repeat the sequence (${inputPos} / ${currentLength})`}
          {phase === 'wrong' && <span className="sequence-wrong-msg">Wrong!</span>}
        </span>
        <span className="sequence-progress">
          {currentLength}{!hideDetails && ` / ${targetLength}`}
        </span>
      </div>
      <div className="sequence-grid-wrap">
      <div
        className="sequence-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, aspectRatio: `${cols} / ${rows}` }}
      >
        {imageIds.map((id, i) => (
          <button
            key={id}
            type="button"
            className={[
              'sequence-tile',
              highlight === i ? 'seq-lit' : '',
              correctTile === i ? 'seq-correct' : '',
              wrongTile === i ? 'seq-wrong' : '',
            ]
              .join(' ')
              .trim()}
            onPointerDown={() => handleTile(i)}
            disabled={phase !== 'input'}
          >
            <img src={imageUrl(id)} alt="" draggable={false} />
          </button>
        ))}
      </div>
      </div>
    </div>
  )
}
