// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

// vi.useFakeTimers makes Date.now() advance with vi.advanceTimersByTime, so
// we just set the starting time once and let timer advances move the clock.
const START = 1_700_000_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNow', () => {
  it('returns the current time on first render', () => {
    const { result } = renderHook(() => useNow(false))
    expect(result.current).toBe(START)
  })

  it('does not tick when inactive', () => {
    const { result } = renderHook(() => useNow(false))
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current).toBe(START)
  })

  it('updates immediately on activation, then on the interval', () => {
    const { result } = renderHook(() => useNow(true, 1_000))
    // Initial render captured Date.now() before any timers ran.
    expect(result.current).toBe(START)

    // The effect schedules an immediate setTimeout(0) refresh.
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(START)

    // Interval ticks every `intervalMs` ms.
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current).toBe(START + 1_000)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current).toBe(START + 2_000)
  })

  it('respects a custom interval', () => {
    const { result } = renderHook(() => useNow(true, 5_000))
    act(() => {
      vi.advanceTimersByTime(0)
    })
    const baseline = result.current

    // Half-interval: no tick yet, but Date.now() has advanced so the next
    // tick will capture the elapsed time.
    act(() => {
      vi.advanceTimersByTime(2_500)
    })
    expect(result.current).toBe(baseline)

    // Cross the 5s boundary: interval fires, picks up the new Date.now.
    act(() => {
      vi.advanceTimersByTime(2_500)
    })
    expect(result.current).toBe(baseline + 5_000)
  })

  it('cleans up timers on unmount', () => {
    const { result, unmount } = renderHook(() => useNow(true, 1_000))
    act(() => {
      vi.advanceTimersByTime(0)
    })
    const afterInit = result.current
    unmount()
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current).toBe(afterInit)
  })

  it('toggles ticking when active flips', () => {
    const { result, rerender } = renderHook(({ active }) => useNow(active, 1_000), {
      initialProps: { active: false },
    })

    // Inactive — no update even after time passes.
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current).toBe(START)

    // Activate; the setTimeout(0) refreshes to the now-current time.
    rerender({ active: true })
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(result.current).toBe(START + 5_000)
  })
})
