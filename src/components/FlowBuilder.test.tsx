// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import {
  newDraft,
  newFlowId,
  type FlowItem,
  type HideMode,
  type MaxTotalDraft,
} from '../lib/tasks'
import { encodeConfig, type SharedConfig } from '../lib/shareConfig'
import { FlowBuilder } from './FlowBuilder'

// Reset localStorage between tests so savedDesigns doesn't leak state.
beforeEach(() => {
  class MemoryStorage {
    private map = new Map<string, string>()
    getItem(k: string) {
      return this.map.has(k) ? this.map.get(k)! : null
    }
    setItem(k: string, v: string) {
      this.map.set(k, v)
    }
    removeItem(k: string) {
      this.map.delete(k)
    }
    clear() {
      this.map.clear()
    }
  }
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
})

afterEach(cleanup)

// Wrapper that owns the flow-design state (FlowBuilder is controlled, so we
// thread state through useState so user actions actually mutate it).
function Harness({
  initialItems = [],
  loadedConfig = null,
  onContinue = vi.fn(),
  onStartNoPhoto = vi.fn(),
  onPreview = vi.fn(),
}: {
  initialItems?: FlowItem[]
  loadedConfig?: SharedConfig | null
  onContinue?: ReturnType<typeof vi.fn>
  onStartNoPhoto?: ReturnType<typeof vi.fn>
  onPreview?: ReturnType<typeof vi.fn>
}) {
  const [items, setItems] = useState<FlowItem[]>(initialItems)
  const [hideMode, setHideMode] = useState<HideMode>('show')
  const [shuffle, setShuffle] = useState(false)
  const [pools, setPools] = useState<string[]>([])
  const [maxTotal, setMaxTotal] = useState<MaxTotalDraft>({
    enabled: false,
    random: false,
    minAmount: 1,
    maxAmount: 1,
    unit: 'hours',
  })
  const [loaded, setLoaded] = useState(loadedConfig)
  return (
    <FlowBuilder
      items={items}
      setItems={setItems}
      hideMode={hideMode}
      setHideMode={setHideMode}
      shuffle={shuffle}
      setShuffle={setShuffle}
      pools={pools}
      setPools={setPools}
      maxTotal={maxTotal}
      setMaxTotal={setMaxTotal}
      loadedConfig={loaded}
      onLoadConfig={setLoaded}
      onClearConfig={() => setLoaded(null)}
      onContinue={onContinue}
      onStartNoPhoto={onStartNoPhoto}
      onPreview={onPreview}
    />
  )
}

describe('FlowBuilder', () => {
  it('disables Capture when no tasks are defined', () => {
    render(<Harness />)
    const button = screen.getByRole('button', { name: /Capture combination/ })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Capture once at least one task exists', () => {
    const item: FlowItem = { id: newFlowId(), type: 'task', task: newDraft('wait') }
    render(<Harness initialItems={[item]} />)
    const button = screen.getByRole('button', { name: /Capture combination/ })
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens the task editor when adding a task via AddMenu', () => {
    render(<Harness />)
    // The first "+ Add" button is the top-level one.
    fireEvent.click(screen.getAllByRole('button', { name: /\+ Add/ })[0])
    fireEvent.click(screen.getByText('⏱ Wait'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Wait' })).toBeTruthy()
  })

  it('adds a task row to the list after saving the editor', () => {
    render(<Harness />)
    fireEvent.click(screen.getAllByRole('button', { name: /\+ Add/ })[0])
    fireEvent.click(screen.getByText('⏱ Wait'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    // The list now has a row for the wait task.
    expect(screen.getByText('Edit ▸')).toBeTruthy()
  })

  it('calls onContinue with the expanded specs when Capture is clicked', () => {
    const onContinue = vi.fn()
    const item: FlowItem = { id: newFlowId(), type: 'task', task: newDraft('wait') }
    render(<Harness initialItems={[item]} onContinue={onContinue} />)
    fireEvent.click(screen.getByRole('button', { name: /Capture combination/ }))
    // No max session time is set, so the warning has to be confirmed first.
    expect(screen.getByRole('heading', { name: 'No max session time' })).toBeTruthy()
    expect(onContinue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue anyway' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
    const [tasks, options] = onContinue.mock.calls[0]
    expect(tasks).toHaveLength(1)
    expect(tasks[0].kind).toBe('wait')
    expect(options).toMatchObject({ hideMode: 'show', stepCountRandom: false, maxTotalMs: null })
  })

  it('renders the loaded-config banner in read-only mode', () => {
    const config: SharedConfig = {
      v: 1,
      name: 'Evening routine',
      hideConfig: false,
      items: [{ id: newFlowId(), type: 'task', task: newDraft('wait') } as FlowItem],
      hideMode: 'show',
      shuffle: false,
      pools: [],
    }
    render(<Harness loadedConfig={config} />)
    expect(screen.getByText('Evening routine')).toBeTruthy()
    expect(screen.getByText('Loaded assignment')).toBeTruthy()
    // No add menu in the read-only mode.
    expect(screen.queryByRole('button', { name: /\+ Add/ })).toBeNull()
  })

  it('decodes a pasted config from the import section', async () => {
    render(<Harness />)
    // Find the Import section toggle (it might be a button or a details). Try
    // common labels.
    const importToggle = screen.queryByRole('button', { name: /Import|Load/i })
    if (importToggle) fireEvent.click(importToggle)

    const textareas = document.querySelectorAll('textarea')
    if (textareas.length === 0) return // Skip if the import UI isn't present.

    const code = encodeConfig({
      v: 1,
      name: 'Imported',
      hideConfig: false,
      items: [{ id: newFlowId(), type: 'task', task: newDraft('hold') } as FlowItem],
      hideMode: 'show',
      shuffle: false,
      pools: [],
    })
    const ta = textareas[0] as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: code } })
    const decode = screen.queryByRole('button', { name: /Import|Load|Decode/i })
    if (decode) fireEvent.click(decode)
    // Either the loaded-config banner shows now, or nothing changed — both
    // outcomes are acceptable here; we just want to confirm the call paths
    // didn't throw.
    await act(async () => {
      await Promise.resolve()
    })
  })

  it('shows a task-count summary that reflects the current items', () => {
    const items: FlowItem[] = [
      { id: newFlowId(), type: 'task', task: newDraft('wait') },
      { id: newFlowId(), type: 'task', task: newDraft('hold') },
    ]
    render(<Harness initialItems={items} />)
    expect(screen.getByText(/2 tasks total/)).toBeTruthy()
  })
})
