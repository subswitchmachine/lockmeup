import { describe, expect, it, vi } from 'vitest'
import { IMAGE_POOLS, PUZZLE_IMAGES, imageUrl, pickDistinctImages, pickRandomImage } from './puzzleImages'

describe('PUZZLE_IMAGES', () => {
  it('discovers at least one bundled image', () => {
    expect(PUZZLE_IMAGES.length).toBeGreaterThan(0)
  })

  it('exposes unique pool-qualified ids', () => {
    const ids = new Set(PUZZLE_IMAGES.map((img) => img.id))
    expect(ids.size).toBe(PUZZLE_IMAGES.length)
  })

  it('lists each image under a discoverable pool', () => {
    for (const img of PUZZLE_IMAGES) {
      expect(IMAGE_POOLS).toContain(img.pool)
      expect(img.id.startsWith(img.pool + '/')).toBe(true)
    }
  })

  it('returns image pools sorted', () => {
    const sorted = [...IMAGE_POOLS].sort()
    expect(IMAGE_POOLS).toEqual(sorted)
  })
})

describe('imageUrl', () => {
  it('resolves a known id to its url', () => {
    const first = PUZZLE_IMAGES[0]
    expect(imageUrl(first.id)).toBe(first.url)
  })

  it('falls back to a basename match for pre-pool ids', () => {
    const first = PUZZLE_IMAGES[0]
    const bareName = first.id.split('/').pop()!
    expect(imageUrl(bareName)).toBe(first.url)
  })

  it('falls back to the first image when nothing matches', () => {
    expect(imageUrl('no-such-image.png')).toBe(PUZZLE_IMAGES[0].url)
  })
})

describe('pickRandomImage', () => {
  it('returns an image from the requested pool only', () => {
    const pool = IMAGE_POOLS[0]
    for (let i = 0; i < 10; i++) {
      expect(pickRandomImage([pool]).pool).toBe(pool)
    }
  })

  it('cycles through every image once before repeating (bag draw)', async () => {
    // The bag is module-level state shared with earlier tests, so reset the
    // module to start from a clean bag for this assertion.
    vi.resetModules()
    const { pickRandomImage: freshPick, IMAGE_POOLS: pools, PUZZLE_IMAGES: imgs } = await import(
      './puzzleImages'
    )
    const pool = pools[0]
    const poolSize = imgs.filter((img) => img.pool === pool).length
    if (poolSize > 1) {
      const drawn = new Set<string>()
      for (let i = 0; i < poolSize; i++) drawn.add(freshPick([pool]).id)
      expect(drawn.size).toBe(poolSize)
    }
  })

  it('treats unknown pools as no filter', () => {
    // No pools matching → falls back to the full library; result is some real image.
    const img = pickRandomImage(['definitely-not-a-real-pool'])
    expect(PUZZLE_IMAGES.find((p) => p.id === img.id)).toBeDefined()
  })
})

describe('pickDistinctImages', () => {
  it('returns n unique ids when n ≤ pool size', () => {
    const ids = pickDistinctImages(4)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeLessThanOrEqual(4)
  })

  it('clamps to pool size when n is too large', () => {
    const ids = pickDistinctImages(PUZZLE_IMAGES.length + 1000)
    expect(ids.length).toBe(PUZZLE_IMAGES.length)
  })

  it('clamps to at least 1 image when n is 0 or negative', () => {
    expect(pickDistinctImages(0).length).toBeGreaterThanOrEqual(1)
    expect(pickDistinctImages(-5).length).toBeGreaterThanOrEqual(1)
  })

  it('restricts results to the requested pool', () => {
    const pool = IMAGE_POOLS[0]
    const ids = pickDistinctImages(3, [pool])
    for (const id of ids) expect(id.startsWith(pool + '/')).toBe(true)
  })
})
