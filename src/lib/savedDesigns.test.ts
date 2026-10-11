import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteDesign,
  formatDesignAge,
  loadSavedDesigns,
  saveDesign,
  type SavedDesign,
} from './savedDesigns'
import { newDraft, newFlowId, type FlowItem, type MaxTotalDraft } from './tasks'

const KEY = 'lockmeup:saved-designs'

// Minimal in-memory localStorage that satisfies the Storage interface bits the
// module uses (getItem, setItem, removeItem).
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

beforeEach(() => {
  // Install a fresh storage per test.
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const baseDesign = (name = 'Morning'): Omit<SavedDesign, 'id' | 'savedAt'> => ({
  name,
  items: [{ id: newFlowId(), type: 'task', task: newDraft('wait') } as FlowItem],
  hideMode: 'show',
  shuffle: false,
  pools: [],
  maxTotal: { random: false, minAmount: 1, maxAmount: 1, unit: 'hours' } as MaxTotalDraft,
})

describe('loadSavedDesigns', () => {
  it('returns an empty array when nothing has been saved', () => {
    expect(loadSavedDesigns()).toEqual([])
  })

  it('survives malformed JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(loadSavedDesigns()).toEqual([])
  })
})

describe('saveDesign', () => {
  it('prepends saved designs in newest-first order', () => {
    saveDesign(baseDesign('first'))
    saveDesign(baseDesign('second'))
    const saved = loadSavedDesigns()
    expect(saved).toHaveLength(2)
    expect(saved[0].name).toBe('second')
    expect(saved[1].name).toBe('first')
  })

  it('assigns an id and savedAt timestamp', () => {
    const before = Date.now()
    saveDesign(baseDesign())
    const [entry] = loadSavedDesigns()
    expect(entry.id).toBeTruthy()
    expect(entry.savedAt).toBeGreaterThanOrEqual(before)
    expect(entry.savedAt).toBeLessThanOrEqual(Date.now())
  })
})

describe('deleteDesign', () => {
  it('removes the entry with the given id and leaves the others', () => {
    saveDesign(baseDesign('a'))
    saveDesign(baseDesign('b'))
    const [first] = loadSavedDesigns()
    deleteDesign(first.id)
    const remaining = loadSavedDesigns()
    expect(remaining.map((d) => d.name)).toEqual(['a'])
  })

  it('is a no-op for an unknown id', () => {
    saveDesign(baseDesign('a'))
    deleteDesign('does-not-exist')
    expect(loadSavedDesigns()).toHaveLength(1)
  })
})

describe('formatDesignAge', () => {
  const NOW = 1_700_000_000_000
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  it('uses "just now" for ages under a minute', () => {
    expect(formatDesignAge(NOW - 30_000)).toBe('just now')
  })

  it('rounds down to the minute', () => {
    expect(formatDesignAge(NOW - 5 * 60_000)).toBe('5m ago')
  })

  it('uses hours for ages between 1h and 24h', () => {
    expect(formatDesignAge(NOW - 3 * 3_600_000)).toBe('3h ago')
  })

  it('uses days for ages between 1d and 30d', () => {
    expect(formatDesignAge(NOW - 5 * 86_400_000)).toBe('5d ago')
  })

  it('falls back to a locale date string past 30 days', () => {
    const out = formatDesignAge(NOW - 60 * 86_400_000)
    expect(out).not.toMatch(/ago$/)
    expect(out.length).toBeGreaterThan(0)
  })
})
