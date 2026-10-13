// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AboutModal } from './AboutModal'

afterEach(cleanup)

describe('AboutModal', () => {
  it('renders the main about headings', () => {
    render(<AboutModal onClose={() => undefined} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('What is lockmeup?')).toBeTruthy()
    expect(screen.getByText('How it works')).toBeTruthy()
    expect(screen.getByText('Play safe')).toBeTruthy()
    expect(screen.getByText('Privacy')).toBeTruthy()
    expect(screen.getByText('Security limitations')).toBeTruthy()
    expect(screen.getByText('AI disclosure')).toBeTruthy()
    expect(screen.getByText('Open source')).toBeTruthy()
  })

  it('calls onClose when the dismiss button is clicked', () => {
    const onClose = vi.fn()
    render(<AboutModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click and Escape, but not on a click inside', () => {
    const onClose = vi.fn()
    const { container } = render(<AboutModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Privacy'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
