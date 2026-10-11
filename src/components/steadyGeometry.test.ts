import { describe, expect, it } from 'vitest'
import { catmullRom, nearest, pathLengths, type Pt } from './steadyGeometry'

describe('catmullRom', () => {
  it('passes through the first and last control points', () => {
    const ctrl: Pt[] = [
      [0, 0],
      [1, 1],
      [2, 0],
      [3, 1],
    ]
    const out = catmullRom(ctrl, 8)
    expect(out[0][0]).toBeCloseTo(0, 5)
    expect(out[0][1]).toBeCloseTo(0, 5)
    expect(out[out.length - 1][0]).toBeCloseTo(3, 5)
    expect(out[out.length - 1][1]).toBeCloseTo(1, 5)
  })

  it('emits samples * (ctrl-1) + 1 points', () => {
    const ctrl: Pt[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]
    // segments = 3, samples = 5 → 5 + 5 + 6 = 16
    expect(catmullRom(ctrl, 5)).toHaveLength(16)
  })

  it('reproduces a straight line as a straight line', () => {
    const ctrl: Pt[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]
    for (const [, y] of catmullRom(ctrl, 6)) expect(y).toBeCloseTo(0, 9)
  })
})

describe('pathLengths', () => {
  it('returns 0 for a single point', () => {
    const { total, cum } = pathLengths([[0, 0]])
    expect(total).toBe(0)
    expect(cum).toEqual([0])
  })

  it('produces monotonically non-decreasing cumulative lengths', () => {
    const pts: Pt[] = [
      [0, 0],
      [3, 4],
      [6, 0],
      [10, 0],
    ]
    const { cum } = pathLengths(pts)
    for (let i = 1; i < cum.length; i++) expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1])
  })

  it('matches the Euclidean sum of segments', () => {
    const pts: Pt[] = [
      [0, 0],
      [3, 4], // +5
      [3, 0], // +4
    ]
    const { total, cum } = pathLengths(pts)
    expect(cum).toEqual([0, 5, 9])
    expect(total).toBe(9)
  })

  it('handles zero-length segments without breaking the cumulative sum', () => {
    const pts: Pt[] = [
      [0, 0],
      [1, 0],
      [1, 0], // repeated point
      [2, 0],
    ]
    const { total, cum } = pathLengths(pts)
    expect(cum).toEqual([0, 1, 1, 2])
    expect(total).toBe(2)
  })
})

describe('nearest', () => {
  // Simple horizontal polyline from (0,0) to (10,0), with one mid-knot.
  const pts: Pt[] = [
    [0, 0],
    [5, 0],
    [10, 0],
  ]
  const { total, cum } = pathLengths(pts)

  it('projects a point above the midpoint to t=0.5 with distance = vertical offset', () => {
    const r = nearest(pts, cum, total, 5, 3)
    expect(r.t).toBeCloseTo(0.5, 5)
    expect(r.dist).toBeCloseTo(3, 5)
  })

  it('projects the start to t=0 with zero distance', () => {
    const r = nearest(pts, cum, total, 0, 0)
    expect(r.t).toBeCloseTo(0, 5)
    expect(r.dist).toBeCloseTo(0, 5)
  })

  it('clamps points beyond the end to t=1', () => {
    const r = nearest(pts, cum, total, 20, 0)
    expect(r.t).toBeCloseTo(1, 5)
    expect(r.dist).toBeCloseTo(10, 5)
  })

  it('clamps points before the start to t=0', () => {
    const r = nearest(pts, cum, total, -5, 0)
    expect(r.t).toBeCloseTo(0, 5)
    expect(r.dist).toBeCloseTo(5, 5)
  })

  it('handles a degenerate single-point path by returning t=0', () => {
    const degenerate: Pt[] = [[3, 4]]
    const lens = pathLengths(degenerate)
    const r = nearest(degenerate, lens.cum, lens.total || 1, 0, 0)
    expect(r.t).toBe(0)
  })

  it('picks the closest segment when several are nearby', () => {
    const corner: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ]
    const lens = pathLengths(corner)
    // (8, 1) is near the bottom segment, not the vertical one.
    const r = nearest(corner, lens.cum, lens.total, 8, 1)
    expect(r.dist).toBeCloseTo(1, 5)
  })
})
