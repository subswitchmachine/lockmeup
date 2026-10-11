import { useContext, useEffect, useState } from 'react'
import { pickRandomImage, type PuzzleImage } from '../lib/puzzleImages'
import { PoolsContext } from '../lib/poolsContext'

interface SlideshowProps {
  /** Image rotation interval, ms. */
  slideMs: number
  className?: string
}

/**
 * Cycles through random bundled images at `slideMs` intervals. Reused by the
 * timed tasks (wait/hold/focus) when their slideshow option is enabled. Pools
 * are picked up from the nearest `PoolsProvider`.
 */
export function Slideshow({ slideMs, className = 'focus-slide' }: SlideshowProps) {
  const pools = useContext(PoolsContext)
  const [slide, setSlide] = useState<PuzzleImage>(() => pickRandomImage(pools))
  useEffect(() => {
    const id = setInterval(() => setSlide(pickRandomImage(pools)), slideMs)
    return () => clearInterval(id)
  }, [slideMs, pools])
  return <img key={slide.id} className={className} src={slide.url} alt="" />
}
