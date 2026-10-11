import type { FlowItem, HideMode, MaxTotalDraft } from './tasks'

export interface SavedDesign {
  id: string
  name: string
  savedAt: number
  items: FlowItem[]
  hideMode: HideMode
  shuffle: boolean
  pools: string[]
  maxTotal: MaxTotalDraft
}

const KEY = 'lockmeup:saved-designs'

export function loadSavedDesigns(): SavedDesign[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedDesign[]) : []
  } catch {
    return []
  }
}

export function saveDesign(design: Omit<SavedDesign, 'id' | 'savedAt'>): void {
  const existing = loadSavedDesigns()
  const entry: SavedDesign = { ...design, id: crypto.randomUUID(), savedAt: Date.now() }
  localStorage.setItem(KEY, JSON.stringify([entry, ...existing]))
}

export function deleteDesign(id: string): void {
  const updated = loadSavedDesigns().filter((d) => d.id !== id)
  localStorage.setItem(KEY, JSON.stringify(updated))
}

export function formatDesignAge(savedAt: number): string {
  const diff = Date.now() - savedAt
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(savedAt).toLocaleDateString()
}
