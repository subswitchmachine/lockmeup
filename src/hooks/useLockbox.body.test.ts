// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLockbox } from './useLockbox'
import { draftToSpec, newDraft } from '../lib/tasks'

async function resetDb() {
  const dbs = await indexedDB.databases?.()
  if (!dbs) return
  for (const db of dbs) {
    if (db.name) {
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db.name!)
        req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined)
      })
    }
  }
}

beforeEach(async () => {
  await resetDb()
  // syncTrustedTime calls fetch() — stub it to a failing source so the test
  // doesn't hit the real network.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const frame = { dataUrl: 'data:clear', blurredDataUrl: 'data:blur' }
const sampleTasks = () => [draftToSpec(newDraft('wait')), draftToSpec(newDraft('hold'))]
const defaultOptions = {
  hideMode: 'show' as const,
  stepCountRandom: false,
  maxTotalMs: null,
  maxTotalRandom: false,
  pools: [] as string[],
}

describe('useLockbox', () => {
  it('starts in loading state with no meta', async () => {
    const { result } = renderHook(() => useLockbox())
    expect(result.current.loading).toBe(true)
    expect(result.current.meta).toBeNull()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.meta).toBeNull()
  })

  it('locks a capture and exposes meta but no frames yet', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.lockAway([frame], sampleTasks(), defaultOptions)
    })

    expect(result.current.meta).not.toBeNull()
    expect(result.current.meta!.tasks).toHaveLength(2)
    expect(result.current.meta!.completedCount).toBe(0)
    // Frames stay null until reveal.
    expect(result.current.frames).toBeNull()
  })

  it('completing every task triggers an auto-reveal of the frames', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.lockAway([frame], sampleTasks(), defaultOptions)
    })

    // Two wait/hold tasks → completeCurrentTask twice triggers reveal.
    await act(async () => {
      await result.current.completeCurrentTask({ kind: 'wait', durationMs: 1, errors: 0 })
    })
    await act(async () => {
      await result.current.completeCurrentTask({ kind: 'hold', durationMs: 2, errors: 1 })
    })

    await waitFor(() => expect(result.current.frames).not.toBeNull())
    expect(result.current.frames).toEqual([frame])
    expect(result.current.unlockMethod).toBe('tasks')
    expect(result.current.taskResults).toHaveLength(2)
  })

  it('reveal(maxtime) decrypts the frames and reports the maxtime method', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.lockAway([frame], sampleTasks(), defaultOptions)
    })

    act(() => {
      result.current.reveal('maxtime')
    })
    await waitFor(() => expect(result.current.frames).not.toBeNull())
    expect(result.current.unlockMethod).toBe('maxtime')
    expect(result.current.unlockedAt).not.toBeNull()
  })

  it('clear() removes the persisted lock and resets state', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.lockAway([frame], sampleTasks(), defaultOptions)
    })
    expect(result.current.meta).not.toBeNull()

    await act(async () => {
      await result.current.clear()
    })
    expect(result.current.meta).toBeNull()
    expect(result.current.frames).toBeNull()

    // Re-mounting should observe no record.
    const { result: result2 } = renderHook(() => useLockbox())
    await waitFor(() => expect(result2.current.loading).toBe(false))
    expect(result2.current.meta).toBeNull()
  })

  it('completeCurrentTask is a no-op when nothing is locked', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.completeCurrentTask({ kind: 'wait', durationMs: 1, errors: 0 })
    })
    expect(result.current.meta).toBeNull()
    expect(result.current.taskResults).toEqual([])
  })

  it('exposes timeVerified=false when the trusted-time sync fails', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // syncTrustedTime() rejects via the stubbed fetch → false.
    await waitFor(() => expect(result.current.timeVerified).toBe(false))
  })

  it('a freshly mounted hook recovers a previously locked record', async () => {
    // First mount: lock something.
    const first = renderHook(() => useLockbox())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    await act(async () => {
      await first.result.current.lockAway([frame], sampleTasks(), defaultOptions)
    })
    first.unmount()

    // Second mount: should see the persisted record.
    const second = renderHook(() => useLockbox())
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.meta).not.toBeNull()
    expect(second.result.current.meta!.tasks).toHaveLength(2)
    expect(second.result.current.frames).toBeNull()
  })
})
