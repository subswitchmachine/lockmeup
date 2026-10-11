// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TypingTask } from './TypingTask'

afterEach(cleanup)
beforeEach(() => vi.restoreAllMocks())

const defaults = {
  reps: 2,
  minPenaltyReps: 0,
  maxPenaltyReps: 0,
  hideTimer: false,
  hideDetails: false,
  slideMs: null,
  nextLabel: 'Next',
}

describe('TypingTask', () => {
  it('shows a placeholder panel when no line is configured', () => {
    render(<TypingTask line="" {...defaults} onComplete={() => undefined} />)
    expect(screen.getByText('No line configured for this task.')).toBeTruthy()
  })

  it('renders the line and rep count', () => {
    const { container } = render(
      <TypingTask line="hi" {...defaults} onComplete={() => undefined} />,
    )
    expect(container.querySelector('.typing-reps')?.textContent).toContain('2')
    expect(container.querySelector('.typing-reps')?.textContent).toContain('reps remaining')
  })

  it('decrements rep count on a successful line', () => {
    const { container } = render(
      <TypingTask line="hi" {...defaults} onComplete={() => undefined} />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hi' } })
    const reps = container.querySelector('.typing-reps')?.textContent ?? ''
    expect(reps).toContain('1')
    expect(reps).toContain('rep remaining') // singular
  })

  it('clears the input and counts an error on a wrong character', () => {
    const onComplete = vi.fn()
    const { container } = render(
      <TypingTask
        line="hi"
        {...defaults}
        reps={1}
        maxPenaltyReps={2}
        minPenaltyReps={2}
        onComplete={onComplete}
      />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x' } })
    expect(input.value).toBe('')
    // Penalty added 2 reps, taking the count to 1 + 2 = 3.
    expect(container.querySelector('.typing-reps')?.textContent).toContain('3')
  })

  it('completes after the last rep and reports the error count', () => {
    const onComplete = vi.fn()
    render(<TypingTask line="ok" {...defaults} reps={1} onComplete={onComplete} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ok' } })

    // Done panel now visible.
    expect(screen.getByText('Done')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onComplete).toHaveBeenCalledWith(0)
  })

  it('counts cumulative errors across multiple mistakes', () => {
    const onComplete = vi.fn()
    render(<TypingTask line="ok" {...defaults} reps={1} maxPenaltyReps={0} minPenaltyReps={0} onComplete={onComplete} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x' } }) // error 1
    fireEvent.change(input, { target: { value: 'y' } }) // error 2
    fireEvent.change(input, { target: { value: 'ok' } }) // complete
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onComplete).toHaveBeenCalledWith(2)
  })

  it('blocks paste', () => {
    render(<TypingTask line="ok" {...defaults} onComplete={() => undefined} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    const event = new Event('paste', { bubbles: true, cancelable: true })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('shows a progress bar instead of the rep count when hideTimer is set', () => {
    const { container } = render(
      <TypingTask line="hi" {...defaults} hideTimer onComplete={() => undefined} />,
    )
    expect(container.querySelector('.typing-progress-track')).toBeTruthy()
    expect(screen.queryByText(/reps remaining/)).toBeNull()
  })

  it('renders pending/ok/bad character classes based on input progress', () => {
    const { container } = render(
      <TypingTask line="ab" {...defaults} onComplete={() => undefined} />,
    )
    const input = screen.getByRole('textbox') as HTMLInputElement
    // Type a single correct char.
    fireEvent.change(input, { target: { value: 'a' } })
    const chars = container.querySelectorAll('.typing-char')
    expect(chars[0].className).toContain('ok')
    expect(chars[1].className).toContain('pending')
  })
})
