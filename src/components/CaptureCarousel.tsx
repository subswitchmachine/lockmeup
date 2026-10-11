import { useState } from 'react'
import type { CaptureFrame } from '../hooks/useAutoCapture'

interface CaptureCarouselProps {
  frames: CaptureFrame[]
  /** Show the clear frames; otherwise the combo stays blurred. */
  revealed?: boolean
}

/** Full-stage view of a capture's frames with prev/next navigation. */
export function CaptureCarousel({ frames, revealed = false }: CaptureCarouselProps) {
  const [index, setIndex] = useState(0)
  const count = frames.length
  const current = ((index % count) + count) % count
  const frame = frames[current]

  const go = (delta: number) => setIndex((i) => i + delta)

  return (
    <div className="carousel">
      <img
        src={revealed ? frame.dataUrl : frame.blurredDataUrl}
        alt={`Frame ${current + 1} of ${count}${revealed ? '' : ', combo blurred'}`}
      />
      {count > 1 && (
        <>
          <button
            type="button"
            className="carousel-arrow prev"
            onClick={() => go(-1)}
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            className="carousel-arrow next"
            onClick={() => go(1)}
            aria-label="Next image"
          >
            ›
          </button>
          <div className="carousel-dots">
            {frames.map((_, i) => (
              <span key={i} className={i === current ? 'dot active' : 'dot'} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
