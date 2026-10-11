import { Slideshow } from './Slideshow'

/**
 * Background slideshow for a timed task, or nothing when disabled (`slideMs`
 * null). Centralises the `hold-slide` backdrop convention shared by the hold,
 * tap, and steady tasks.
 */
export function SlideBackdrop({ slideMs }: { slideMs: number | null }) {
  if (slideMs === null) return null
  return <Slideshow slideMs={slideMs} className="hold-slide" />
}
