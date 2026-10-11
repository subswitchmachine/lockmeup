// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { draftToSpec, newDraft } from '../lib/tasks'

/**
 * Trusted time runs 18 minutes behind the device clock — what actually happened
 * in production when worldtimeapi.org went down and the fallback (timeapi.io)
 * served a badly-set server clock. `lockedAt` was taken from trusted time and
 * `unlockedAt` from `Date.now()`, so a session finished in seconds reported
 * ~18 minutes of elapsed time in its log.
 */
const SKEW_MS = 18 * 60_000

vi.mock('../lib/trustedTime', () => ({
  trustedNow: () => Date.now() - SKEW_MS,
  syncTrustedTime: async () => true,
}))

const { useLockbox } = await import('./useLockbox')

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

beforeEach(resetDb)

const frame = { dataUrl: 'data:clear', blurredDataUrl: 'data:blur' }
const sampleTasks = () => [draftToSpec(newDraft('wait'))]
const defaultOptions = {
  hideMode: 'show' as const,
  stepCountRandom: false,
  maxTotalMs: null,
  maxTotalRandom: false,
  pools: [] as string[],
}

describe('useLockbox session timing with a skewed trusted clock', () => {
  it('reports elapsed time from the device clock, not the skewed trusted one', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.lockAway([frame], sampleTasks(), defaultOptions)
    })
    await act(async () => {
      await result.current.completeCurrentTask({ kind: 'wait', durationMs: 1, errors: 0 })
    })
    await waitFor(() => expect(result.current.frames).not.toBeNull())

    // The pair the session log is built from must span the real session, not
    // the 18-minute gap between the two clocks.
    const elapsed = result.current.unlockedAt! - result.current.lockedAt!
    expect(elapsed).toBeGreaterThanOrEqual(0)
    expect(elapsed).toBeLessThan(5_000)
  })

  it('still records the trusted timestamp for deadline enforcement', async () => {
    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const before = Date.now()
    await act(async () => {
      await result.current.lockAway([frame], sampleTasks(), defaultOptions)
    })

    // `lockedAt` stays on trusted time so a forward-set OS clock can't shorten
    // a maxTotal deadline; only the display/log pair moves to the wall clock.
    const meta = result.current.meta!
    expect(meta.lockedAt).toBeLessThanOrEqual(before - SKEW_MS + 1000)
    expect(meta.wallLockedAt!).toBeGreaterThanOrEqual(before)
    expect(meta.wallLockedAt! - meta.lockedAt).toBeCloseTo(SKEW_MS, -3)
  })

  it('falls back to the trusted timestamp for records written before wallLockedAt', async () => {
    const { saveLock } = await import('../lib/lockStore')
    const legacyLockedAt = Date.now() - SKEW_MS - 60_000
    // No `wallLockedAt` — exactly what an older version persisted.
    await saveLock({
      frames: [frame],
      lockedAt: legacyLockedAt,
      tasks: sampleTasks(),
      completedCount: 0,
      options: defaultOptions,
    })

    const { result } = renderHook(() => useLockbox())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.meta!.wallLockedAt).toBeUndefined()

    await act(async () => {
      await result.current.completeCurrentTask({ kind: 'wait', durationMs: 1, errors: 0 })
    })
    await waitFor(() => expect(result.current.frames).not.toBeNull())
    expect(result.current.lockedAt).toBe(legacyLockedAt)
  })
})
