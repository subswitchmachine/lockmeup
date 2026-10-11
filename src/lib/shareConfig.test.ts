import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  clearShareFromLocation,
  decodeConfig,
  decodeLog,
  encodeConfig,
  encodeLog,
  readShareFromLocation,
  type SharedConfig,
  type TaskLog,
} from './shareConfig'
import { draftToSpec, newDraft, newFlowId, type FlowItem } from './tasks'

const sampleConfig = (): SharedConfig => ({
  v: 1,
  name: 'Evening routine',
  hideConfig: false,
  items: [
    { id: newFlowId(), type: 'task', task: newDraft('wait') } as FlowItem,
    { id: newFlowId(), type: 'task', task: newDraft('jigsaw') } as FlowItem,
  ],
  hideMode: 'show',
  shuffle: true,
  pools: ['femdom'],
})

describe('shareConfig round-trip', () => {
  it('decodes back to the original config', () => {
    const config = sampleConfig()
    const decoded = decodeConfig(encodeConfig(config))
    expect(decoded).toEqual(config)
  })

  it('preserves unicode in names', () => {
    const config = { ...sampleConfig(), name: 'Café — 日本語 ✨' }
    expect(decodeConfig(encodeConfig(config))?.name).toBe('Café — 日本語 ✨')
  })

  it('returns null for malformed input', () => {
    expect(decodeConfig('@@@ not valid base64 @@@')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(decodeConfig('')).toBeNull()
  })

  it('returns null for valid base64 that does not match the schema', () => {
    expect(decodeConfig(encodeConfig({ wrong: 'shape' } as unknown as SharedConfig))).toBeNull()
  })
})

const sampleLog = (): TaskLog => ({
  v: 1,
  lockedAt: 1_700_000_000_000,
  unlockedAt: 1_700_000_300_000,
  unlockMethod: 'tasks',
  tasks: [draftToSpec(newDraft('wait')), draftToSpec(newDraft('hold'))],
  results: [
    { kind: 'wait', durationMs: 60_000, errors: 0 },
    { kind: 'hold', durationMs: 30_000, errors: 2 },
  ],
})

describe('shareLog round-trip', () => {
  it('decodes back to the original log', () => {
    const log = sampleLog()
    expect(decodeLog(encodeLog(log))).toEqual(log)
  })

  it('returns null for malformed input', () => {
    expect(decodeLog('@@@')).toBeNull()
  })

  it('returns null when the schema does not match', () => {
    // Config payload has no `results` field, so it should be rejected here.
    expect(decodeLog(encodeConfig({ v: 1, name: 'x', hideConfig: false, items: [], hideMode: 'show', shuffle: false }))).toBeNull()
  })
})

// JSDOM is not configured for this suite, so we stub a minimal window shim.
type WindowShim = {
  location: { origin: string; pathname: string; search: string; hash: string }
  history: { replaceState: (state: unknown, _t: string, url: string) => void }
}

function installWindow(hash = '', pathname = '/app', search = ''): WindowShim {
  const shim: WindowShim = {
    location: { origin: 'https://example.test', pathname, search, hash },
    history: {
      replaceState(_s, _t, url) {
        // Normalise URL parsing for the bits we exercise.
        const u = new URL(url, 'https://example.test')
        shim.location.pathname = u.pathname
        shim.location.search = u.search
        shim.location.hash = u.hash
      },
    },
  }
  ;(globalThis as unknown as { window: WindowShim }).window = shim
  return shim
}

function uninstallWindow() {
  delete (globalThis as unknown as { window?: unknown }).window
}

describe('buildShareUrl', () => {
  beforeEach(() => installWindow('', '/app/'))
  afterEach(() => uninstallWindow())

  it('uses the current origin + pathname and percent-encodes the code', () => {
    const url = buildShareUrl('config', 'abc+def/=')
    expect(url).toBe('https://example.test/app/#config=abc%2Bdef%2F%3D')
  })

  it('falls back to the lockmeup.net base when window is undefined', () => {
    uninstallWindow()
    expect(buildShareUrl('log', 'x')).toBe('https://lockmeup.net/#log=x')
  })
})

describe('readShareFromLocation', () => {
  afterEach(() => uninstallWindow())

  it('returns null when there is no window', () => {
    uninstallWindow()
    expect(readShareFromLocation()).toBeNull()
  })

  it('returns null when the fragment is empty', () => {
    installWindow('')
    expect(readShareFromLocation()).toBeNull()
  })

  it('parses a config code', () => {
    installWindow('#config=hello')
    expect(readShareFromLocation()).toEqual({ kind: 'config', code: 'hello' })
  })

  it('parses a log code', () => {
    installWindow('#log=abc')
    expect(readShareFromLocation()).toEqual({ kind: 'log', code: 'abc' })
  })

  it('returns null for unrelated fragments', () => {
    installWindow('#section=intro')
    expect(readShareFromLocation()).toBeNull()
  })
})

describe('clearShareFromLocation', () => {
  afterEach(() => uninstallWindow())

  it('no-ops when there is no window', () => {
    uninstallWindow()
    expect(() => clearShareFromLocation()).not.toThrow()
  })

  it('strips the fragment while preserving path and search', () => {
    const w = installWindow('#config=hello', '/app/', '?foo=1')
    clearShareFromLocation()
    expect(w.location.hash).toBe('')
    expect(w.location.pathname).toBe('/app/')
    expect(w.location.search).toBe('?foo=1')
  })
})
