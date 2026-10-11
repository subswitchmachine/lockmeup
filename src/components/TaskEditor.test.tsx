// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newDraft, type TaskDraft } from '../lib/tasks'
import { TaskEditor } from './TaskEditor'

afterEach(cleanup)

describe('TaskEditor', () => {
  it('renders the kind title and description by default', () => {
    render(
      <TaskEditor initial={newDraft('memory')} onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(screen.getByRole('heading', { name: 'Memory' })).toBeTruthy()
    expect(screen.getByText(/Flip pairs of tiles/)).toBeTruthy()
  })

  it('lets the parent override the title (and hides the description)', () => {
    render(
      <TaskEditor
        initial={newDraft('memory')}
        title="Edit pool task"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Edit pool task' })).toBeTruthy()
    expect(screen.queryByText(/Flip pairs of tiles/)).toBeNull()
  })

  it('calls onSave with the unchanged draft when Save is clicked without edits', () => {
    const onSave = vi.fn()
    const draft = newDraft('wait')
    render(<TaskEditor initial={draft} onSave={onSave} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toEqual(draft)
  })

  it('calls onCancel when the Cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<TaskEditor initial={newDraft('wait')} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when the Escape key is pressed', () => {
    const onCancel = vi.fn()
    render(<TaskEditor initial={newDraft('wait')} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onCancel when the backdrop is clicked', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <TaskEditor initial={newDraft('wait')} onSave={vi.fn()} onCancel={onCancel} />,
    )
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    expect(onCancel).toHaveBeenCalled()
  })

  it('does NOT call onCancel when clicking inside the modal', () => {
    const onCancel = vi.fn()
    render(<TaskEditor initial={newDraft('wait')} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('disables Save when a typing task has an empty line', () => {
    render(<TaskEditor initial={newDraft('typing')} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Save once the typing line is non-blank', () => {
    const draft: TaskDraft = { ...newDraft('typing'), line: 'hello' }
    render(<TaskEditor initial={draft} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
