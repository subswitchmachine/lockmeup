import { useRef, useState } from 'react'
import { imageUrl } from '../lib/puzzleImages'
import { shuffle } from '../lib/random'
import { ProceedPanel } from './ProceedPanel'

interface MemoryTaskProps {
  imageIds: string[] // one per pair
  /** How long mismatched cards stay flipped before turning back. */
  mismatchMs: number
  /** Forced pause after each guess before the next flip is allowed (0 = off). */
  guessDelayMs: number
  nextLabel: string
  onComplete: (errors: number) => void
}

interface Card {
  key: number
  imageId: string
}

/** Flip cards two at a time; matching pairs stay revealed. */
export function MemoryTask({ imageIds, mismatchMs, guessDelayMs, nextLabel, onComplete }: MemoryTaskProps) {
  const errorsRef = useRef(0)
  // Built once at mount (the component is remounted per task via its key).
  const [deck] = useState<Card[]>(() => {
    const cards = imageIds.flatMap((id, i) => [
      { key: i * 2, imageId: id },
      { key: i * 2 + 1, imageId: id },
    ])
    shuffle(cards)
    return cards
  })

  const [flipped, setFlipped] = useState<number[]>([]) // deck indices currently face-up & unmatched
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // Forced-wait indicator: `id` restarts the bar animation, `ms` sets its duration.
  const [pause, setPause] = useState<{ id: number; ms: number } | null>(null)
  const pauseId = useRef(0)

  const startPause = () => {
    pauseId.current++
    setPause({ id: pauseId.current, ms: guessDelayMs })
  }

  if (matched.size === imageIds.length) {
    return <ProceedPanel title="All matched" nextLabel={nextLabel} onComplete={() => onComplete(errorsRef.current)} />
  }

  const flip = (i: number) => {
    if (busy || flipped.includes(i) || matched.has(deck[i].imageId)) return
    const next = [...flipped, i]
    setFlipped(next)
    if (next.length === 2) {
      const [a, b] = next
      if (deck[a].imageId === deck[b].imageId) {
        setMatched((m) => new Set(m).add(deck[a].imageId))
        setFlipped([])
      } else {
        errorsRef.current++
        setBusy(true)
        // Mismatched cards flip back, then the forced wait runs before the next guess.
        setTimeout(() => setFlipped([]), mismatchMs)
        if (guessDelayMs > 0) setTimeout(startPause, mismatchMs)
        setTimeout(() => {
          setBusy(false)
          setPause(null)
        }, mismatchMs + guessDelayMs)
      }
    }
  }

  const cols = Math.ceil(Math.sqrt(deck.length))
  const rows = Math.ceil(deck.length / cols)

  return (
    <div className="memory">
      {pause && (
        <div className="memory-pause" key={pause.id}>
          <span>Wait…</span>
          <div className="memory-pause-track">
            <div className="memory-pause-bar" style={{ animationDuration: `${pause.ms}ms` }} />
          </div>
        </div>
      )}
      <div
        className="memory-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          '--cols': cols,
          '--rows': rows,
        } as React.CSSProperties}
      >
        {deck.map((card, i) => {
          const faceUp = flipped.includes(i) || matched.has(card.imageId)
          return (
            <button
              key={card.key}
              type="button"
              className={`memory-card${faceUp ? ' up' : ''}`}
              onClick={() => flip(i)}
            >
              {faceUp ? (
                <img src={imageUrl(card.imageId)} alt="" />
              ) : (
                <span className="memory-back">?</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
