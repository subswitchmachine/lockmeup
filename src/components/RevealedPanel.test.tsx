// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureFrame } from '../hooks/useAutoCapture'
import { draftToSpec, newDraft } from '../lib/tasks'
import { RevealedPanel } from './RevealedPanel'

const frame = (n: number): CaptureFrame => ({
  dataUrl: `data:clear-${n}`,
  blurredDataUrl: `data:blur-${n}`,
})

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

const baseProps = {
  frames: [frame(1)],
  lockedAt: 1_700_000_000_000,
  unlockedAt: 1_700_000_300_000,
  tasks: [draftToSpec(newDraft('wait'))],
  taskResults: [
    { kind: 'wait' as const, durationMs: 60_000, errors: 0 },
  ],
  unlockMethod: 'tasks' as const,
}

describe('RevealedPanel', () => {
  it('renders the title, capture, and session-log summary', () => {
    render(<RevealedPanel {...baseProps} onStartOver={() => undefined} />)
    expect(screen.getByText('Released')).toBeTruthy()
    expect(screen.getByText('Locked')).toBeTruthy()
    expect(screen.getByText('Unlocked')).toBeTruthy()
    expect(screen.getByText('Total time')).toBeTruthy()
  })

  it('calls onStartOver when the New session button is clicked', () => {
    const onStartOver = vi.fn()
    render(<RevealedPanel {...baseProps} onStartOver={onStartOver} />)
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    expect(onStartOver).toHaveBeenCalled()
  })

  it('copies the share URL on Copy share link and flashes confirmation', async () => {
    render(<RevealedPanel {...baseProps} onStartOver={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))

    // The clipboard write is async; flush the promise queue.
    await act(async () => {
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toMatch(/^https?:\/\//)
    expect(screen.getByText('Link copied!')).toBeTruthy()

    // After 2s the label returns to "Copy share link".
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('Copy share link')).toBeTruthy()
  })

  it('copies the log code on Copy log code and renders the share textarea', async () => {
    render(<RevealedPanel {...baseProps} onStartOver={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy log code' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(typeof writeText.mock.calls[0][0]).toBe('string')
    expect(writeText.mock.calls[0][0].length).toBeGreaterThan(10)
    expect(screen.getByText('Code copied!')).toBeTruthy()

    // The share-panel textareas only appear after the first share.
    const areas = document.querySelectorAll('textarea.share-code-output')
    expect(areas.length).toBe(2)
  })

  it('marks the unlock method "Time limit" when unlockMethod is maxtime', () => {
    render(
      <RevealedPanel {...baseProps} unlockMethod="maxtime" onStartOver={() => undefined} />,
    )
    expect(screen.getByText('Time limit')).toBeTruthy()
  })
})
