// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newDraft, newFlowId, type FlowChild, type FlowItem } from '../lib/tasks'
import { ChildEditor, LoopEditor } from './FlowItemEditors'

afterEach(cleanup)

const noop = () => undefined

describe('ChildEditor (task)', () => {
  it('renders the task label and summary', () => {
    const child: FlowChild = { id: newFlowId(), type: 'task', task: newDraft('wait') }
    render(
      <ChildEditor
        child={child}
        onChange={noop}
        openEditor={noop}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    expect(screen.getByText('⏱ Wait')).toBeTruthy()
    expect(screen.getByText(/5 minutes/)).toBeTruthy()
    expect(screen.getByText('Edit ▸')).toBeTruthy()
  })

  it('opens the editor when the row is clicked', () => {
    const openEditor = vi.fn()
    const child: FlowChild = { id: newFlowId(), type: 'task', task: newDraft('wait') }
    render(
      <ChildEditor
        child={child}
        onChange={noop}
        openEditor={openEditor}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Edit ▸/ }))
    expect(openEditor).toHaveBeenCalledTimes(1)
    expect(openEditor.mock.calls[0][0]).toEqual(child.task)
  })

  it('fires onPreview when the play button is clicked', () => {
    const onPreview = vi.fn()
    const child: FlowChild = { id: newFlowId(), type: 'task', task: newDraft('wait') }
    render(
      <ChildEditor
        child={child}
        onChange={noop}
        openEditor={noop}
        onPreview={onPreview}
        onRemove={noop}
      />,
    )
    fireEvent.click(screen.getByLabelText('Preview task'))
    expect(onPreview).toHaveBeenCalledWith(child.task)
  })

  it('removes the child via the row controls', () => {
    const onRemove = vi.fn()
    const child: FlowChild = { id: newFlowId(), type: 'task', task: newDraft('wait') }
    render(
      <ChildEditor
        child={child}
        onChange={noop}
        openEditor={noop}
        onPreview={noop}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByLabelText('Remove'))
    expect(onRemove).toHaveBeenCalled()
  })
})

describe('ChildEditor (pool)', () => {
  it('renders the pool header and child task rows', () => {
    const pool: FlowChild = {
      id: newFlowId(),
      type: 'pool',
      tasks: [
        { id: newFlowId(), task: newDraft('wait') },
        { id: newFlowId(), task: newDraft('hold') },
      ],
    }
    render(
      <ChildEditor
        child={pool}
        onChange={noop}
        openEditor={noop}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    expect(screen.getByText('🎲 Pool')).toBeTruthy()
    expect(screen.getByText('one at random')).toBeTruthy()
    expect(screen.getByText('⏱ Wait')).toBeTruthy()
    expect(screen.getByText('✊ Hold')).toBeTruthy()
  })

  it('replaces a child task when the row save fires', () => {
    const pool: FlowChild = {
      id: 'p',
      type: 'pool',
      tasks: [{ id: 't1', task: newDraft('wait') }],
    }
    const onChange = vi.fn()
    let savedFn: ((d: typeof pool.tasks[0]['task']) => void) | null = null
    render(
      <ChildEditor
        child={pool}
        onChange={onChange}
        openEditor={(_d, save) => {
          savedFn = save
        }}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    fireEvent.click(screen.getByText('Edit ▸'))
    expect(savedFn).toBeTruthy()
    savedFn!(newDraft('hold'))
    expect(onChange).toHaveBeenCalled()
    const replaced = onChange.mock.calls[0][0]
    expect(replaced.type).toBe('pool')
    expect(replaced.tasks[0].task.kind).toBe('hold')
  })
})

describe('LoopEditor', () => {
  const baseLoop = (overrides: Partial<Extract<FlowItem, { type: 'loop' }>> = {}): Extract<
    FlowItem,
    { type: 'loop' }
  > => ({
    id: 'loop',
    type: 'loop',
    random: false,
    minRepeat: 3,
    maxRepeat: 3,
    children: [{ id: 'c1', type: 'task', task: newDraft('wait') }],
    ...overrides,
  })

  it('renders the loop header with the repeat count and ×', () => {
    render(
      <LoopEditor
        loop={baseLoop()}
        onChange={noop}
        openEditor={noop}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    expect(screen.getByText('🔁 Repeat')).toBeTruthy()
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('3')
    expect(screen.getByText('×')).toBeTruthy()
  })

  it('toggles to a range when "random" is checked', () => {
    const onChange = vi.fn()
    render(
      <LoopEditor
        loop={baseLoop()}
        onChange={onChange}
        openEditor={noop}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[0][0]).toMatchObject({ random: true })
  })

  it('removes a child via its inner remove button', () => {
    const onChange = vi.fn()
    render(
      <LoopEditor
        loop={baseLoop()}
        onChange={onChange}
        openEditor={noop}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    // Multiple "Remove" buttons exist (loop itself + children); first is the
    // loop control, second is the child's row button.
    const removes = screen.getAllByLabelText('Remove')
    fireEvent.click(removes[1])
    expect(onChange).toHaveBeenCalled()
    expect(onChange.mock.calls[0][0]).toMatchObject({ children: [] })
  })

  it('adds a Pool child via the dropdown', () => {
    const onChange = vi.fn()
    render(
      <LoopEditor
        loop={baseLoop()}
        onChange={onChange}
        openEditor={noop}
        onPreview={noop}
        onRemove={noop}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /\+ Add/ }))
    fireEvent.click(screen.getByText('🎲 Pool'))
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls[0][0]
    expect(next.children).toHaveLength(2)
    expect(next.children[1].type).toBe('pool')
  })
})
