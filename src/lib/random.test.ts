import { afterEach, describe, expect, it, vi } from 'vitest'
import { pick, randInt, shuffle } from './random'

afterEach(() => vi.restoreAllMocks())

describe('randInt', () => {
  it('returns a single value when bounds are equal', () => {
    expect(randInt(7, 7)).toBe(7)
  })

  it('tolerates reversed bounds', () => {
    for (let i = 0; i < 50; i++) {
      const v = randInt(5, 1)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(5)
    }
  })

  it('stays within [a, b] inclusive and yields integers', () => {
    for (let i = 0; i < 200; i++) {
      const v = randInt(1, 6)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
    }
  })

  it('hits the low bound when Math.random is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(randInt(2, 9)).toBe(2)
  })

  it('hits the high bound when Math.random approaches 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(randInt(2, 9)).toBe(9)
  })
})

describe('pick', () => {
  it('returns an element of the array', () => {
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) expect(arr).toContain(pick(arr))
  })

  it('picks the first element when Math.random is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(pick([10, 20, 30])).toBe(10)
  })

  it('picks the last element when Math.random approaches 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999)
    expect(pick([10, 20, 30])).toBe(30)
  })
})

describe('shuffle', () => {
  it('preserves length and multiset of elements', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const result = shuffle(input.slice())
    expect(result).toHaveLength(input.length)
    expect([...result].sort((a, b) => a - b)).toEqual(input)
  })

  it('shuffles in place and returns the same reference', () => {
    const arr = [1, 2, 3]
    expect(shuffle(arr)).toBe(arr)
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle([42])).toEqual([42])
  })
})
