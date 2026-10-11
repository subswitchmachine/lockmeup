/**
 * Trusted current time, fetched from an online source so the unlock decision
 * doesn't rely on the OS clock (which a user could simply set forward).
 *
 * After one successful sync we anchor to performance.now(), a monotonic timer
 * that an OS clock change can't move. Any drift during sleep only makes the
 * result *lag* real time (revealing late, never early — the safe direction).
 *
 * Sources are queried in parallel and the **median** offset wins, so a single
 * provider with a badly-set clock can't poison the anchor. That failure is not
 * hypothetical: timeapi.io served times ~18 minutes in the past while
 * worldtimeapi.org was down entirely, so the old first-success-wins list
 * silently backdated every lock. Hence the median, and hence the same-origin
 * source below — it needs no third party at all.
 *
 * Defeating this requires intercepting the network response (DevTools "Local
 * Overrides" / a proxy), which is beyond the casual-tamper threat model.
 */

/** Difference between trusted epoch ms and performance.now(), from one sample. */
interface Sample {
  offsetMs: number
}

let anchorOffsetMs: number | null = null

/** Give up on a source rather than stalling the whole sync behind it. */
const SOURCE_TIMEOUT_MS = 6000

/** Anything older than this is a broken source, not a clock we should trust. */
const MIN_PLAUSIBLE_MS = Date.UTC(2025, 0, 1)

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal?.timeout === 'function'
    ? AbortSignal.timeout(SOURCE_TIMEOUT_MS)
    : undefined
}

/** Trusted epoch ms from a response's `Date` header, or NaN. */
function headerDate(r: Response): number {
  const raw = r.headers.get('date')
  return raw ? Date.parse(raw) : NaN
}

/** Read `ts=<epoch seconds>` out of a Cloudflare `/cdn-cgi/trace` body. */
function cdnCgiTrace(endpoint: string): () => Promise<number> {
  return async () => {
    const r = await fetch(endpoint, { cache: 'no-store', signal: timeoutSignal() })
    if (!r.ok) throw new Error(`${endpoint} ${r.status}`)
    const ts = /(?:^|\n)ts=([\d.]+)/.exec(await r.text())?.[1]
    const ms = ts ? Number(ts) * 1000 : NaN
    if (!Number.isFinite(ms)) throw new Error(`${endpoint}: no ts`)
    return ms
  }
}

/**
 * Ordered, CORS-enabled time sources. Each returns trusted epoch ms or throws.
 * Swap these if an endpoint becomes unavailable — but keep at least three, so
 * the median still outvotes one bad clock.
 */
const SOURCES: Array<() => Promise<number>> = [
  // Same origin: whatever host serves the app stamps every response with a
  // `Date` header, and same-origin responses expose it without any CORS opt-in.
  // No third-party dependency, so this keeps working when the time APIs don't.
  // Second-granular and uncorrected for round-trip latency, which is noise for
  // a device that measures elapsed time in minutes.
  async () => {
    if (typeof window === 'undefined') throw new Error('origin: no window')
    const url = new URL(window.location.pathname, window.location.origin)
    // Cache-bust: hosts often serve the page with a long max-age, and a cached
    // response carries a stale `Date`. (Nonce only — value is never read back.)
    url.searchParams.set('_ts', Math.random().toString(36).slice(2))
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: timeoutSignal() })
    if (!r.ok) throw new Error(`origin ${r.status}`)
    const ms = headerDate(r)
    if (!Number.isFinite(ms)) throw new Error('origin: no Date header')
    return ms
  },
  cdnCgiTrace('https://cloudflare.com/cdn-cgi/trace'),
  cdnCgiTrace('https://1.1.1.1/cdn-cgi/trace'),
]

function median(sorted: number[]): number {
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Sample every source, then anchor to the median. Each source is converted to
 * an offset against performance.now() at the moment *it* resolved, so a slow
 * source can't drag the anchor backwards by however long it took to answer.
 *
 * Returns false only if every source failed.
 */
export async function syncTrustedTime(): Promise<boolean> {
  const settled = await Promise.allSettled(
    SOURCES.map(async (source): Promise<Sample> => {
      const serverMs = await source()
      const perfMs = performance.now()
      if (!Number.isFinite(serverMs) || serverMs < MIN_PLAUSIBLE_MS) {
        throw new Error('implausible timestamp')
      }
      return { offsetMs: serverMs - perfMs }
    }),
  )

  const offsets = settled
    .filter((s): s is PromiseFulfilledResult<Sample> => s.status === 'fulfilled')
    .map((s) => s.value.offsetMs)
    .sort((a, b) => a - b)

  if (offsets.length === 0) return false
  anchorOffsetMs = median(offsets)
  return true
}

/** Trusted epoch ms, or null if time hasn't been verified yet. */
export function trustedNow(): number | null {
  if (anchorOffsetMs === null) return null
  return anchorOffsetMs + performance.now()
}
