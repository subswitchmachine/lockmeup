// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddMenu } from './AddMenu'

afterEach(cleanup)

describe('AddMenu', () => {
  it('starts closed and toggles open on the trigger click', () => {
    render(<AddMenu onAdd={() => undefined} />)
    expect(screen.queryByText('Tasks')).toBeNull()
    const trigger = screen.getByRole('button', { name: /\+ Add/ })
    fireEvent.click(trigger)
    expect(screen.getByText('Tasks')).toBeTruthy()
  })

  it('lists every task kind as a selectable item', () => {
    render(<AddMenu onAdd={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    // Match the full KIND_LABEL strings (emoji + name) since several names are
    // substrings of others (Hold / Hold still).
    const labels = [
      '🧩 Puzzle',
      '🔢 Sliding',
      '🃏 Memory',
      '⌨ Typing',
      '⏱ Wait',
      '✊ Hold',
      '🧘 Hold still',
      '👆 Tap',
      '🧠 Sequence',
      '✋ Steady hand',
    ]
    for (const label of labels) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('hides the Groups section when neither pool nor loop is allowed', () => {
    render(<AddMenu onAdd={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    expect(screen.queryByText('Groups')).toBeNull()
  })

  it('shows Pool when allowPool is set', () => {
    render(<AddMenu onAdd={() => undefined} allowPool />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    expect(screen.getByText('Groups')).toBeTruthy()
    expect(screen.getByText('🎲 Pool')).toBeTruthy()
    expect(screen.queryByText('🔁 Loop')).toBeNull()
  })

  it('shows Loop when allowLoop is set', () => {
    render(<AddMenu onAdd={() => undefined} allowLoop />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    expect(screen.getByText('🔁 Loop')).toBeTruthy()
  })

  it('emits the selected task kind and closes', () => {
    const onAdd = vi.fn()
    render(<AddMenu onAdd={onAdd} allowPool allowLoop />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    fireEvent.click(screen.getByText('🃏 Memory'))
    expect(onAdd).toHaveBeenCalledWith('memory')
    expect(screen.queryByText('Tasks')).toBeNull()
  })

  it('emits "pool" / "loop" sentinels for the group buttons', () => {
    const onAdd = vi.fn()
    render(<AddMenu onAdd={onAdd} allowPool allowLoop />)
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    fireEvent.click(screen.getByText('🎲 Pool'))
    expect(onAdd).toHaveBeenLastCalledWith('pool')

    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    fireEvent.click(screen.getByText('🔁 Loop'))
    expect(onAdd).toHaveBeenLastCalledWith('loop')
  })

  it('closes when clicking outside the menu', () => {
    render(
      <div>
        <AddMenu onAdd={() => undefined} />
        <button data-testid="outside">outside</button>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    expect(screen.getByText('Tasks')).toBeTruthy()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByText('Tasks')).toBeNull()
  })

  it('flips the trigger glyph when open', () => {
    render(<AddMenu onAdd={() => undefined} />)
    const trigger = screen.getByRole('button', { name: /\+ Add/ })
    expect(trigger.textContent).toContain('▾')
    fireEvent.click(trigger)
    expect(trigger.textContent).toContain('▴')
  })
})
