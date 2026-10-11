// @vitest-environment happy-dom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advanceProgress,
  decryptRecord,
  deleteLock,
  loadRecord,
  saveLock,
  type StoredLock,
} from './lockStore'
import { draftToSpec, newDraft } from './tasks'

beforeEach(async () => {
  // Reset both the fake IndexedDB and the in-memory state between tests.
  const dbs = await indexedDB.databases?.()
  if (dbs) {
    for (const db of dbs) {
      if (db.name) await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db.name!)
        req.onsuccess = req.onerror = req.onblocked = () => resolve(undefined)
      })
    }
  }
  // The crypto key module also caches the DB handle name internally; nothing
  // to reset there beyond the IndexedDB databases themselves.
  vi.restoreAllMocks()
})

const lock = (overrides: Partial<StoredLock> = {}): StoredLock => ({
  frames: [{ dataUrl: 'data:clear', blurredDataUrl: 'data:blur' }],
  lockedAt: 1_700_000_000_000,
  tasks: [draftToSpec(newDraft('wait'))],
  completedCount: 0,
  options: {
    hideMode: 'show',
    stepCountRandom: false,
    maxTotalMs: null,
    maxTotalRandom: false,
    pools: [],
  },
  ...overrides,
})

describe('loadRecord', () => {
  it('returns null when nothing has been saved', async () => {
    expect(await loadRecord()).toBeNull()
  })
})

describe('saveLock / loadRecord / decryptRecord', () => {
  it('persists plaintext metadata and encrypted frames; round-trips through decrypt', async () => {
    const original = lock()
    await saveLock(original)
    const rec = await loadRecord()
    expect(rec).not.toBeNull()
    // Plaintext fields survive the round-trip.
    expect(rec!.lockedAt).toBe(original.lockedAt)
    expect(rec!.completedCount).toBe(0)
    expect(rec!.tasks).toEqual(original.tasks)
    expect(rec!.options).toEqual(original.options)
    // The ciphertext is opaque.
    expect(rec!.iv).toBeInstanceOf(Uint8Array)
    expect(rec!.iv.byteLength).toBe(12)
    expect(rec!.data).toBeInstanceOf(ArrayBuffer)

    const decrypted = await decryptRecord(rec!)
    expect(decrypted.frames).toEqual(original.frames)
    expect(decrypted.tasks).toEqual(original.tasks)
  })

  it('overwrites the previous lock when saving again', async () => {
    await saveLock(lock({ lockedAt: 1 }))
    await saveLock(lock({ lockedAt: 2 }))
    const rec = await loadRecord()
    expect(rec!.lockedAt).toBe(2)
  })
})

describe('advanceProgress', () => {
  it('returns null when no lock is stored', async () => {
    expect(await advanceProgress(1)).toBeNull()
  })

  it('updates completedCount and keeps the frames intact', async () => {
    const original = lock({ completedCount: 0 })
    await saveLock(original)
    const updated = await advanceProgress(3)
    expect(updated).not.toBeNull()
    expect(updated!.completedCount).toBe(3)

    // Decrypting the new record yields the original frames + updated progress.
    const decrypted = await decryptRecord(updated!)
    expect(decrypted.frames).toEqual(original.frames)
    expect(decrypted.completedCount).toBe(3)
  })
})

describe('deleteLock', () => {
  it('removes the stored record', async () => {
    await saveLock(lock())
    expect(await loadRecord()).not.toBeNull()
    await deleteLock()
    expect(await loadRecord()).toBeNull()
  })

  it('is a no-op when nothing is stored', async () => {
    await deleteLock()
    expect(await loadRecord()).toBeNull()
  })
})
