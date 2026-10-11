import { describe, expect, it } from 'vitest'
import { accentRing } from './ui'

describe('accentRing', () => {
  it('emits a conic gradient that uses the accent and panel tokens', () => {
    const ring = accentRing(90)
    expect(ring).toContain('conic-gradient')
    expect(ring).toContain('var(--accent')
    expect(ring).toContain('var(--panel)')
    expect(ring).toContain('90deg')
  })

  it('places the fill stop at the requested degree value', () => {
    expect(accentRing(0)).toContain('0deg')
    expect(accentRing(360)).toContain('360deg')
  })
})
