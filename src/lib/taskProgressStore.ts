/**
 * IndexedDB persistence for *in-progress* task state, so a half-finished task
 * survives a page reload. A lock can stay active for hours/days, so a refresh
 * mid-task must restore exactly where the user was — currently used by the v2
 * jigsaw (`JigsawTask2`) to remember every piece's position, orientation and
 * group, plus the pan/zoom view.
 *
 * This lives in its own database (separate from the lockbox and the custom-image
 * stores) so it can be versioned and cleared independently — wiping transient
 * task progress must never risk the lock itself or the user's image library.
 *
 * Records are keyed by `"<lockedAt>:<taskIndex>"`. Keying off the lock's
 * `lockedAt` timestamp means a brand-new lock can never collide with stale
 * progress from a previous one; `clearAllTaskProgress()` is still called on
 * lock creation/reset to keep the store tidy.
 */

const DB_NAME = 'combo-task-progress'
const DB_VERSION = 1
const STORE = 'progress'

/** One stored task-progress blob. `payload` is task-defined, plain-JSON state. */
export interface StoredTaskProgress {
  /** `"<lockedAt>:<taskIndex>"`. */
  key: string
  payload: unknown
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Read the saved progress payload for a key, or null if none. */
export async function loadTaskProgress(key: string): Promise<unknown | null> {
  const db = await openDb()
  try {
    return await new Promise<unknown | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as StoredTaskProgress | undefined)?.payload ?? null)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** Store (or overwrite) the progress payload for a key. */
export async function saveTaskProgress(key: string, payload: unknown): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, payload } satisfies StoredTaskProgress)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Delete the progress for a single key (e.g. once its task is complete). */
export async function clearTaskProgress(key: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Wipe all stored task progress (on lock creation/reset). */
export async function clearAllTaskProgress(): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
