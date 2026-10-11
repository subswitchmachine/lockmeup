import { useCallback, useEffect, useRef, useState } from 'react'
import {
  advanceProgress,
  decryptRecord,
  deleteLock,
  loadRecord,
  saveLock,
  type EncryptedRecord,
} from '../lib/lockStore'
import { clearAllTaskProgress } from '../lib/taskProgressStore'
import { syncTrustedTime, trustedNow } from '../lib/trustedTime'
import { useNow } from './useNow'
import type { CaptureFrame } from './useAutoCapture'
import type { LockOptions, TaskResult, TaskSpec } from '../lib/tasks'

const DEFAULT_OPTIONS: LockOptions = {
  hideMode: 'show',
  stepCountRandom: false,
  maxTotalMs: null,
  maxTotalRandom: false,
  pools: [],
}

/** Migrate persisted records that used the old boolean `hideRandom` field. */
export function migrateOptions(raw: unknown): LockOptions {
  if (!raw || typeof raw !== 'object') return DEFAULT_OPTIONS
  const r = raw as Record<string, unknown>
  const pools = Array.isArray(r.pools) ? (r.pools as string[]) : []
  if (r.hideMode != null) return { ...(raw as LockOptions), pools }
  return {
    hideMode: r.hideRandom === true ? 'hide-random' : 'show',
    stepCountRandom: (r.stepCountRandom as boolean) ?? false,
    maxTotalMs: (r.maxTotalMs as number | null) ?? null,
    maxTotalRandom: (r.maxTotalRandom as boolean) ?? false,
    pools,
  }
}

/** Progress through the task series that gates the reveal. */
export interface LockMeta {
  tasks: TaskSpec[]
  completedCount: number
  /** When the capture was locked away, on trusted time (ms epoch). Drives the
   *  max-total deadline. */
  lockedAt: number
  /** The same moment on the device clock; drives the "locked for" display so it
   *  pairs with a `Date.now()` tick. Absent on records from older versions. */
  wallLockedAt?: number
  /** Display options (hide timer / step count). */
  options: LockOptions
}

export interface UseLockboxResult {
  /** Task-series progress, or null if nothing is locked away. */
  meta: LockMeta | null
  /** Decrypted frames — non-null only once revealed. */
  frames: CaptureFrame[] | null
  /** When the capture was locked away, on the device clock (available once
   *  revealed). Pairs with `unlockedAt` — both are `Date.now()`, so the session
   *  log's elapsed time never straddles two clock bases. Falls back to the
   *  trusted `lockedAt` for records written before this field existed. */
  lockedAt: number | null
  /** True until the initial IndexedDB read completes. */
  loading: boolean
  /** Whether trusted network time is available (timed `wait` tasks need it). */
  timeVerified: boolean
  /** Trusted current time (falls back to OS clock only for countdown display). */
  now: number
  /** Device-clock now, ticking alongside `now`. Pairs with `meta.wallLockedAt`
   *  for elapsed-time *display*; never use it to gate an unlock. */
  wallNow: number
  /** True once the max-total time limit has elapsed but tasks aren't done — the
   *  user can choose to unlock via `reveal()` (we don't auto-reveal). */
  deadlineReached: boolean
  /** Per-task results accumulated during the session. */
  taskResults: TaskResult[]
  /** How the combo was ultimately unlocked. */
  unlockMethod: 'tasks' | 'maxtime'
  /** Epoch ms when the combo was revealed. */
  unlockedAt: number | null
  /** Lock a capture's frames away behind a series of tasks. */
  lockAway: (frames: CaptureFrame[], tasks: TaskSpec[], options: LockOptions) => Promise<void>
  /** Mark the current task complete and advance the series. */
  completeCurrentTask: (result: TaskResult) => Promise<void>
  /** Reveal the combo now (used by the deadline Unlock button). */
  reveal: (method?: 'maxtime') => void
  /** Discard the locked capture entirely. */
  clear: () => Promise<void>
}

/**
 * Owns the locked capture: loads the encrypted record, tracks how far through
 * the task series the user has progressed, and decrypts the frames only once
 * every task in the series is complete.
 */
export function useLockbox(): UseLockboxResult {
  const [meta, setMeta] = useState<LockMeta | null>(null)
  const [frames, setFrames] = useState<CaptureFrame[] | null>(null)
  const [lockedAt, setLockedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeVerified, setTimeVerified] = useState(false)
  const [taskResults, setTaskResults] = useState<TaskResult[]>([])
  const [unlockMethod, setUnlockMethod] = useState<'tasks' | 'maxtime'>('tasks')
  const [unlockedAt, setUnlockedAt] = useState<number | null>(null)

  const recordRef = useRef<EncryptedRecord | null>(null)
  const revealingRef = useRef(false)
  const metaRef = useRef<LockMeta | null>(null)
  useEffect(() => {
    metaRef.current = meta
  }, [meta])

  // Tick while a lock is present but not yet revealed, for `wait`-task countdowns.
  const ticking = meta !== null && frames === null
  const tick = useNow(ticking)
  const now = trustedNow() ?? tick

  // Initial load + trusted-time sync.
  useEffect(() => {
    let cancelled = false
    loadRecord()
      .then((rec) => {
        if (cancelled) return
        recordRef.current = rec
        setMeta(
          rec
            ? {
                tasks: rec.tasks,
                completedCount: rec.completedCount,
                lockedAt: rec.lockedAt,
                wallLockedAt: rec.wallLockedAt,
                options: migrateOptions(rec.options),
              }
            : null,
        )
      })
      .catch(() => {
        if (!cancelled) setMeta(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    syncTrustedTime().then((ok) => {
      if (!cancelled) setTimeVerified(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Decrypt and expose the frames. Shared by the task-complete path and the
  // deadline Unlock button.
  const reveal = useCallback((method?: 'maxtime') => {
    const rec = recordRef.current
    if (!rec || revealingRef.current) return
    revealingRef.current = true
    decryptRecord(rec)
      .then((lock) => {
        setFrames(lock.frames)
        // Both ends of the session log come off the device clock. Older records
        // have no `wallLockedAt`, so they keep the trusted timestamp.
        setLockedAt(lock.wallLockedAt ?? lock.lockedAt)
        setUnlockedAt(Date.now())
        if (method === 'maxtime') setUnlockMethod('maxtime')
      })
      .catch(() => {
        // Tampered ciphertext / missing key: drop the bad record.
        void deleteLock()
        recordRef.current = null
        setMeta(null)
      })
      .finally(() => {
        revealingRef.current = false
      })
  }, [])

  // Auto-reveal once the whole task series is complete (this is already driven by
  // the final task's own "Unlock" button, so it's user-initiated).
  useEffect(() => {
    if (meta !== null && frames === null && meta.completedCount >= meta.tasks.length) reveal()
  }, [meta, frames, reveal])

  // The max-total deadline does NOT auto-reveal; it just enables the header's
  // Unlock button. Derived from trusted time (re-evaluated every tick via `now`).
  const deadlineReached =
    meta !== null &&
    frames === null &&
    meta.completedCount < meta.tasks.length &&
    meta.options.maxTotalMs !== null &&
    (trustedNow() ?? Number.NEGATIVE_INFINITY) >= meta.lockedAt + meta.options.maxTotalMs

  const lockAway = useCallback(
    async (capturedFrames: CaptureFrame[], tasks: TaskSpec[], options: LockOptions) => {
      const wallBase = Date.now()
      const base = trustedNow() ?? wallBase
      const lock = {
        frames: capturedFrames,
        lockedAt: base,
        wallLockedAt: wallBase,
        tasks,
        completedCount: 0,
        options,
      }
      await saveLock(lock)
      // A fresh lock starts every task clean — drop any in-progress task state.
      void clearAllTaskProgress()
      // Re-read so we hold the persisted ciphertext for the eventual reveal.
      recordRef.current = await loadRecord()
      setFrames(null)
      setLockedAt(null)
      setMeta({ tasks, completedCount: 0, lockedAt: base, wallLockedAt: wallBase, options })
      setTaskResults([])
      setUnlockMethod('tasks')
      setUnlockedAt(null)
    },
    [],
  )

  const completeCurrentTask = useCallback(async (result: TaskResult) => {
    const prev = metaRef.current
    if (!prev || prev.completedCount >= prev.tasks.length) return
    const next = prev.completedCount + 1
    setMeta({ ...prev, completedCount: next })
    setTaskResults((r) => [...r, result])
    // Persist progress, then sync our cached ciphertext copy.
    const rec = await advanceProgress(next)
    if (rec) recordRef.current = rec
  }, [])

  const clear = useCallback(async () => {
    await deleteLock()
    void clearAllTaskProgress()
    recordRef.current = null
    setMeta(null)
    setFrames(null)
    setLockedAt(null)
    setTaskResults([])
    setUnlockMethod('tasks')
    setUnlockedAt(null)
  }, [])

  return {
    meta,
    frames,
    lockedAt,
    loading,
    timeVerified,
    now,
    wallNow: tick,
    deadlineReached,
    taskResults,
    unlockMethod,
    unlockedAt,
    lockAway,
    completeCurrentTask,
    reveal,
    clear,
  }
}
