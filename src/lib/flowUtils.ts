/** Shared helpers + types for the flow builder / task editor. */
import { flushSync } from 'react-dom'

export interface RowCtrl {
  onUp?: () => void
  onDown?: () => void
  onRemove: () => void
}

/** Swap element `index` with its neighbour in direction `dir` (immutably). */
export function move<T>(arr: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir
  if (j < 0 || j >= arr.length) return arr
  const copy = arr.slice()
  ;[copy[index], copy[j]] = [copy[j], copy[index]]
  return copy
}

/**
 * Force React to commit any in-flight input state before the caller reads
 * state. Two cases this handles:
 *
 * 1. The user clicked Save while a NumberInput was still focused (no spinner
 *    use, just typed-then-clicked). We blur the input so NumberInput's
 *    finalise runs (clamp + min ≤ max coupling) inside flushSync.
 *
 * 2. The user clicked Save after a spinner click — the browser already fired
 *    blur (during mousedown), so finalise already ran and queued setState
 *    calls, but React 18 batches across the mousedown/blur/mouseup/click
 *    sequence, so those updates haven't committed by the time our click
 *    handler runs. flushSync forces the queued updates to flush regardless.
 */
export function flushPendingEdits() {
  flushSync(() => {
    const active = document.activeElement
    if (active instanceof HTMLInputElement) active.blur()
  })
}
