// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { draftToSpec, newDraft } from '../lib/tasks'
import type { TaskLog } from '../lib/shareConfig'
import { SessionLog } from './SessionLog'

afterEach(cleanup)

const log = (overrides: Partial<TaskLog> = {}): TaskLog => ({
  v: 1,
  lockedAt: 1_700_000_000_000,
  unlockedAt: 1_700_000_120_000,
  unlockMethod: 'tasks',
  tasks: [draftToSpec(newDraft('wait')), draftToSpec(newDraft('hold'))],
  results: [
    { kind: 'wait', durationMs: 60_000, errors: 0 },
    { kind: 'hold', durationMs: 30_000, errors: 2 },
  ],
  ...overrides,
})

describe('SessionLog', () => {
  it('renders the summary rows + total time', () => {
    render(<SessionLog log={log()} />)
    expect(screen.getByText('Locked')).toBeTruthy()
    expect(screen.getByText('Unlocked')).toBeTruthy()
    expect(screen.getByText('Total time')).toBeTruthy()
    expect(screen.getByText('2m 0s')).toBeTruthy()
  })

  it('labels the unlock method based on how it ended', () => {
    render(<SessionLog log={log({ unlockMethod: 'maxtime' })} />)
    expect(screen.getByText('Time limit')).toBeTruthy()
    cleanup()
    render(<SessionLog log={log({ unlockMethod: 'tasks' })} />)
    expect(screen.getByText('Task completion')).toBeTruthy()
  })

  it('renders the per-task table when results exist', () => {
    render(<SessionLog log={log()} />)
    expect(screen.getByText('Task')).toBeTruthy()
    expect(screen.getByText('Config')).toBeTruthy()
    expect(screen.getByText('Errors')).toBeTruthy()
    expect(screen.getByText('Wait')).toBeTruthy()
    expect(screen.getByText('Hold still')).toBeTruthy()
    // Error counts from results.
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })

  it('hides the tasks table when there are no results', () => {
    render(<SessionLog log={log({ results: [] })} />)
    expect(screen.queryByText('Task')).toBeNull()
    expect(screen.queryByText('Config')).toBeNull()
  })

  it('falls back to an em-dash when a result has no matching spec', () => {
    render(
      <SessionLog
        log={log({
          tasks: [],
          results: [{ kind: 'wait', durationMs: 30_000, errors: 0 }],
        })}
      />,
    )
    expect(screen.getByText('—')).toBeTruthy()
  })
})
