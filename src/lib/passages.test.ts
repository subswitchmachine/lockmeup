import { afterEach, describe, expect, it, vi } from 'vitest'
import { pickPassage } from './passages'

afterEach(() => vi.restoreAllMocks())

const wordCount = (text: string): number => text.trim().split(/\s+/).length

describe('pickPassage', () => {
  it('returns a passage whose word count falls in the requested range', () => {
    for (let i = 0; i < 20; i++) {
      const p = pickPassage(5, 12)
      const w = wordCount(p)
      expect(w).toBeGreaterThanOrEqual(5)
      expect(w).toBeLessThanOrEqual(12)
    }
  })

  it('tolerates reversed bounds', () => {
    const w = wordCount(pickPassage(12, 5))
    expect(w).toBeGreaterThanOrEqual(5)
    expect(w).toBeLessThanOrEqual(12)
  })

  it('falls back to the closest-length passage when nothing fits', () => {
    // Range below the shortest passage (which has 9 words) → expect the
    // 9-word passage as the closest.
    const out = pickPassage(1, 2)
    expect(wordCount(out)).toBe(9)
  })

  it('falls back upward when the range is above all passages', () => {
    // The longest passage has ~38 words.
    const out = pickPassage(500, 1000)
    expect(wordCount(out)).toBeGreaterThan(20)
  })

  it('is deterministic given a fixed Math.random', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const a = pickPassage(0, 1000)
    const b = pickPassage(0, 1000)
    expect(a).toBe(b)
  })
})
