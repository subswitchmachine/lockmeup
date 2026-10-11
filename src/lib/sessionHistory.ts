import type { TaskLog } from './shareConfig'

/**
 * A lightweight, persistent log of past sessions kept in localStorage.
 *
 * Unlike the locked capture (encrypted frames in IndexedDB), a session-history
 * entry is just the `TaskLog` metadata — when it was locked/unlocked, how it was
 * unlocked, and the per-task results. It deliberately holds **no frames**, so
 * the user's combination photo is never persisted in cleartext here. That keeps
 * each entry tiny, so localStorage is a comfortable fit.
 */

const KEY = 'lockmeup-session-history'
/** Cap the stored history so it can't grow without bound. Newest are kept. */
const MAX_ENTRIES = 100

/** Stable identity for a log so we never store the same reveal twice. */
function logId(log: TaskLog): string {
  return `${log.lockedAt}-${log.unlockedAt}`
}

/** Read the saved history, newest first. Tolerates absent/corrupt storage. */
export function loadHistory(): TaskLog[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Defensive: only keep entries that still look like a TaskLog.
    return parsed.filter(
      (e): e is TaskLog =>
        e && typeof e === 'object' && Array.isArray(e.results) && typeof e.unlockMethod === 'string',
    )
  } catch {
    return []
  }
}

/**
 * Append a completed session to the history (newest first), de-duplicating by
 * lock/unlock time so a re-render or refresh on the revealed screen can't add
 * the same entry twice. Returns the updated list.
 */
export function appendHistory(log: TaskLog): TaskLog[] {
  const id = logId(log)
  const existing = loadHistory().filter((e) => logId(e) !== id)
  const next = [log, ...existing].slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Storage full or unavailable — history is best-effort, so swallow.
  }
  return next
}

/** Remove a single entry by its lock/unlock identity. Returns the updated list. */
export function removeHistory(log: TaskLog): TaskLog[] {
  const id = logId(log)
  const next = loadHistory().filter((e) => logId(e) !== id)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // best-effort
  }
  return next
}

/** Wipe the entire session history. */
export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // best-effort
  }
}
