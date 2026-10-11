// @vitest-environment happy-dom
// (the same-origin source reads window.location)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Response-like object good enough for trustedTime's `ok`/`headers`/`text()` usage. */
function fakeResponse(
  { date, body }: { date?: string; body?: string },
  ok = true,
  status = 200,
): Response {
  return {
    ok,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'date' && date ? date : null) },
    text: async () => body ?? '',
  } as unknown as Response
}

/** A `/cdn-cgi/trace` body reporting `ms` as its `ts=` line. */
function trace(ms: number): Response {
  return fakeResponse({ body: `fl=123abc\nh=cloudflare.com\nts=${ms / 1000}\nvisit_scheme=https\n` })
}

/** The same-origin source reads the `Date` header, which is second-granular. */
function originDate(ms: number): Response {
  return fakeResponse({ date: new Date(ms).toUTCString() })
}

// Each test starts with a fresh module so the anchor singleton resets.
async function freshModule() {
  vi.resetModules()
  return await import('./trustedTime')
}

/** Route a stubbed fetch by URL. Source 1 is passed a URL object, 2 & 3 strings. */
function stubFetch(handler: (url: string) => Promise<Response>) {
  const fetch = vi.fn(async (url: URL | string) => handler(String(url)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const TRUE_MS = Date.UTC(2026, 7, 1, 23, 51, 0)

beforeEach(() => {
  // Deterministic monotonic clock baseline.
  vi.spyOn(performance, 'now').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trustedNow', () => {
  it('returns null before any sync has succeeded', async () => {
    const m = await freshModule()
    expect(m.trustedNow()).toBeNull()
  })

  it('returns the anchored server time plus monotonic delta after a sync', async () => {
    const m = await freshModule()
    stubFetch(async (url) => (url.includes('cdn-cgi') ? trace(TRUE_MS) : originDate(TRUE_MS)))

    expect(await m.syncTrustedTime()).toBe(true)

    // Anchored: perf 0 maps to TRUE_MS. Advance perf by 5s → trustedNow += 5000.
    vi.spyOn(performance, 'now').mockReturnValue(5000)
    expect(m.trustedNow()).toBe(TRUE_MS + 5000)
  })
})

describe('syncTrustedTime', () => {
  it('queries every source in parallel rather than stopping at the first', async () => {
    const m = await freshModule()
    const fetch = stubFetch(async (url) =>
      url.includes('cdn-cgi') ? trace(TRUE_MS) : originDate(TRUE_MS),
    )

    expect(await m.syncTrustedTime()).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  // Regression: timeapi.io served times ~18 minutes in the past, which the old
  // first-success-wins list accepted outright — backdating every lock, so a
  // session finished immediately reported ~18 minutes of elapsed time.
  it('ignores a single source with a badly-skewed clock', async () => {
    const m = await freshModule()
    const SKEW = 18 * 60_000
    stubFetch(async (url) => {
      // The two Cloudflare endpoints agree; the origin host is 18 minutes slow.
      if (url.includes('cdn-cgi')) return trace(TRUE_MS)
      return originDate(TRUE_MS - SKEW)
    })

    expect(await m.syncTrustedTime()).toBe(true)
    expect(m.trustedNow()).toBe(TRUE_MS)
  })

  it('still anchors when only one source answers', async () => {
    const m = await freshModule()
    stubFetch(async (url) => {
      if (url.includes('1.1.1.1')) return trace(TRUE_MS)
      throw new Error('unreachable')
    })

    expect(await m.syncTrustedTime()).toBe(true)
    expect(m.trustedNow()).toBe(TRUE_MS)
  })

  it('anchors a slow source to when it answered, not when the sync began', async () => {
    const m = await freshModule()
    // One source, answering 3s in. It reports the instant it was *served*, so
    // that instant must be pinned to the perf reading taken on resolution —
    // pinning it to the sync's start would leave trusted time running 3s fast.
    stubFetch(async (url) => {
      if (!url.includes('1.1.1.1')) throw new Error('unreachable')
      return trace(TRUE_MS)
    })
    vi.spyOn(performance, 'now').mockReturnValue(3000)

    expect(await m.syncTrustedTime()).toBe(true)
    expect(m.trustedNow()).toBe(TRUE_MS)

    vi.spyOn(performance, 'now').mockReturnValue(4000)
    expect(m.trustedNow()).toBe(TRUE_MS + 1000)
  })

  it('rejects implausible timestamps', async () => {
    const m = await freshModule()
    stubFetch(async (url) => (url.includes('cdn-cgi') ? trace(0) : originDate(0)))

    expect(await m.syncTrustedTime()).toBe(false)
    expect(m.trustedNow()).toBeNull()
  })

  it('returns false when every source fails', async () => {
    const m = await freshModule()
    stubFetch(async () => {
      throw new Error('offline')
    })
    expect(await m.syncTrustedTime()).toBe(false)
    expect(m.trustedNow()).toBeNull()
  })

  it('returns false when payloads are malformed across all sources', async () => {
    const m = await freshModule()
    stubFetch(async () => fakeResponse({ body: 'fl=123abc\nh=example.com\n' }))
    expect(await m.syncTrustedTime()).toBe(false)
  })

  it('treats a non-ok response as a failed source', async () => {
    const m = await freshModule()
    stubFetch(async (url) => {
      if (url.includes('cdn-cgi')) return fakeResponse({}, false, 503)
      return originDate(TRUE_MS)
    })

    expect(await m.syncTrustedTime()).toBe(true)
    expect(m.trustedNow()).toBe(TRUE_MS)
  })
})
