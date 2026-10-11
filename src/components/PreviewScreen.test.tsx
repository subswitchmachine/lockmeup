// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskSpec } from '../lib/tasks'
import { PreviewScreen } from './PreviewScreen'

afterEach(cleanup)

describe('PreviewScreen', () => {
  it('renders the top bar with a Back button and Preview label', () => {
    render(
      <PreviewScreen
        spec={{ kind: 'wait', durationMs: 1000, random: false, slideMs: null }}
        onExit={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Back/ })).toBeTruthy()
    expect(screen.getByText('Preview')).toBeTruthy()
  })

  it('calls onExit when Back is clicked', () => {
    const onExit = vi.fn()
    render(
      <PreviewScreen
        spec={{ kind: 'wait', durationMs: 1000, random: false, slideMs: null }}
        onExit={onExit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onExit).toHaveBeenCalled()
  })

  it('dispatches to the typing task for a typing spec', () => {
    const spec: TaskSpec = {
      kind: 'typing',
      line: 'hello',
      reps: 1,
      random: false,
      minPenaltyReps: 0,
      maxPenaltyReps: 0,
      slideMs: null,
    }
    render(<PreviewScreen spec={spec} onExit={vi.fn()} />)
    expect(screen.getByText('Write the line')).toBeTruthy()
  })

  it('dispatches to the wait task with a countdown', () => {
    render(
      <PreviewScreen
        spec={{ kind: 'wait', durationMs: 90_000, random: false, slideMs: null }}
        onExit={vi.fn()}
      />,
    )
    expect(screen.getByText('Wait')).toBeTruthy()
  })

  it('uses "Done" as the next label inside the previewed task', () => {
    // Make a typing task that's already at 0 reps so the proceed panel renders.
    const spec: TaskSpec = {
      kind: 'typing',
      line: 'x',
      reps: 1,
      random: false,
      minPenaltyReps: 0,
      maxPenaltyReps: 0,
      slideMs: null,
    }
    render(<PreviewScreen spec={spec} onExit={vi.fn()} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x' } })
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy()
  })
})
