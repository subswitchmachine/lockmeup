/**
 * Bridges the custom-image *storage* (IndexedDB Blobs, `customImages.ts`) with
 * the in-memory image *registry* (`puzzleImages.ts`). Storage knows nothing
 * about object URLs; the registry knows nothing about persistence — this module
 * turns stored Blobs into live `PuzzleImage` entries and keeps the two in sync.
 */
import {
  deleteCustomPool,
  loadCustomImages,
  saveCustomImages,
  type StoredCustomImage,
} from './customImages'
import {
  addCustomImages,
  registerCustomImages,
  removeCustomPool,
  type PuzzleImage,
} from './puzzleImages'

function toPuzzleImage(rec: StoredCustomImage): PuzzleImage {
  return { id: rec.id, pool: rec.pool, url: URL.createObjectURL(rec.blob) }
}

/**
 * Load every stored custom image and register it. Call once on app start,
 * before any image task renders — `imageUrl()` is synchronous, so a locked
 * session reloading would otherwise paint bundled fallbacks for its puzzles.
 */
export async function initCustomImages(): Promise<void> {
  const recs = await loadCustomImages()
  registerCustomImages(recs.map(toPuzzleImage))
}

const IMAGE_EXT = /\.(webp|jpe?g|png|avif|gif|bmp)$/i

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT.test(file.name)
}

/**
 * Persist and register the image files the user picked — either a whole folder
 * or loose files. The pool name is the top-level folder of
 * `webkitRelativePath` (loose files have none and land in "my images");
 * non-image files are ignored. Returns the pool names that were added
 * (usually one).
 */
export async function importImageFolder(files: File[]): Promise<string[]> {
  const records: StoredCustomImage[] = []
  for (const file of files) {
    if (!isImageFile(file)) continue
    // `webkitRelativePath` looks like `<folder>/<…>/<name>`; fall back to a
    // generic pool if the browser didn't supply a path.
    const rel = file.webkitRelativePath || file.name
    const parts = rel.split('/')
    const pool = parts.length > 1 ? parts[0] : 'my images'
    records.push({ id: rel, pool, blob: file })
  }
  if (records.length === 0) return []
  await saveCustomImages(records)
  addCustomImages(records.map(toPuzzleImage))
  return Array.from(new Set(records.map((r) => r.pool)))
}

/** Forget a user-supplied pool: delete its Blobs and unregister its images. */
export async function removeImagePool(pool: string): Promise<void> {
  await deleteCustomPool(pool)
  removeCustomPool(pool)
}
