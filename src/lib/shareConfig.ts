import type { FlowItem, HideMode, TaskResult, TaskSpec } from './tasks'

export interface SharedConfig {
  v: 1
  name: string
  /** When true, the loader cannot see the task list. */
  hideConfig: boolean
  items: FlowItem[]
  hideMode: HideMode
  shuffle: boolean
  /** Image pools tasks draw from. Optional for backward compat (older shares). */
  pools?: string[]
}

export interface TaskLog {
  v: 1
  lockedAt: number
  unlockedAt: number
  unlockMethod: 'tasks' | 'maxtime'
  tasks: TaskSpec[]
  results: TaskResult[]
}

function rot13(s: string): string {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function encodeAny(value: unknown): string {
  const json = JSON.stringify(value)
  const bytes = new TextEncoder().encode(json)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return rot13(btoa(binary))
}

function decodeAny(encoded: string): unknown {
  const binary = atob(rot13(encoded.trim()))
  const bytes = Uint8Array.from([...binary].map((c) => c.charCodeAt(0)))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function encodeConfig(config: SharedConfig): string {
  return encodeAny(config)
}

export function decodeConfig(encoded: string): SharedConfig | null {
  try {
    const parsed = decodeAny(encoded) as Record<string, unknown>
    if (parsed?.v === 1 && typeof parsed.name === 'string' && Array.isArray(parsed.items)) {
      return parsed as unknown as SharedConfig
    }
    return null
  } catch {
    return null
  }
}

export function encodeLog(log: TaskLog): string {
  return encodeAny(log)
}

export function decodeLog(encoded: string): TaskLog | null {
  try {
    const parsed = decodeAny(encoded) as Record<string, unknown>
    if (parsed?.v === 1 && Array.isArray(parsed.results) && parsed.unlockMethod) {
      return parsed as unknown as TaskLog
    }
    return null
  } catch {
    return null
  }
}

/* ── Link sharing ───────────────────────────────────────────────────────────
 * Codes round-trip through the URL fragment so the payload never reaches a
 * server (privacy-preserving for `hideConfig` assignments and reveal logs).
 * The fragment uses `kind=code` form so additional kinds can be added without
 * breaking existing links.
 */
export type ShareKind = 'config' | 'log'

/** Build a shareable URL for the current origin embedding the given code. */
export function buildShareUrl(kind: ShareKind, code: string): string {
  const base =
    typeof window === 'undefined'
      ? 'https://lockmeup.net/'
      : window.location.origin + window.location.pathname
  // Codes are base64-rot13 — `+ / =` are valid URL fragment chars but get
  // mangled by some chat clients (notably `+`→space on paste). Percent-encode
  // for safety; modern browsers decode `#` content transparently.
  return `${base}#${kind}=${encodeURIComponent(code)}`
}

/** Read a share code from the current URL fragment, if any. */
export function readShareFromLocation(): { kind: ShareKind; code: string } | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  for (const kind of ['config', 'log'] as const) {
    const code = params.get(kind)
    if (code) return { kind, code }
  }
  return null
}

/**
 * Remove the share fragment after it's been consumed so a refresh doesn't
 * re-trigger the link handler (and a screenshot doesn't leak the code).
 */
export function clearShareFromLocation(): void {
  if (typeof window === 'undefined') return
  const { pathname, search } = window.location
  window.history.replaceState(null, '', pathname + search)
}
