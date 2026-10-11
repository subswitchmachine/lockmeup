// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../lib/captureConfig'
import { MetricsOverlay } from './MetricsOverlay'

afterEach(cleanup)

const liveMetrics = (over: Partial<{ sharpness: number; motion: number; baselineDiff: number; settleProgress: number }> = {}) => ({
  sharpness: 0,
  motion: 0,
  baselineDiff: 0,
  settleProgress: 0,
  ...over,
})

describe('MetricsOverlay', () => {
  it('renders the three metric rows with one-decimal values', () => {
    const { container } = render(
      <MetricsOverlay
        metrics={liveMetrics({ sharpness: 1234.5, motion: 6.78, baselineDiff: 22.4 })}
        config={DEFAULT_CONFIG}
      />,
    )
    const rows = container.querySelectorAll('.metric-row')
    expect(rows).toHaveLength(3)

    expect(screen.getByText('Focus')).toBeTruthy()
    expect(screen.getByText('Motion')).toBeTruthy()
    expect(screen.getByText('Presence')).toBeTruthy()
    expect(screen.getByText('1234.5')).toBeTruthy()
    expect(screen.getByText('6.8')).toBeTruthy()
    expect(screen.getByText('22.4')).toBeTruthy()
  })

  it('marks focus as passing when sharpness clears the focus threshold', () => {
    const { container } = render(
      <MetricsOverlay
        metrics={liveMetrics({ sharpness: DEFAULT_CONFIG.focusThreshold + 100 })}
        config={DEFAULT_CONFIG}
      />,
    )
    const focusRow = container.querySelectorAll('.metric-row')[0]
    expect(focusRow.classList.contains('pass')).toBe(true)
  })

  it('marks motion as passing when value is below the still threshold (lower-is-pass)', () => {
    const { container } = render(
      <MetricsOverlay
        metrics={liveMetrics({ motion: DEFAULT_CONFIG.stillThreshold - 1 })}
        config={DEFAULT_CONFIG}
      />,
    )
    const motionRow = container.querySelectorAll('.metric-row')[1]
    expect(motionRow.classList.contains('pass')).toBe(true)
  })

  it('marks presence as failing when baseline diff is below the arrival threshold', () => {
    const { container } = render(
      <MetricsOverlay
        metrics={liveMetrics({ baselineDiff: 0 })}
        config={DEFAULT_CONFIG}
      />,
    )
    const presenceRow = container.querySelectorAll('.metric-row')[2]
    expect(presenceRow.classList.contains('fail')).toBe(true)
  })

  it('caps the bar fill at 100% when the metric exceeds the bar scale', () => {
    const { container } = render(
      <MetricsOverlay
        metrics={liveMetrics({ sharpness: 1_000_000, motion: 0, baselineDiff: 0 })}
        config={DEFAULT_CONFIG}
      />,
    )
    const fill = container.querySelectorAll('.metric-fill')[0] as HTMLElement
    expect(fill.style.width).toBe('100%')
  })
})
