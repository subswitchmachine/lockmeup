import type { CaptureFrame } from '../hooks/useAutoCapture'
import type { LockOptions, TaskSpec } from './tasks'
import { decryptString, encryptString } from './crypto'

/**
 * IndexedDB persistence for a single locked capture. Used instead of
 * localStorage because three full-resolution PNG frames easily exceed the
 * ~5MB localStorage budget.
 *
 * The frames are encrypted at rest with AES-GCM (see crypto.ts). The unlock
 * condition is a series of tasks (e.g. a jigsaw); the task specs and how far
 * through the series we are (`completedCount`) are stored in plaintext so the
 * locked UI can render the active task without decrypting the secret frames.
 * This is a good-faith barrier, not tamper-proof: task completion is decided on
 * the client, so a determined user could reveal early via devtools — the same
 * threat model the time-based version had.
 */

const DB_NAME = 'combo-lockbox'
const DB_VERSION = 11
const STORE = 'lock'
const KEY = 'current'

export interface StoredLock {
  frames: CaptureFrame[]
  /** When the capture was locked away, on trusted time (ms epoch). Enforcement. */
  lockedAt: number
  /**
   * The same moment on the device's own clock (`Date.now()`), for display only.
   * Session durations and the reveal log are computed from this so they can't
   * mix clock bases with the `Date.now()` taken at reveal — a trusted source
   * that is stale or unavailable then shows up as bogus elapsed time.
   * Optional: records written before this field existed won't have it.
   */
  wallLockedAt?: number
  /** The ordered task series that gates the reveal. */
  tasks: TaskSpec[]
  /** How many tasks from the front of the series are already complete. */
  completedCount: number
  /** Display options (hide timer / step count). */
  options: LockOptions
}

/**
 * What actually lives in IndexedDB: the encrypted frames blob plus plaintext
 * progress (task specs + completedCount + options) used to drive the locked UI.
 * None of that is secret — only the frames are encrypted.
 */
export interface EncryptedRecord {
  iv: Uint8Array
  data: ArrayBuffer
  lockedAt: number
  /** Mirrors `StoredLock.wallLockedAt`; absent on records from older versions. */
  wallLockedAt?: number
  tasks: TaskSpec[]
  completedCount: number
  options: LockOptions
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      // The v1 schema stored a time-based unlock that can't be migrated to a
      // task series, so drop and recreate the store on upgrade.
      const db = req.result
      if (db.objectStoreNames.contains(STORE)) {
        db.deleteObjectStore(STORE)
      }
      db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Read the raw encrypted record without decrypting (lazy). */
export async function loadRecord(): Promise<EncryptedRecord | null> {
  const db = await openDb()
  try {
    return await new Promise<EncryptedRecord | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as EncryptedRecord | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** Decrypt a record to the full lock (frames + authoritative progress). */
export async function decryptRecord(rec: EncryptedRecord): Promise<StoredLock> {
  return JSON.parse(await decryptString({ iv: rec.iv, data: rec.data })) as StoredLock
}

export async function saveLock(lock: StoredLock): Promise<void> {
  const { iv, data } = await encryptString(JSON.stringify(lock))
  const record: EncryptedRecord = {
    iv,
    data,
    lockedAt: lock.lockedAt,
    wallLockedAt: lock.wallLockedAt,
    tasks: lock.tasks,
    completedCount: lock.completedCount,
    options: lock.options,
  }
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Persist forward progress through the task series by re-encrypting the stored
 * lock with an updated `completedCount`. Returns the fresh encrypted record (so
 * callers can keep their cached copy in sync), or null if nothing is stored.
 */
export async function advanceProgress(completedCount: number): Promise<EncryptedRecord | null> {
  const rec = await loadRecord()
  if (!rec) return null
  const lock = await decryptRecord(rec)
  await saveLock({ ...lock, completedCount })
  return loadRecord()
}

export async function deleteLock(): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
