// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRef } from 'react'
import { CameraView } from './CameraView'
import { STATE_LABELS } from '../lib/captureConfig'

afterEach(cleanup)

describe('CameraView', () => {
  it('renders the state badge with the label for the current state', () => {
    const ref = createRef<HTMLVideoElement>()
    const { container } = render(
      <CameraView
        videoRef={ref}
        stream={null}
        state="waiting"
        roiFraction={0.6}
        settleProgress={0}
        mirrored={false}
      />,
    )
    const badge = container.querySelector('.state-badge')!
    expect(badge.textContent).toBe(STATE_LABELS.waiting)
    expect(badge.classList.contains('badge-waiting')).toBe(true)
  })

  it('adds the mirrored class when mirrored is true', () => {
    const ref = createRef<HTMLVideoElement>()
    const { container } = render(
      <CameraView
        videoRef={ref}
        stream={null}
        state="idle"
        roiFraction={0.6}
        settleProgress={0}
        mirrored
      />,
    )
    expect(container.querySelector('.camera-view')!.className).toContain('mirrored')
  })

  it('omits the mirrored class when mirrored is false', () => {
    const ref = createRef<HTMLVideoElement>()
    const { container } = render(
      <CameraView
        videoRef={ref}
        stream={null}
        state="idle"
        roiFraction={0.6}
        settleProgress={0}
        mirrored={false}
      />,
    )
    expect(container.querySelector('.camera-view')!.className).not.toContain('mirrored')
  })

  it('sizes the framing box according to roiFraction', () => {
    const ref = createRef<HTMLVideoElement>()
    const { container } = render(
      <CameraView
        videoRef={ref}
        stream={null}
        state="idle"
        roiFraction={0.75}
        settleProgress={0}
        mirrored={false}
      />,
    )
    const frame = container.querySelector('.frame-box') as HTMLElement
    expect(frame.style.height).toBe('75%')
  })

  it('shows the settle ring at full opacity only while settling', () => {
    const ref = createRef<HTMLVideoElement>()
    const { container, rerender } = render(
      <CameraView
        videoRef={ref}
        stream={null}
        state="settling"
        roiFraction={0.6}
        settleProgress={0.5}
        mirrored={false}
      />,
    )
    const ring = container.querySelector('.settle-ring') as HTMLElement
    expect(ring.style.opacity).toBe('1')
    // Scale = 0.85 + progress * 0.15 → at 0.5 progress ≈ 0.925
    const match = ring.style.transform.match(/scale\(([\d.]+)\)/)
    expect(match).not.toBeNull()
    expect(parseFloat(match![1])).toBeCloseTo(0.925, 5)

    rerender(
      <CameraView
        videoRef={ref}
        stream={null}
        state="waiting"
        roiFraction={0.6}
        settleProgress={0.5}
        mirrored={false}
      />,
    )
    const ringNow = container.querySelector('.settle-ring') as HTMLElement
    expect(ringNow.style.opacity).toBe('0')
  })

  it('renders two video elements (main + blur overlay) and uses inset clip-path', () => {
    const ref = createRef<HTMLVideoElement>()
    const { container } = render(
      <CameraView
        videoRef={ref}
        stream={null}
        state="idle"
        roiFraction={0.6}
        settleProgress={0}
        mirrored={false}
      />,
    )
    const videos = container.querySelectorAll('video')
    expect(videos.length).toBe(2)
    const blur = videos[1] as HTMLVideoElement
    expect(blur.style.clipPath).toContain('inset(')
    expect(blur.style.clipPath).toContain('round 10px')
  })
})
