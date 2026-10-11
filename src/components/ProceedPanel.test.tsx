// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProceedPanel } from './ProceedPanel'

afterEach(cleanup)

describe('ProceedPanel', () => {
  it('renders the title and proceed label', () => {
    render(<ProceedPanel title="All done" nextLabel="Unlock" onComplete={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'All done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy()
  })

  it('omits the note paragraph when not provided', () => {
    render(<ProceedPanel title="Done" nextLabel="Next" onComplete={() => undefined} />)
    expect(document.querySelector('.panel-note')).toBeNull()
  })

  it('shows the note when provided', () => {
    render(
      <ProceedPanel
        title="Done"
        note="Nice work!"
        nextLabel="Next"
        onComplete={() => undefined}
      />,
    )
    expect(screen.getByText('Nice work!')).toBeTruthy()
  })

  it('calls onComplete when the button is clicked', () => {
    const onComplete = vi.fn()
    render(<ProceedPanel title="Done" nextLabel="Next task" onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next task' }))
    expect(onComplete).toHaveBeenCalled()
  })
})
