import { describe, expect, it } from 'vitest'
import {
  assignEdgeKinds,
  buildClipPaths,
  piecePathD,
  recommendedMargin,
  type EdgeKind,
} from './jigsawGeometry'

const nums = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
const opposite = (a: EdgeKind, b: EdgeKind) =>
  (a === 'tab' && b === 'slot') || (a === 'slot' && b === 'tab')

describe('assignEdgeKinds', () => {
  it('marks the outer border edges as none and interior edges as tab/slot', () => {
    const cols = 3
    const rows = 3
    const k = assignEdgeKinds(cols, rows, 7)
    const at = (c: number, r: number) => k[r * cols + c]
    // Corners / borders.
    expect(at(0, 0).up).toBe('none')
    expect(at(0, 0).left).toBe('none')
    expect(at(2, 2).right).toBe('none')
    expect(at(2, 2).down).toBe('none')
    // A fully interior-facing centre piece has no none edges.
    const centre = at(1, 1)
    expect([centre.up, centre.right, centre.down, centre.left]).not.toContain('none')
  })

  it('gives every interior seam a complementary tab/slot pair (so pieces nest)', () => {
    const cols = 4
    const rows = 3
    const k = assignEdgeKinds(cols, rows, 123)
    const at = (c: number, r: number) => k[r * cols + c]
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1) expect(opposite(at(c, r).right, at(c + 1, r).left)).toBe(true)
        if (r < rows - 1) expect(opposite(at(c, r).down, at(c, r + 1).up)).toBe(true)
      }
    }
  })

  it('is deterministic for a given seed', () => {
    expect(assignEdgeKinds(3, 3, 42)).toEqual(assignEdgeKinds(3, 3, 42))
  })
})

describe('piecePathD', () => {
  const cell = 100
  const margin = recommendedMargin(cell)
  const kinds = assignEdgeKinds(3, 3, 99)

  it('emits a closed path that starts with a moveto and has finite coords', () => {
    const d = piecePathD(kinds[4], 1, 1, cell, margin, 99)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    const coords = nums(d)
    expect(coords.length).toBeGreaterThan(0)
    for (const v of coords) expect(Number.isFinite(v)).toBe(true)
  })

  it('keeps the body within the box and tabs within the margin', () => {
    const box = cell + 2 * margin
    const d = piecePathD(kinds[4], 1, 1, cell, margin, 99) // centre piece: tabs/slots all round
    const coords = nums(d)
    const xs = coords.filter((_, i) => i % 2 === 0)
    const ys = coords.filter((_, i) => i % 2 === 1)
    for (const v of [...xs, ...ys]) {
      expect(v).toBeGreaterThanOrEqual(-0.5)
      expect(v).toBeLessThanOrEqual(box + 0.5)
    }
  })

  it('is deterministic for the same seed and differs for different seeds', () => {
    expect(piecePathD(kinds[4], 1, 1, cell, margin, 99)).toEqual(
      piecePathD(kinds[4], 1, 1, cell, margin, 99),
    )
    const other = assignEdgeKinds(3, 3, 100)
    expect(piecePathD(other[4], 1, 1, cell, margin, 100)).not.toEqual(
      piecePathD(kinds[4], 1, 1, cell, margin, 99),
    )
  })

  it('scales linearly with cell + margin', () => {
    const small = nums(piecePathD(kinds[4], 1, 1, 50, recommendedMargin(50) * 0, 99))
    // Use proportional margin so the whole geometry scales by exactly 2.
    const m1 = 20
    const a = nums(piecePathD(kinds[4], 1, 1, 100, m1, 99))
    const b = nums(piecePathD(kinds[4], 1, 1, 200, m1 * 2, 99))
    expect(a.length).toBe(b.length)
    const i = a.findIndex((v) => v !== 0)
    expect(b[i] / a[i]).toBeCloseTo(2, 1)
    expect(small.length).toBeGreaterThan(0)
  })
})

describe('buildClipPaths', () => {
  it('returns one path per piece, row-major', () => {
    const paths = buildClipPaths(4, 3, 80, 24, 5)
    expect(paths).toHaveLength(12)
    for (const d of paths) {
      expect(d.startsWith('M')).toBe(true)
      expect(d.endsWith('Z')).toBe(true)
    }
  })

  it('matches piecePathD for the same inputs', () => {
    const seed = 5
    const kinds = assignEdgeKinds(4, 3, seed)
    const paths = buildClipPaths(4, 3, 80, 24, seed)
    expect(paths[6]).toEqual(piecePathD(kinds[6], 2, 1, 80, 24, seed))
  })
})
