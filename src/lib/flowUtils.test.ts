import { describe, expect, it } from 'vitest'
import { move } from './flowUtils'

describe('move', () => {
  it('moves an item up', () => {
    expect(move([1, 2, 3], 2, -1)).toEqual([1, 3, 2])
  })

  it('moves an item down', () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3])
  })

  it('is a no-op moving the first item up', () => {
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
  })

  it('is a no-op moving the last item down', () => {
    expect(move([1, 2, 3], 2, 1)).toEqual([1, 2, 3])
  })

  it('returns the same array reference on a no-op', () => {
    const input = [1, 2, 3]
    expect(move(input, 0, -1)).toBe(input)
  })

  it('returns a fresh copy on a real move (no mutation)', () => {
    const input = [1, 2, 3]
    const result = move(input, 0, 1)
    expect(result).not.toBe(input)
    expect(input).toEqual([1, 2, 3])
  })
})
