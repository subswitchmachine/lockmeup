/**
 * Renderer-agnostic jigsaw piece geometry for the v2 puzzle (`JigsawTask2`).
 *
 * v1 (`JigsawTask` + headbreaker) consumes `jigsawOutline.ts`, which emits a flat
 * point array in headbreaker's `Squared` coordinate convention. v2 renders with
 * plain DOM elements clipped by CSS `clip-path: path(...)`, so this module emits
 * an SVG **path string** per piece in the element's local pixel space instead.
 *
 * The interlock math is the same idea as v1, ported here so v1 stays untouched:
 * the two pieces on either side of a seam key their knob shape off a seeded hash
 * of the *seam* id (shared by both neighbours) and draw it outward for a tab /
 * inward for a slot — same seam ⇒ same parameters ⇒ the tab fills the hole. Each
 * seam also independently flips a coin (`:o`) to decide which side is the tab, so
 * every interior edge is a complementary tab/slot pair and the whole puzzle has
 * unique, classic-looking edges.
 *
 * Coordinate model (deliberately cleaner than v1's): a piece's body is a
 * `cell × cell` square inset by `margin` inside a square `(cell + 2·margin)` box.
 * Because the box is symmetric, its centre coincides with the body centre — so a
 * 90° rotation about the box centre is a rotation about the body centre, which is
 * what makes piece rotation trivial for the renderer. Tabs protrude into the
 * margin; slots cut into the body; border edges run straight along the body edge.
 *
 * Edge geometry is built in a normalised `0..4` grid along/perpendicular to each
 * edge (matching v1's knob proportions) using *absolute* coordinates — the knob
 * centre `2 + shift` lands at the same absolute position on both sides of a seam,
 * so they nest. Control points are emitted as cubic béziers (via Catmull-Rom),
 * which are smoother and far lighter than v1's dense polyline sampling — this
 * keeps clip-path strings small for large (1000–3000 piece) puzzles.
 */

/** FNV-1a style 32-bit hash with an avalanche finish, seeded per puzzle. */
export function hash32(str: string, seed: number): number {
  let h = (seed ^ 0x811c9dc5) >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  return h >>> 0
}

function rand01(key: string, seed: number): number {
  return hash32(key, seed) / 0xffffffff
}

export type EdgeKind = 'tab' | 'slot' | 'none'
export interface PieceEdges {
  up: EdgeKind
  right: EdgeKind
  down: EdgeKind
  left: EdgeKind
}

type EdgeName = 'up' | 'right' | 'down' | 'left'

interface KnobParams {
  shift: number
  nw: number
  dep: number
  bulge: number
}

/** Per-seam knob parameters; identical for both pieces sharing the seam. */
function knobParams(seamId: string, seed: number): KnobParams {
  const shift = (rand01(seamId + ':s', seed) - 0.5) * 0.6 // ±0.3 along the edge
  let nw = 0.38 + rand01(seamId + ':w', seed) * 0.34 // neck half-width 0.38..0.72
  const dep = 0.5 + rand01(seamId + ':d', seed) * 0.6 // protrusion 0.50..1.10
  const bulge = 1.1 + rand01(seamId + ':b', seed) * 0.45 // head overhang 1.10..1.55

  // Clamp the flare so the knob can't reach the corners; deterministic in the
  // seam key so both sides clamp identically and still nest.
  const maxFlare = 1.5 - Math.abs(shift)
  if (nw * bulge > maxFlare) nw = maxFlare / bulge

  return { shift, nw, dep, bulge }
}

/** Knob control points in trace order, `a` offset from centre, `d` outward depth. */
function knobProfile({ nw, dep, bulge }: KnobParams): { a: number; d: number }[] {
  return [
    { a: -nw, d: 0 }, // leave the edge (neck base)
    { a: -nw * bulge, d: dep * 0.55 }, // flare out past the neck
    { a: -nw * 0.5, d: dep }, // head, left
    { a: 0, d: dep * 1.06 }, // head, top
    { a: nw * 0.5, d: dep }, // head, right
    { a: nw * bulge, d: dep * 0.55 }, // flare back in
    { a: nw, d: 0 }, // rejoin the edge
  ]
}

/** Gentle perpendicular bow applied to an interior edge's flat runs (grid units). */
const WAVE_AMP = 0.3

/** Signed wave depth for each flat run of a seam; shared by both neighbours. */
function waveParams(seamId: string, seed: number): { lo: number; hi: number } {
  return {
    lo: (rand01(seamId + ':wl', seed) - 0.5) * 2 * WAVE_AMP,
    hi: (rand01(seamId + ':wh', seed) - 0.5) * 2 * WAVE_AMP,
  }
}

/**
 * Per-edge geometry in the normalised grid. `axis` is which absolute axis runs
 * *along* the edge; `perp` is the edge's baseline on the other axis (0 or 4);
 * `outSign` points away from the body; `increasing` is the clockwise trace order.
 */
const EDGES: Record<EdgeName, { axis: 'x' | 'y'; perp: 0 | 4; outSign: -1 | 1; increasing: boolean }> = {
  up: { axis: 'x', perp: 0, outSign: -1, increasing: true }, // top, L→R, out = -y
  right: { axis: 'y', perp: 4, outSign: 1, increasing: true }, // right, T→B, out = +x
  down: { axis: 'x', perp: 4, outSign: 1, increasing: false }, // bottom, R→L, out = +y
  left: { axis: 'y', perp: 0, outSign: -1, increasing: false }, // left, B→T, out = -x
}

/** The canonical seam id for an edge — shared by the neighbour across that seam. */
function seamId(name: EdgeName, c: number, r: number): string {
  switch (name) {
    case 'up':
      return `H${c}_${r - 1}`
    case 'down':
      return `H${c}_${r}`
    case 'left':
      return `V${c - 1}_${r}`
    case 'right':
      return `V${c}_${r}`
  }
}

interface XY {
  x: number
  y: number
}

/**
 * Control points of one edge in local pixels (corner→corner in clockwise trace
 * order). Border edges are two corners (a straight run); interior edges add the
 * flat-run bows and the knob, drawn outward for a tab / inward for a slot.
 */
function edgeControlPx(
  name: EdgeName,
  kind: EdgeKind,
  c: number,
  r: number,
  cell: number,
  margin: number,
  seed: number,
): XY[] {
  const cfg = EDGES[name]
  let ctrl: { a: number; d: number }[]
  if (kind === 'none') {
    ctrl = [
      { a: 0, d: 0 },
      { a: 4, d: 0 },
    ]
  } else {
    const id = seamId(name, c, r)
    const kp = knobParams(id, seed)
    const wv = waveParams(id, seed)
    const center = 2 + kp.shift
    const dirMag = kind === 'tab' ? 1 : -1 // tab bows outward, slot inward
    const knob = knobProfile(kp).map((p) => ({ a: center + p.a, d: dirMag * p.d }))
    ctrl = [
      { a: 0, d: 0 }, // start corner
      { a: (0 + (center - kp.nw)) / 2, d: dirMag * wv.lo }, // flat-run bow
      ...knob,
      { a: (center + kp.nw + 4) / 2, d: dirMag * wv.hi }, // flat-run bow
      { a: 4, d: 0 }, // end corner
    ]
  }

  // Map normalised (along a, signed depth d) → absolute grid → local pixels.
  const pts = ctrl.map(({ a, d }) => {
    const perp = cfg.perp + cfg.outSign * d
    const gx = cfg.axis === 'x' ? a : perp
    const gy = cfg.axis === 'x' ? perp : a
    return { x: margin + (gx / 4) * cell, y: margin + (gy / 4) * cell }
  })
  return cfg.increasing ? pts : pts.reverse()
}

/** Format a number for a path string — trim to 2dp, drop trailing zeros. */
function n(v: number): string {
  return Number(v.toFixed(2)).toString()
}

/**
 * Emit cubic-bézier commands tracing a smooth curve through `pts`, assuming the
 * path's current point is already `pts[0]`. Uniform Catmull-Rom converted to
 * béziers (endpoints clamped), so the curve passes through every control point.
 * A straight (2-point) edge yields a collinear bézier, i.e. effectively a line.
 */
function bezierThrough(pts: XY[]): string {
  if (pts.length < 2) return ''
  const p = [pts[0], ...pts, pts[pts.length - 1]]
  let out = ''
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = p[i]
    const p1 = p[i + 1]
    const p2 = p[i + 2]
    const p3 = p[i + 3]
    const b1x = p1.x + (p2.x - p0.x) / 6
    const b1y = p1.y + (p2.y - p0.y) / 6
    const b2x = p2.x - (p3.x - p1.x) / 6
    const b2y = p2.y - (p3.y - p1.y) / 6
    out += `C${n(b1x)} ${n(b1y)} ${n(b2x)} ${n(b2y)} ${n(p2.x)} ${n(p2.y)}`
  }
  return out
}

/**
 * Decide every piece's four edge kinds (`tab`/`slot`/`none`). Border edges are
 * `none`; for each interior seam one side is the tab and the other the slot,
 * chosen deterministically from the seam's `:o` hash so neighbours always nest.
 * Indexed row-major: `index = r * cols + c`.
 */
export function assignEdgeKinds(cols: number, rows: number, seed: number): PieceEdges[] {
  const vTab = (c: number, r: number) => rand01(`V${c}_${r}:o`, seed) < 0.5 // right side of (c,r)
  const hTab = (c: number, r: number) => rand01(`H${c}_${r}:o`, seed) < 0.5 // down side of (c,r)
  const out: PieceEdges[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        up: r === 0 ? 'none' : hTab(c, r - 1) ? 'slot' : 'tab',
        down: r === rows - 1 ? 'none' : hTab(c, r) ? 'tab' : 'slot',
        left: c === 0 ? 'none' : vTab(c - 1, r) ? 'slot' : 'tab',
        right: c === cols - 1 ? 'none' : vTab(c, r) ? 'tab' : 'slot',
      })
    }
  }
  return out
}

/**
 * The `clip-path: path(...)` data for one piece, in its local pixel box
 * (`cell + 2·margin` square, body inset by `margin`). Traced clockwise from the
 * top-left body corner.
 */
export function piecePathD(
  edges: PieceEdges,
  c: number,
  r: number,
  cell: number,
  margin: number,
  seed: number,
): string {
  const order: EdgeName[] = ['up', 'right', 'down', 'left']
  let d = ''
  for (let k = 0; k < order.length; k++) {
    const name = order[k]
    const pts = edgeControlPx(name, edges[name], c, r, cell, margin, seed)
    if (k === 0) d += `M${n(pts[0].x)} ${n(pts[0].y)}`
    d += bezierThrough(pts)
  }
  return d + 'Z'
}

/**
 * Convenience: build the clip-path strings for a whole `cols × rows` puzzle,
 * indexed row-major (`index = r * cols + c`).
 */
export function buildClipPaths(
  cols: number,
  rows: number,
  cell: number,
  margin: number,
  seed: number,
): string[] {
  const kinds = assignEdgeKinds(cols, rows, seed)
  const out: string[] = new Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      out[i] = piecePathD(kinds[i], c, r, cell, margin, seed)
    }
  }
  return out
}

/**
 * Recommended margin (tab-containment padding) for a given cell size: large
 * enough to hold the deepest possible knob (`dep ≤ 1.10`, head ×1.06, scaled by
 * `cell/4`) plus a hair of slack.
 */
export function recommendedMargin(cell: number): number {
  return Math.ceil((1.1 * 1.06 * cell) / 4 + 1)
}
