/**
 * Pure, DOM-free model for the v2 jigsaw's piece interaction: translating and
 * rotating connected groups, snapping a dragged group onto correctly-placed
 * neighbours, and detecting completion. `JigsawTask2` owns the rendering (it
 * writes each piece's `transform` after calling these), but all the geometry and
 * grouping logic lives here so it can be unit-tested without a browser.
 *
 * A piece is identified by its row-major index (`index = r·cols + c`) and tracks
 * its body-centre position (world px), orientation `o` (0..3 × 90° clockwise) and
 * group id `g`. Invariant: every member of a group shares the same orientation —
 * groups only ever merge when the two touching pieces already match orientation,
 * and rotation turns the whole group together.
 */

export interface PieceState {
  cx: number
  cy: number
  o: number
  g: number
}

/** Rotate a vector 90°·o clockwise (screen coords, y down). */
export function rotCW(x: number, y: number, o: number): [number, number] {
  switch (((o % 4) + 4) % 4) {
    case 1:
      return [-y, x]
    case 2:
      return [-x, -y]
    case 3:
      return [y, -x]
    default:
      return [x, y]
  }
}

/** Build the group→members map from per-piece group ids. */
export function groupsOf(states: PieceState[]): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (let i = 0; i < states.length; i++) {
    const arr = map.get(states[i].g)
    if (arr) arr.push(i)
    else map.set(states[i].g, [i])
  }
  return map
}

/** Shift every member of a group by (dx, dy). Mutates `states`. */
export function translateGroup(
  states: PieceState[],
  groups: Map<number, number[]>,
  g: number,
  dx: number,
  dy: number,
) {
  for (const m of groups.get(g) ?? []) {
    states[m].cx += dx
    states[m].cy += dy
  }
}

/** Rotate a group 90° clockwise about its centre. Mutates `states`. */
export function rotateGroup(states: PieceState[], groups: Map<number, number[]>, g: number) {
  const members = groups.get(g) ?? []
  if (members.length === 0) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const m of members) {
    const s = states[m]
    minX = Math.min(minX, s.cx)
    minY = Math.min(minY, s.cy)
    maxX = Math.max(maxX, s.cx)
    maxY = Math.max(maxY, s.cy)
  }
  const px = (minX + maxX) / 2
  const py = (minY + maxY) / 2
  for (const m of members) {
    const s = states[m]
    const [rx, ry] = rotCW(s.cx - px, s.cy - py, 1)
    s.cx = px + rx
    s.cy = py + ry
    s.o = (s.o + 1) & 3
  }
}

function mergeGroups(states: PieceState[], groups: Map<number, number[]>, keep: number, other: number) {
  if (keep === other) return
  const a = groups.get(keep)
  const b = groups.get(other)
  if (!a || !b) return
  for (const m of b) {
    states[m].g = keep
    a.push(m)
  }
  groups.delete(other)
}

const OFFSETS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

/** One snap pass: align `g` to the first correctly-placed neighbour found. */
function snapOnce(
  states: PieceState[],
  groups: Map<number, number[]>,
  cols: number,
  rows: number,
  cell: number,
  tol: number,
  g: number,
): boolean {
  const tol2 = tol * tol
  for (const i of groups.get(g) ?? []) {
    const s = states[i]
    const c = i % cols
    const r = Math.floor(i / cols)
    for (const [dc, dr] of OFFSETS) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      const j = nr * cols + nc
      const sj = states[j]
      if (sj.g === g || sj.o !== s.o) continue
      const [rx, ry] = rotCW(dc, dr, s.o)
      const dx = sj.cx - (s.cx + rx * cell)
      const dy = sj.cy - (s.cy + ry * cell)
      if (dx * dx + dy * dy <= tol2) {
        translateGroup(states, groups, g, dx, dy) // move our group onto the neighbour
        mergeGroups(states, groups, g, sj.g)
        return true
      }
    }
  }
  return false
}

/**
 * Snap group `g` to any adjacent, correctly-oriented neighbours within `tol`,
 * cascading as merges create new adjacencies. Mutates `states`/`groups`. Returns
 * the surviving group id for `g`'s pieces (kept stable across merges).
 */
export function snapGroup(
  states: PieceState[],
  groups: Map<number, number[]>,
  cols: number,
  rows: number,
  cell: number,
  tol: number,
  g: number,
): number {
  let guard = 0
  const limit = states.length + 4
  while (guard++ < limit && snapOnce(states, groups, cols, rows, cell, tol, g)) {
    /* keep cascading; `g` stays the survivor */
  }
  return g
}

/** True when all `count` pieces form one group and it is upright (orientation 0). */
export function isSolvedUpright(
  states: PieceState[],
  groups: Map<number, number[]>,
  count: number,
): boolean {
  if (states.length !== count || count === 0) return false
  const members = groups.get(states[0].g)
  return !!members && members.length === count && states[0].o === 0
}
