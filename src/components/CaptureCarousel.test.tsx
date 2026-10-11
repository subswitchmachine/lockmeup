// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CaptureFrame } from '../hooks/useAutoCapture'
import { CaptureCarousel } from './CaptureCarousel'

afterEach(cleanup)

const frame = (n: number): CaptureFrame => ({
  dataUrl: `data:clear-${n}`,
  blurredDataUrl: `data:blur-${n}`,
})

describe('CaptureCarousel', () => {
  it('renders the first frame and hides navigation when only one frame exists', () => {
    render(<CaptureCarousel frames={[frame(1)]} />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('data:blur-1')
    expect(screen.queryByLabelText('Previous image')).toBeNull()
  })

  it('shows clear frames when revealed', () => {
    render(<CaptureCarousel frames={[frame(1)]} revealed />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('data:clear-1')
  })

  it('flags the alt text when the combo is blurred', () => {
    render(<CaptureCarousel frames={[frame(1), frame(2)]} />)
    expect((screen.getByRole('img') as HTMLImageElement).alt).toContain('combo blurred')
  })

  it('cycles forward through frames with the next arrow', () => {
    render(<CaptureCarousel frames={[frame(1), frame(2), frame(3)]} revealed />)
    fireEvent.click(screen.getByLabelText('Next image'))
    expect((screen.getByRole('img') as HTMLImageElement).src).toContain('data:clear-2')
    fireEvent.click(screen.getByLabelText('Next image'))
    expect((screen.getByRole('img') as HTMLImageElement).src).toContain('data:clear-3')
  })

  it('wraps to the first frame after the last', () => {
    render(<CaptureCarousel frames={[frame(1), frame(2)]} revealed />)
    fireEvent.click(screen.getByLabelText('Next image'))
    fireEvent.click(screen.getByLabelText('Next image'))
    expect((screen.getByRole('img') as HTMLImageElement).src).toContain('data:clear-1')
  })

  it('wraps to the last frame when stepping backward from the first', () => {
    render(<CaptureCarousel frames={[frame(1), frame(2), frame(3)]} revealed />)
    fireEvent.click(screen.getByLabelText('Previous image'))
    expect((screen.getByRole('img') as HTMLImageElement).src).toContain('data:clear-3')
  })

  it('renders one dot per frame and marks the active one', () => {
    const { container } = render(<CaptureCarousel frames={[frame(1), frame(2), frame(3)]} />)
    const dots = container.querySelectorAll('.dot')
    expect(dots).toHaveLength(3)
    expect(dots[0].classList.contains('active')).toBe(true)
    expect(dots[1].classList.contains('active')).toBe(false)

    fireEvent.click(screen.getByLabelText('Next image'))
    const dotsAfter = container.querySelectorAll('.dot')
    expect(dotsAfter[1].classList.contains('active')).toBe(true)
  })
})
