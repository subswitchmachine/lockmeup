import { describe, expect, it } from 'vitest'
import {
  groupsOf,
  isSolvedUpright,
  rotateGroup,
  rotCW,
  snapGroup,
  translateGroup,
  type PieceState,
} from './jigsawSolver'

const CELL = 100
const TOL = 34

/** Singleton pieces (each its own group) positioned by `place`. */
function pieces(n: number, place: (i: number) => { cx: number; cy: number; o?: number }): PieceState[] {
  return Array.from({ length: n }, (_, i) => {
    const p = place(i)
    return { cx: p.cx, cy: p.cy, o: p.o ?? 0, g: i }
  })
}

describe('rotCW', () => {
  // Normalise -0 → 0 so signed zero (e.g. -y when y=0) doesn't fail toEqual.
  const r = (x: number, y: number, o: number) => rotCW(x, y, o).map((v) => v + 0)
  it('rotates a rightward vector through the clockwise quadrants', () => {
    expect(r(1, 0, 0)).toEqual([1, 0])
    expect(r(1, 0, 1)).toEqual([0, 1]) // right → down (screen y-down)
    expect(r(1, 0, 2)).toEqual([-1, 0])
    expect(r(1, 0, 3)).toEqual([0, -1])
    expect(r(3, 7, 4)).toEqual([3, 7]) // wraps
  })
})

describe('groupsOf', () => {
  it('maps each group id to its member indices', () => {
    const st: PieceState[] = [
      { cx: 0, cy: 0, o: 0, g: 5 },
      { cx: 0, cy: 0, o: 0, g: 5 },
      { cx: 0, cy: 0, o: 0, g: 2 },
    ]
    const g = groupsOf(st)
    expect(g.get(5)).toEqual([0, 1])
    expect(g.get(2)).toEqual([2])
  })
})

describe('translateGroup / rotateGroup', () => {
  it('translates only the targeted group', () => {
    const st = pieces(2, (i) => ({ cx: i * 100, cy: 0 }))
    const g = groupsOf(st)
    translateGroup(st, g, 0, 10, -5)
    expect([st[0].cx, st[0].cy]).toEqual([10, -5])
    expect([st[1].cx, st[1].cy]).toEqual([100, 0])
  })

  it('rotates a connected pair 90° CW about its centre and bumps orientation', () => {
    // Two pieces sharing group 0, centres (0,0) and (100,0); centre = (50,0).
    const st: PieceState[] = [
      { cx: 0, cy: 0, o: 0, g: 0 },
      { cx: 100, cy: 0, o: 0, g: 0 },
    ]
    const g = groupsOf(st)
    rotateGroup(st, g, 0)
    // (0,0) about (50,0): offset (-50,0) → (0,-50) → (50,-50)
    expect([st[0].cx, st[0].cy]).toEqual([50, -50])
    // (100,0) about (50,0): offset (50,0) → (0,50) → (50,50)
    expect([st[1].cx, st[1].cy]).toEqual([50, 50])
    expect(st[0].o).toBe(1)
    expect(st[1].o).toBe(1)
  })
})

describe('snapGroup', () => {
  it('snaps a near-correct neighbour into an exact fit and merges groups', () => {
    // 2×1 board; piece 0 placed, piece 1 dropped just shy of its slot to the right.
    const st = pieces(2, (i) => (i === 0 ? { cx: 50, cy: 50 } : { cx: 155, cy: 53 }))
    const g = groupsOf(st)
    const survivor = snapGroup(st, g, 2, 1, CELL, TOL, 1)
    expect(st[0].g).toBe(st[1].g) // same group now
    expect(survivor).toBe(1)
    expect(st[1].cx - st[0].cx).toBeCloseTo(CELL, 6) // exactly one cell apart
    expect(st[1].cy).toBeCloseTo(st[0].cy, 6)
  })

  it('does not snap when orientations differ', () => {
    const st = pieces(2, (i) => (i === 0 ? { cx: 50, cy: 50, o: 0 } : { cx: 150, cy: 50, o: 1 }))
    const g = groupsOf(st)
    snapGroup(st, g, 2, 1, CELL, TOL, 1)
    expect(st[0].g).not.toBe(st[1].g)
  })

  it('does not snap when the neighbour is out of tolerance', () => {
    const st = pieces(2, (i) => (i === 0 ? { cx: 50, cy: 50 } : { cx: 210, cy: 50 }))
    const g = groupsOf(st)
    snapGroup(st, g, 2, 1, CELL, TOL, 1)
    expect(st[0].g).not.toBe(st[1].g)
  })

  it('snaps rotated pieces using the rotated neighbour offset', () => {
    // Both pieces at o=1: the right-neighbour of 0 sits at offset rotCW((1,0),1)=(0,1).
    const st = pieces(2, (i) => (i === 0 ? { cx: 50, cy: 50, o: 1 } : { cx: 50, cy: 154, o: 1 }))
    const g = groupsOf(st)
    snapGroup(st, g, 2, 1, CELL, TOL, 1)
    expect(st[0].g).toBe(st[1].g)
    expect(st[1].cx).toBeCloseTo(st[0].cx, 6)
    expect(st[1].cy - st[0].cy).toBeCloseTo(CELL, 6)
  })

  it('cascades: a piece dropped between two placed neighbours joins both', () => {
    // 3×1 board; pieces 0 and 2 already at their solved spots, piece 1 dropped between.
    const st = pieces(3, (i) => {
      if (i === 0) return { cx: 50, cy: 50 }
      if (i === 2) return { cx: 250, cy: 50 }
      return { cx: 152, cy: 48 }
    })
    const g = groupsOf(st)
    snapGroup(st, g, 3, 1, CELL, TOL, 1)
    expect(st[0].g).toBe(st[1].g)
    expect(st[1].g).toBe(st[2].g)
    expect(st[1].cx - st[0].cx).toBeCloseTo(CELL, 6)
    expect(st[2].cx - st[1].cx).toBeCloseTo(CELL, 6)
  })
})

describe('isSolvedUpright', () => {
  function assemble(): { st: PieceState[]; g: Map<number, number[]> } {
    // 2×2 solved into one group, upright.
    const st = pieces(4, (i) => ({ cx: (i % 2) * 100 + 50, cy: Math.floor(i / 2) * 100 + 50 }))
    const g = groupsOf(st)
    // Snap everything onto piece 0's group.
    snapGroup(st, g, 2, 2, CELL, TOL, 1)
    snapGroup(st, g, 2, 2, CELL, TOL, 2)
    snapGroup(st, g, 2, 2, CELL, TOL, 3)
    // Re-resolve groups in case ids shifted, then snap the lot together.
    return { st, g }
  }

  it('is true only when all pieces are one upright group', () => {
    const { st, g } = assemble()
    // Everything should now share one group.
    const root = st[0].g
    expect((g.get(root) ?? []).length).toBe(4)
    expect(isSolvedUpright(st, g, 4)).toBe(true)
  })

  it('is false when not every piece is connected', () => {
    const st = pieces(4, (i) => ({ cx: i * 1000, cy: 0 })) // scattered far apart
    const g = groupsOf(st)
    expect(isSolvedUpright(st, g, 4)).toBe(false)
  })

  it('is false when the assembled group is not upright', () => {
    const { st, g } = assemble()
    const root = st[0].g
    rotateGroup(st, g, root) // now o = 1
    expect(isSolvedUpright(st, g, 4)).toBe(false)
    rotateGroup(st, g, root)
    rotateGroup(st, g, root)
    rotateGroup(st, g, root) // back to o = 0
    expect(isSolvedUpright(st, g, 4)).toBe(true)
  })
})
