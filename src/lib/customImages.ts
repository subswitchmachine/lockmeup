/**
 * IndexedDB persistence for user-supplied puzzle images.
 *
 * Unlike the bundled images (which ship as hashed Vite assets), images the user
 * picks from a folder on their own machine have to be stored as Blobs so they
 * survive a page reload — a locked session can run for hours/days and the
 * puzzles must keep rendering after a refresh. Object URLs are recreated from
 * these Blobs on every load (see `imageLibrary.ts`).
 *
 * This lives in its own database (separate from the lockbox) so the two can be
 * versioned independently — the lockbox upgrade path drops its store, which we
 * never want to happen to the user's image library.
 */

const DB_NAME = 'combo-custom-images'
const DB_VERSION = 1
const STORE = 'images'

/** One user-supplied image, keyed by `id` (`<pool>/<relative path>`). */
export interface StoredCustomImage {
  /** `<pool>/<relative path>` — unique across pools. */
  id: string
  /** The folder the user picked, used as a selectable pool name. */
  pool: string
  blob: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('pool', 'pool', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Store (or overwrite) a batch of images. */
export async function saveCustomImages(images: StoredCustomImage[]): Promise<void> {
  if (images.length === 0) return
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const img of images) store.put(img)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Read every stored custom image. */
export async function loadCustomImages(): Promise<StoredCustomImage[]> {
  const db = await openDb()
  try {
    return await new Promise<StoredCustomImage[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = () => resolve((req.result as StoredCustomImage[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/** Delete every image belonging to a pool (the user removing a folder). */
export async function deleteCustomPool(pool: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const index = tx.objectStore(STORE).index('pool')
      const req = index.openKeyCursor(IDBKeyRange.only(pool))
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          tx.objectStore(STORE).delete(cursor.primaryKey)
          cursor.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
