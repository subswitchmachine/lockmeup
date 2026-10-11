import { pick } from '../lib/random'

/**
 * Pure puzzle-state helpers for the sliding tile task. Kept separate from the
 * React component so they can be unit-tested without a DOM.
 */

/** Sentinel value marking the empty slot in the board array. */
export const GAP = -1

/**
 * Scramble by N random *valid* moves from the solved board. Because every move
 * is a single tile↔gap swap, the resulting board is always reachable from the
 * solved state — i.e. always solvable.
 */
export function scramble(cols: number, rows: number): number[] {
  const n = cols * rows
  const board = Array.from({ length: n }, (_, i) => (i === n - 1 ? GAP : i))
  let gap = n - 1
  for (let k = 0; k < n * 40; k++) {
    const r = Math.floor(gap / cols)
    const c = gap % cols
    const neighbours: number[] = []
    if (r > 0) neighbours.push(gap - cols)
    if (r < rows - 1) neighbours.push(gap + cols)
    if (c > 0) neighbours.push(gap - 1)
    if (c < cols - 1) neighbours.push(gap + 1)
    const swap = pick(neighbours)
    ;[board[gap], board[swap]] = [board[swap], board[gap]]
    gap = swap
  }
  return board
}

/** A board is solved when every tile is at its starting index and the gap is last. */
export const isSolved = (board: number[]): boolean =>
  board.every((t, i) => (i === board.length - 1 ? t === GAP : t === i))
