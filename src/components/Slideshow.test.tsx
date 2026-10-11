// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Slideshow } from './Slideshow'
import { SlideBackdrop } from './SlideBackdrop'
import { PoolsProvider } from '../lib/poolsContext'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('Slideshow', () => {
  it('renders an image with the configured className', () => {
    const { container } = render(<Slideshow slideMs={1000} />)
    const img = container.querySelector('img')!
    expect(img.className).toBe('focus-slide')
    expect(img.getAttribute('src')).toBeTruthy()
  })

  it('uses a custom className when provided', () => {
    const { container } = render(<Slideshow slideMs={1000} className="hold-slide" />)
    expect(container.querySelector('img')!.className).toBe('hold-slide')
  })

  it('swaps to a new image every slideMs', () => {
    const { container } = render(<Slideshow slideMs={1000} />)
    const firstSrc = container.querySelector('img')!.getAttribute('src')

    // The bag-based picker is deterministic-ish: with many bundled images the
    // odds of the next pick matching are very low. Tick the interval until we
    // see a swap (cap at 5 attempts to avoid flakes).
    let swapped = false
    for (let i = 0; i < 5 && !swapped; i++) {
      act(() => vi.advanceTimersByTime(1000))
      const next = container.querySelector('img')!.getAttribute('src')
      if (next !== firstSrc) swapped = true
    }
    expect(swapped).toBe(true)
  })

  it('respects a PoolsProvider when picking images', () => {
    const { container } = render(
      <PoolsProvider value={['definitely-not-a-real-pool']}>
        <Slideshow slideMs={1000} />
      </PoolsProvider>,
    )
    // Unknown pool falls back to the full bundle — just confirm an image renders.
    expect(container.querySelector('img')!.getAttribute('src')).toBeTruthy()
  })
})

describe('SlideBackdrop', () => {
  it('renders nothing when slideMs is null', () => {
    const { container } = render(<SlideBackdrop slideMs={null} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders a Slideshow with the hold-slide class when slideMs is set', () => {
    const { container } = render(<SlideBackdrop slideMs={5_000} />)
    expect(container.querySelector('img.hold-slide')).toBeTruthy()
  })
})
