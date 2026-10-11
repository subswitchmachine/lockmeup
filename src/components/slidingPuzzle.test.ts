import { describe, expect, it } from 'vitest'
import { GAP, isSolved, scramble } from './slidingPuzzle'

const solvedBoard = (cols: number, rows: number) => {
  const n = cols * rows
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? GAP : i))
}

describe('isSolved', () => {
  it('is true for the canonical solved board', () => {
    expect(isSolved(solvedBoard(3, 3))).toBe(true)
    expect(isSolved(solvedBoard(2, 4))).toBe(true)
  })

  it('is false when any non-gap tile is out of place', () => {
    const b = solvedBoard(3, 3)
    ;[b[0], b[1]] = [b[1], b[0]]
    expect(isSolved(b)).toBe(false)
  })

  it('is false when the gap is not in the last slot', () => {
    const b = solvedBoard(3, 3)
    // Swap the GAP with the second-to-last position.
    ;[b[b.length - 1], b[b.length - 2]] = [b[b.length - 2], b[b.length - 1]]
    expect(isSolved(b)).toBe(false)
  })
})

describe('scramble', () => {
  it('returns a board sized cols*rows', () => {
    expect(scramble(3, 3)).toHaveLength(9)
    expect(scramble(2, 5)).toHaveLength(10)
    expect(scramble(4, 3)).toHaveLength(12)
  })

  it('preserves the tile multiset (numbers 0..n-2 plus the gap)', () => {
    const board = scramble(3, 4)
    const sorted = [...board].sort((a, b) => a - b)
    const expected = [-1, ...Array.from({ length: 11 }, (_, i) => i)]
    expect(sorted).toEqual(expected)
  })

  it('places the gap somewhere on the board', () => {
    for (let i = 0; i < 20; i++) {
      const board = scramble(3, 3)
      expect(board).toContain(GAP)
    }
  })

  it('reaches non-trivial positions for a 3×3 most of the time', () => {
    // 40 attempts: at least one should be unsolved (the solved-by-chance case
    // is rare since scramble runs ~n*40 random moves).
    let unsolvedSeen = 0
    for (let i = 0; i < 40; i++) {
      if (!isSolved(scramble(3, 3))) unsolvedSeen++
    }
    expect(unsolvedSeen).toBeGreaterThan(30)
  })
})
