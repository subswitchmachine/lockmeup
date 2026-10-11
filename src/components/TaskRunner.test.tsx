// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LockMeta } from '../hooks/useLockbox'
import type { TaskSpec } from '../lib/tasks'
import { TaskRunner } from './TaskRunner'

afterEach(cleanup)

const baseOptions: LockMeta['options'] = {
  hideMode: 'show',
  stepCountRandom: false,
  maxTotalMs: null,
  maxTotalRandom: false,
  pools: [],
}

const lock = (tasks: TaskSpec[], completedCount = 0): LockMeta => ({
  tasks,
  completedCount,
  lockedAt: 0,
  options: baseOptions,
})

describe('TaskRunner', () => {
  it('renders the "Releasing…" panel when every task is complete', () => {
    const meta = lock([{ kind: 'wait', durationMs: 1000, random: false, slideMs: null }], 1)
    render(<TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />)
    expect(screen.getByText('Releasing…')).toBeTruthy()
    expect(screen.getByText(/your combination is being revealed/i)).toBeTruthy()
  })

  it('renders the wait countdown for a wait task', () => {
    const meta = lock([{ kind: 'wait', durationMs: 90_000, random: false, slideMs: null }])
    render(<TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />)
    expect(screen.getByText('Wait')).toBeTruthy()
    expect(screen.getByText('1m 30s')).toBeTruthy()
  })

  it('renders the typing task with its line', () => {
    const meta = lock([
      {
        kind: 'typing',
        line: 'hello world',
        reps: 1,
        random: false,
        minPenaltyReps: 0,
        maxPenaltyReps: 0,
        slideMs: null,
      },
    ])
    render(<TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />)
    expect(screen.getByText('Write the line')).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('hides the timer when hideMode is hide-random and the task is random', () => {
    const meta: LockMeta = {
      tasks: [{ kind: 'wait', durationMs: 60_000, random: true, slideMs: null }],
      completedCount: 0,
      lockedAt: 0,
      options: { ...baseOptions, hideMode: 'hide-random' },
    }
    render(<TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />)
    // The hidden-countdown placeholder ⏳ appears via aria-label.
    expect(screen.getByLabelText('Time remaining is hidden')).toBeTruthy()
  })

  it('still shows the timer for a fixed task when hideMode is hide-random', () => {
    const meta: LockMeta = {
      tasks: [{ kind: 'wait', durationMs: 60_000, random: false, slideMs: null }],
      completedCount: 0,
      lockedAt: 0,
      options: { ...baseOptions, hideMode: 'hide-random' },
    }
    render(<TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />)
    expect(screen.getByText('1m 0s')).toBeTruthy()
  })

  it('hides the timer for every task when hideMode is hide-all', () => {
    const meta: LockMeta = {
      tasks: [{ kind: 'wait', durationMs: 60_000, random: false, slideMs: null }],
      completedCount: 0,
      lockedAt: 0,
      options: { ...baseOptions, hideMode: 'hide-all' },
    }
    render(<TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />)
    expect(screen.getByLabelText('Time remaining is hidden')).toBeTruthy()
  })

  it('shows the proceed panel with "Unlock" for the last task once its wait is over', () => {
    // WaitTask captures `start` on mount via useState(() => now), so we have to
    // mount with `now < unlockAt` and then rerender past the deadline.
    const meta = lock([{ kind: 'wait', durationMs: 1000, random: false, slideMs: null }])
    const { rerender } = render(
      <TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />,
    )
    rerender(<TaskRunner meta={meta} now={5000} timeVerified onTaskComplete={vi.fn()} />)
    expect(screen.getByText("Time's up")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy()
  })

  it('shows "Next task" on intermediate tasks', () => {
    const meta = lock([
      { kind: 'wait', durationMs: 1000, random: false, slideMs: null },
      { kind: 'wait', durationMs: 1000, random: false, slideMs: null },
    ])
    const { rerender } = render(
      <TaskRunner meta={meta} now={0} timeVerified onTaskComplete={vi.fn()} />,
    )
    rerender(<TaskRunner meta={meta} now={5000} timeVerified onTaskComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Next task' })).toBeTruthy()
  })
})
