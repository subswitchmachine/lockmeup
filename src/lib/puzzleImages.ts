import { shuffle } from './random'

/**
 * Bundled images used to build jigsaw / memory / sequence / slideshow tasks.
 *
 * The set is discovered automatically from `src/img/<pool>/` at build time via
 * `import.meta.glob`: each subdirectory of `src/img` becomes a selectable pool
 * (drop a new folder in to add one). Vite bundles each image as a hashed asset.
 *
 * `src/img` is gitignored — the real images live outside this repo and are
 * checked out into it by the deploy workflow. A checkout without them falls
 * back to the placeholder pool in `src/img-sample/`, so the app and tests still
 * have something to work with. The placeholders are ignored whenever `src/img`
 * has any image at all.
 */
export interface PuzzleImage {
  /** `<pool>/<filename>` — unique across pools. */
  id: string
  url: string
  pool: string
}

const bundled = import.meta.glob('../img/*/*.{webp,jpg,jpeg,png,avif,gif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const samples = import.meta.glob('../img-sample/*/*.{webp,jpg,jpeg,png,avif,gif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const modules = Object.keys(bundled).length > 0 ? bundled : samples

export const PUZZLE_IMAGES: PuzzleImage[] = Object.entries(modules)
  .map(([path, url]) => {
    // path looks like `../img/<pool>/<filename>` (or `../img-sample/…`)
    const parts = path.split('/')
    const filename = parts[parts.length - 1]
    const pool = parts[parts.length - 2]
    return { id: `${pool}/${filename}`, url, pool }
  })
  .sort((a, b) => a.id.localeCompare(b.id))

export const IMAGE_POOLS: string[] = Array.from(
  new Set(PUZZLE_IMAGES.map((img) => img.pool)),
).sort()

/* ---- Custom (user-supplied) images ----------------------------------------
 * Images the user picks from a folder on their own machine are layered on top
 * of the bundled set at runtime. They're stored as Blobs in IndexedDB and
 * turned into object URLs on load (see `imageLibrary.ts`), then registered here
 * so the rest of the app treats them exactly like bundled images. The registry
 * is a small external store React subscribes to via `useSyncExternalStore`.
 */
let customImages: PuzzleImage[] = []

const listeners = new Set<() => void>()
// `useSyncExternalStore` requires snapshots to be referentially stable while
// nothing changes, so the pool lists are cached and only rebuilt on a change.
let poolsSnapshot: string[] = IMAGE_POOLS
let customPoolsSnapshot: string[] = []
// Bumped on every registry change so `pickRandomImage`'s shuffle bag refills
// instead of serving stale (possibly revoked) URLs.
let generation = 0

function allImages(): PuzzleImage[] {
  return customImages.length > 0 ? [...PUZZLE_IMAGES, ...customImages] : PUZZLE_IMAGES
}

function recompute(): void {
  generation += 1
  customPoolsSnapshot = Array.from(new Set(customImages.map((img) => img.pool))).sort()
  poolsSnapshot = Array.from(new Set(allImages().map((img) => img.pool))).sort()
  listeners.forEach((fn) => fn())
}

/** Subscribe to custom-image registry changes (for `useSyncExternalStore`). */
export function subscribeImages(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** All pool names (bundled + custom), sorted. Stable reference between changes. */
export function getPoolsSnapshot(): string[] {
  return poolsSnapshot
}

/** Just the user-supplied pool names, sorted. Stable reference between changes. */
export function getCustomPoolsSnapshot(): string[] {
  return customPoolsSnapshot
}

/** Replace the entire custom registry (used on initial load), revoking old URLs. */
export function registerCustomImages(images: PuzzleImage[]): void {
  for (const img of customImages) URL.revokeObjectURL(img.url)
  customImages = images.slice()
  recompute()
}

/** Merge a batch of custom images in, replacing any with the same id. */
export function addCustomImages(images: PuzzleImage[]): void {
  const byId = new Map(customImages.map((img) => [img.id, img]))
  for (const img of images) {
    const existing = byId.get(img.id)
    if (existing && existing.url !== img.url) URL.revokeObjectURL(existing.url)
    byId.set(img.id, img)
  }
  customImages = [...byId.values()]
  recompute()
}

/** Drop every custom image in a pool, revoking its object URLs. */
export function removeCustomPool(pool: string): void {
  const keep: PuzzleImage[] = []
  for (const img of customImages) {
    if (img.pool === pool) URL.revokeObjectURL(img.url)
    else keep.push(img)
  }
  customImages = keep
  recompute()
}

/** Resolve a stored `imageId` back to its URL. Falls back to basename match for
 *  pre-pool records (where ids were bare filenames), then to the first image. */
export function imageUrl(id: string): string {
  const images = allImages()
  const direct = images.find((img) => img.id === id)
  if (direct) return direct.url
  const byName = images.find((img) => img.id.endsWith('/' + id))
  return (byName ?? PUZZLE_IMAGES[0]).url
}

function filterByPools(pools?: string[]): PuzzleImage[] {
  const all = allImages()
  if (!pools || pools.length === 0) return all
  const set = new Set(pools)
  const filtered = all.filter((img) => set.has(img.pool))
  return filtered.length > 0 ? filtered : all
}

// "Shuffle bag": draw images from a shuffled copy of the current pool selection
// so every image appears once before any repeats. The bag is rebuilt whenever
// it empties or the active pool key changes.
let bag: PuzzleImage[] = []
let bagKey = ''
let lastPicked: PuzzleImage | null = null

function refillBag(source: PuzzleImage[]): void {
  bag = shuffle(source.slice())
  // Avoid a back-to-back repeat across the bag boundary (next draw is the last
  // element); swap it forward if it matches the previous pick.
  if (bag.length > 1 && lastPicked && bag[bag.length - 1].id === lastPicked.id) {
    ;[bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]]
  }
}

/**
 * Pick the next bundled image for a task. Cycles through all images in the
 * selected pools in a random order before repeating any. Omit `pools` to draw
 * from every pool.
 */
export function pickRandomImage(pools?: string[]): PuzzleImage {
  const source = filterByPools(pools)
  const key = `${generation}#${pools ? [...pools].sort().join(',') : '*'}`
  if (bag.length === 0 || key !== bagKey) {
    refillBag(source)
    bagKey = key
  }
  const img = bag.pop() ?? source[0]
  lastPicked = img
  return img
}

/**
 * Pick `n` distinct image ids (for memory-match pairs). Clamped to the number of
 * available images in the selected pools; uses an independent shuffle so it
 * doesn't drain the bag.
 */
export function pickDistinctImages(n: number, pools?: string[]): string[] {
  const source = filterByPools(pools)
  const pool = shuffle(source.slice())
  return pool.slice(0, Math.max(1, Math.min(n, pool.length))).map((img) => img.id)
}
