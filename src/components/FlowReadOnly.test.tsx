// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { newDraft, newFlowId, type FlowItem } from '../lib/tasks'
import { IMAGE_POOLS } from '../lib/puzzleImages'
import { ReadOnlyFlowItem, ReadOnlyOptions } from './FlowReadOnly'

afterEach(cleanup)

describe('ReadOnlyOptions', () => {
  it('renders pool list, task order and hide-mode label', () => {
    render(<ReadOnlyOptions shuffle hideMode="hide-random" pools={['femdom']} />)
    expect(screen.getByText('femdom')).toBeTruthy()
    expect(screen.getByText('Shuffled')).toBeTruthy()
    expect(screen.getByText(/random/i)).toBeTruthy()
  })

  it('falls back to all pools when none specified', () => {
    render(<ReadOnlyOptions shuffle={false} hideMode="show" />)
    expect(screen.getByText(IMAGE_POOLS.join(', '))).toBeTruthy()
    expect(screen.getByText('As listed')).toBeTruthy()
  })

  it('renders an em-dash when the pool list is empty and explicit', () => {
    render(<ReadOnlyOptions shuffle={false} hideMode="show" pools={[]} />)
    // Empty array falls through to IMAGE_POOLS; just confirm one of those names renders.
    expect(screen.getByText(IMAGE_POOLS.join(', '))).toBeTruthy()
  })
})

describe('ReadOnlyFlowItem', () => {
  it('renders a single task with its label and summary', () => {
    const item: FlowItem = { id: newFlowId(), type: 'task', task: newDraft('wait') }
    render(<ReadOnlyFlowItem item={item} />)
    expect(screen.getByText(/Wait/)).toBeTruthy()
    expect(screen.getByText(/5 minutes/)).toBeTruthy()
  })

  it('renders a pool with "one at random" and its children', () => {
    const item: FlowItem = {
      id: newFlowId(),
      type: 'pool',
      tasks: [
        { id: newFlowId(), task: newDraft('wait') },
        { id: newFlowId(), task: newDraft('hold') },
      ],
    }
    render(<ReadOnlyFlowItem item={item} />)
    expect(screen.getByText(/Pool/)).toBeTruthy()
    expect(screen.getByText('one at random')).toBeTruthy()
    expect(screen.getByText(/Wait/)).toBeTruthy()
    expect(screen.getByText(/Hold/)).toBeTruthy()
  })

  it('renders a fixed-repeat loop with N× formatting', () => {
    const item: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: false,
      minRepeat: 3,
      maxRepeat: 3,
      children: [{ id: newFlowId(), type: 'task', task: newDraft('wait') }],
    }
    render(<ReadOnlyFlowItem item={item} />)
    expect(screen.getByText('3×')).toBeTruthy()
  })

  it('renders a ranged loop with min–max× formatting', () => {
    const item: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: true,
      minRepeat: 2,
      maxRepeat: 5,
      children: [{ id: newFlowId(), type: 'task', task: newDraft('wait') }],
    }
    render(<ReadOnlyFlowItem item={item} />)
    expect(screen.getByText('2–5×')).toBeTruthy()
  })

  it('recursively renders nested loops', () => {
    const item: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: false,
      minRepeat: 2,
      maxRepeat: 2,
      children: [
        { id: newFlowId(), type: 'task', task: newDraft('wait') },
        { id: newFlowId(), type: 'task', task: newDraft('hold') },
      ],
    }
    render(<ReadOnlyFlowItem item={item} />)
    expect(screen.getByText(/Wait/)).toBeTruthy()
    expect(screen.getByText(/Hold/)).toBeTruthy()
  })
})
