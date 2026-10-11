import { pickDistinctImages, pickRandomImage } from './puzzleImages'
import { pick, randInt, shuffle } from './random'
import { UNIT_MS, UNIT_SHORT, type DurationUnit } from './time'

/**
 * The unlock condition for a lockbox is an ordered series of tasks. The clear
 * frames are revealed only once every task in the series is complete.
 *
 * Users design the series in the FlowBuilder as a *flow* of items — single
 * tasks, pools (pick one at random), and loop groups. At lock time the flow is
 * flattened by `expandFlow` into the runtime's flat `TaskSpec[]`, so the runtime
 * (useLockbox / TaskRunner) never needs to know about pools/loops.
 */

/** Per-task execution stats collected at runtime and shown in the session log. */
export interface TaskResult {
  kind: TaskSpec['kind']
  durationMs: number
  errors: number
}

/** What happens on the failure event of an attention-based task. */
export type Punishment =
  | { mode: 'reset' }
  | {
      mode: 'penalty'
      random: boolean
      minAmount: number
      maxAmount: number
      unit: DurationUnit
    }

export type SequenceFlashSpeed = 'slow' | 'normal' | 'fast'
export type SequencePunishment = { mode: 'reset' } | { mode: 'penalty'; steps: number }

export type SteadyDifficulty = 'easy' | 'normal' | 'hard'
export type SteadyPunishment = { mode: 'reset' } | { mode: 'penalty'; percent: number }

export type HoldSpeed = 'slow' | 'medium' | 'fast'
export type HoldSize = 'small' | 'medium' | 'large'
export type FocusSensitivity = 'strict' | 'normal' | 'relaxed'
export type SlideInterval = 'fast' | 'medium' | 'slow'
export type TapWindow = 'quick' | 'normal' | 'slow'

/** Optional image slideshow on a timed task. */
export interface SlideshowDraft {
  enabled: boolean
  interval: SlideInterval
}
export type MismatchSpeed = 'quick' | 'normal' | 'slow' | 'verySlow'

/** Preset → runtime value tables (kept here so the runtime and editor agree). */
export const MISMATCH_MS: Record<MismatchSpeed, number> = {
  quick: 500,
  normal: 800,
  slow: 1500,
  verySlow: 3000,
}
export const HOLD_SPEED_PX_PER_MS: Record<HoldSpeed, number> = {
  slow: 0.05,
  medium: 0.10,
  fast: 0.20,
}
export const HOLD_SIZE_FRACTION: Record<HoldSize, number> = {
  small: 0.07,
  medium: 0.13,
  large: 0.22,
}
export const FOCUS_MOTION_LIMIT: Record<FocusSensitivity, number> = {
  strict: 3,
  normal: 6,
  relaxed: 10,
}
export const SEQUENCE_FLASH_MS: Record<SequenceFlashSpeed, number> = {
  slow: 1000,
  normal: 600,
  fast: 350,
}

export const SLIDE_INTERVAL_MS: Record<SlideInterval, number> = {
  fast: 10_000,
  medium: 30_000,
  slow: 60_000,
}
export const TAP_WINDOW_MS: Record<TapWindow, number> = {
  quick: 800,
  normal: 1_800,
  slow: 3_500,
}

export type TaskSpec =
  // `rotate` is optional so locks created before the rotatable renderer (which
  // stored `{ kind:'jigsaw', imageId, pieces }`) still satisfy the type; absent
  // means "no rotation".
  | { kind: 'jigsaw'; imageId: string; pieces: number; rotate?: boolean }
  | { kind: 'sliding'; imageId: string; size: number; assist?: boolean }
  | { kind: 'memory'; imageIds: string[]; mismatchMs: number; guessDelayMs?: number }
  | { kind: 'typing'; line: string; reps: number; random: boolean; minPenaltyReps: number; maxPenaltyReps: number; slideMs: number | null }
  | {
      kind: 'sequence'
      imageIds: string[]
      startLength: number
      targetLength: number
      flashMs: number
      punishment: SequencePunishment
    }
  | { kind: 'wait'; durationMs: number; random: boolean; slideMs: number | null }
  | {
      kind: 'hold'
      durationMs: number
      random: boolean
      punishment: Punishment
      speed: HoldSpeed
      size: HoldSize
      slideMs: number | null
    }
  | {
      kind: 'focus'
      durationMs: number
      random: boolean
      punishment: Punishment
      sensitivity: FocusSensitivity
      requireFace: boolean
      requireTabFocus: boolean
      showCamera: boolean
      slideMs: number | null
    }
  | {
      kind: 'tap'
      durationMs: number
      random: boolean
      punishment: Punishment
      intervalMs: number
      windowMs: number
      slideMs: number | null
    }
  | {
      kind: 'steady'
      difficulty: SteadyDifficulty
      random: boolean
      punishment: SteadyPunishment
      slideMs: number | null
    }

/** Task kinds whose duration is shown to the user (hideable via hide-random). */
export type TimedKind = 'wait' | 'hold' | 'focus' | 'tap'

/**
 * Selectable jigsaw piece counts (ascending), surfaced in the flow builder. The
 * DOM renderer (`JigsawTask`) is built for large boards, hence the high counts.
 */
export const PIECE_OPTIONS = [12, 30, 50, 100, 150, 300, 500, 1000, 2000, 3000] as const

/**
 * Derive a piece grid for a target count that keeps pieces roughly square and
 * the assembled puzzle close to the image's aspect ratio (width / height).
 * With square pieces, puzzle aspect equals cols / rows, so we solve
 * cols / rows ≈ aspect under cols * rows ≈ pieces.
 */
export function gridForAspect(pieces: number, aspect: number): { cols: number; rows: number } {
  const cols = Math.max(2, Math.round(Math.sqrt(pieces * aspect)))
  const rows = Math.max(2, Math.round(pieces / cols))
  return { cols, rows }
}

/* ---- Flow builder model ---------------------------------------------------
 * A flow is an ordered list of items. Each item is a single task, a pool (one
 * random candidate is drawn each run), or a loop (children repeated N times).
 */

/**
 * Drafts can be fixed or random. When `random` is off the bounds are kept equal
 * (a single value); when on they form a range a value is drawn from at lock
 * time. A value is actually random only when its bounds differ.
 */
export type TaskDraft =
  | { kind: 'jigsaw'; random: boolean; minPieces: number; maxPieces: number; rotate: boolean }
  | { kind: 'sliding'; random: boolean; minSize: number; maxSize: number; assist: boolean }
  | {
      kind: 'memory'
      random: boolean
      minPairs: number
      maxPairs: number
      mismatchSpeed: MismatchSpeed
      guessDelay: boolean
      guessDelayAmount: number
      guessDelayUnit: DurationUnit
    }
  | {
      kind: 'typing'
      random: boolean
      minReps: number
      maxReps: number
      line: string
      penaltyRandom: boolean
      minPenaltyReps: number
      maxPenaltyReps: number
      slideshow: SlideshowDraft
    }
  | {
      kind: 'wait'
      random: boolean
      minAmount: number
      maxAmount: number
      unit: DurationUnit
      slideshow: SlideshowDraft
    }
  | {
      kind: 'hold'
      random: boolean
      minAmount: number
      maxAmount: number
      unit: DurationUnit
      punishment: Punishment
      speed: HoldSpeed
      size: HoldSize
      slideshow: SlideshowDraft
    }
  | {
      kind: 'focus'
      random: boolean
      minAmount: number
      maxAmount: number
      unit: DurationUnit
      punishment: Punishment
      sensitivity: FocusSensitivity
      requireFace: boolean
      requireTabFocus: boolean
      showCamera: boolean
      slideshow: SlideshowDraft
    }
  | {
      kind: 'tap'
      random: boolean
      minAmount: number
      maxAmount: number
      unit: DurationUnit
      punishment: Punishment
      intervalRandom: boolean
      intervalAmount: number
      intervalMaxAmount: number
      intervalUnit: DurationUnit
      window: TapWindow
      slideshow: SlideshowDraft
    }
  | {
      kind: 'sequence'
      imageCount: number
      startRandom: boolean
      minStartLength: number
      maxStartLength: number
      targetRandom: boolean
      minTargetLength: number
      maxTargetLength: number
      flashSpeed: SequenceFlashSpeed
      punishment: SequencePunishment
    }
  | {
      kind: 'steady'
      random: boolean
      difficulty: SteadyDifficulty
      punishment: SteadyPunishment
      slideshow: SlideshowDraft
    }

/** Fresh default draft for a task kind (used by the editor on "add"). */
export function newDraft(kind: TaskDraft['kind']): TaskDraft {
  switch (kind) {
    case 'jigsaw':
      return { kind, random: false, minPieces: 30, maxPieces: 30, rotate: false }
    case 'sliding':
      return { kind, random: false, minSize: 3, maxSize: 3, assist: true }
    case 'memory':
      return {
        kind,
        random: false,
        minPairs: 4,
        maxPairs: 4,
        mismatchSpeed: 'normal',
        guessDelay: false,
        guessDelayAmount: 2,
        guessDelayUnit: 'seconds',
      }
    case 'typing':
      return {
        kind,
        random: false,
        minReps: 5,
        maxReps: 5,
        line: '',
        penaltyRandom: false,
        minPenaltyReps: 1,
        maxPenaltyReps: 1,
        slideshow: { enabled: false, interval: 'medium' },
      }
    case 'wait':
      return {
        kind,
        random: false,
        minAmount: 5,
        maxAmount: 5,
        unit: 'minutes',
        slideshow: { enabled: false, interval: 'medium' },
      }
    case 'hold':
      return {
        kind,
        random: false,
        minAmount: 30,
        maxAmount: 30,
        unit: 'seconds',
        punishment: { mode: 'reset' },
        speed: 'medium',
        size: 'medium',
        slideshow: { enabled: false, interval: 'medium' },
      }
    case 'focus':
      return {
        kind,
        random: false,
        minAmount: 1,
        maxAmount: 1,
        unit: 'minutes',
        punishment: { mode: 'reset' },
        sensitivity: 'strict',
        requireFace: true,
        requireTabFocus: true,
        showCamera: false,
        slideshow: { enabled: true, interval: 'medium' },
      }
    case 'tap':
      return {
        kind,
        random: false,
        minAmount: 30,
        maxAmount: 30,
        unit: 'seconds',
        punishment: { mode: 'reset' },
        intervalRandom: false,
        intervalAmount: 7,
        intervalMaxAmount: 7,
        intervalUnit: 'seconds',
        window: 'normal',
        slideshow: { enabled: false, interval: 'medium' },
      }
    case 'sequence':
      return {
        kind,
        imageCount: 4,
        startRandom: false,
        minStartLength: 3,
        maxStartLength: 3,
        targetRandom: false,
        minTargetLength: 8,
        maxTargetLength: 8,
        flashSpeed: 'normal',
        punishment: { mode: 'reset' },
      }
    case 'steady':
      return {
        kind,
        random: false,
        difficulty: 'normal',
        punishment: { mode: 'reset' },
        slideshow: { enabled: false, interval: 'medium' },
      }
  }
}

export interface FlowTask {
  id: string
  task: TaskDraft
}

/** A flow position: one task, or a pool from which one is picked at random. */
export type FlowChild =
  | { id: string; type: 'task'; task: TaskDraft }
  | { id: string; type: 'pool'; tasks: FlowTask[] }

export type FlowItem =
  | FlowChild
  | {
      id: string
      type: 'loop'
      random: boolean
      minRepeat: number
      maxRepeat: number
      children: FlowChild[]
    }

let flowIdCounter = 0
/** Stable React keys for flow items (flow isn't persisted, so a counter is fine). */
export function newFlowId(): string {
  return `f${++flowIdCounter}`
}

/**
 * Flow-builder draft for the optional max-total-time override. Lifted out so the
 * App can own this state across phase transitions (capture → back → flow).
 */
export interface MaxTotalDraft {
  enabled: boolean
  random: boolean
  minAmount: number
  maxAmount: number
  unit: DurationUnit
}

/** Controls how much of the task parameters are revealed to the user at runtime. */
export type HideMode =
  | 'show'         // show everything
  | 'hide-random'  // hide only values that were drawn from a range
  | 'hide-all'     // hide all timers and step counts regardless

/** Lock-level display options chosen in the flow builder. */
export interface LockOptions {
  hideMode: HideMode
  /** Whether the total step count is random (a ranged loop); set at lock time. */
  stepCountRandom: boolean
  /**
   * Hard time limit (ms from lock). Once it elapses the combo is revealed even
   * if the tasks aren't finished — it overrides task completion. null = no limit.
   */
  maxTotalMs: number | null
  /** Whether `maxTotalMs` was drawn from a range (vs fixed); set at lock time. */
  maxTotalRandom: boolean
  /** Image pools (subdirectories of `src/img`) tasks draw from. Empty = all. */
  pools: string[]
}

/**
 * Resolve a duration range to a concrete millisecond value, uniformly within
 * the range — *continuous* in ms (so `1–2 minutes` can resolve to e.g. 1m 12s,
 * not just exactly 1 or 2 minutes).
 */
export function resolveDuration(minAmount: number, maxAmount: number, unit: DurationUnit): number {
  const lo = Math.min(minAmount, maxAmount) * UNIT_MS[unit]
  const hi = Math.max(minAmount, maxAmount) * UNIT_MS[unit]
  return Math.round(lo + Math.random() * (hi - lo))
}

/**
 * Apply a contact-loss punishment to a charge accumulator (in ms), returning the
 * new value: 'reset' wipes it to zero, 'penalty' subtracts a (possibly random)
 * duration, clamped at zero. Shared by the timed tasks (hold, tap, focus).
 */
export function applyPunishment(accMs: number, p: Punishment): number {
  if (p.mode === 'reset') return 0
  return Math.max(0, accMs - resolveDuration(p.minAmount, p.maxAmount, p.unit))
}

/** Compact label for a penalty (e.g. "5s" or "1–3 min"). */
export function penaltyLabel(p: Extract<Punishment, { mode: 'penalty' }>): string {
  const u = UNIT_SHORT[p.unit]
  return p.minAmount === p.maxAmount ? `${p.minAmount}${u}` : `${p.minAmount}–${p.maxAmount} ${u}`
}

/** True when the flow can expand to a non-fixed number of steps (a ranged loop). */
export function hasRandomStepCount(items: FlowItem[]): boolean {
  return items.some(
    (item) =>
      item.type === 'loop' && item.minRepeat !== item.maxRepeat && item.children.length > 0,
  )
}

/**
 * Range of concrete tasks the flow can expand to (a loop with a repeat range
 * makes this a span). A task and a pool each contribute exactly one. Drives the
 * summary and the lock gate.
 */
export function flowTaskRange(items: FlowItem[]): { min: number; max: number } {
  let min = 0
  let max = 0
  for (const item of items) {
    if (item.type === 'loop') {
      min += Math.min(item.minRepeat, item.maxRepeat) * item.children.length
      max += Math.max(item.minRepeat, item.maxRepeat) * item.children.length
    } else {
      min += 1
      max += 1
    }
  }
  return { min, max }
}

export function draftToSpec(draft: TaskDraft, pools?: string[]): TaskSpec {
  switch (draft.kind) {
    case 'jigsaw': {
      const choices = PIECE_OPTIONS.filter((p) => p >= draft.minPieces && p <= draft.maxPieces)
      const pieces = choices.length ? pick(choices) : draft.minPieces
      return { kind: 'jigsaw', imageId: pickRandomImage(pools).id, pieces, rotate: draft.rotate }
    }
    case 'sliding':
      return {
        kind: 'sliding',
        imageId: pickRandomImage(pools).id,
        size: randInt(draft.minSize, draft.maxSize),
        assist: draft.assist,
      }
    case 'memory':
      return {
        kind: 'memory',
        imageIds: pickDistinctImages(randInt(draft.minPairs, draft.maxPairs), pools),
        mismatchMs: MISMATCH_MS[draft.mismatchSpeed],
        guessDelayMs: draft.guessDelay ? draft.guessDelayAmount * UNIT_MS[draft.guessDelayUnit] : 0,
      }
    case 'typing':
      return {
        kind: 'typing',
        line: draft.line,
        reps: randInt(draft.minReps, draft.maxReps),
        random: draft.minReps !== draft.maxReps,
        minPenaltyReps: draft.minPenaltyReps,
        maxPenaltyReps: draft.maxPenaltyReps,
        slideMs: draft.slideshow.enabled ? SLIDE_INTERVAL_MS[draft.slideshow.interval] : null,
      }
    case 'wait':
      return {
        kind: 'wait',
        durationMs: resolveDuration(draft.minAmount, draft.maxAmount, draft.unit),
        random: draft.minAmount !== draft.maxAmount,
        slideMs: draft.slideshow.enabled ? SLIDE_INTERVAL_MS[draft.slideshow.interval] : null,
      }
    case 'hold':
      return {
        kind: 'hold',
        durationMs: resolveDuration(draft.minAmount, draft.maxAmount, draft.unit),
        random: draft.minAmount !== draft.maxAmount,
        punishment: draft.punishment,
        speed: draft.speed,
        size: draft.size,
        slideMs: draft.slideshow.enabled ? SLIDE_INTERVAL_MS[draft.slideshow.interval] : null,
      }
    case 'focus':
      return {
        kind: 'focus',
        durationMs: resolveDuration(draft.minAmount, draft.maxAmount, draft.unit),
        random: draft.minAmount !== draft.maxAmount,
        punishment: draft.punishment,
        sensitivity: draft.sensitivity,
        requireFace: draft.requireFace,
        requireTabFocus: draft.requireTabFocus,
        showCamera: draft.showCamera,
        slideMs: draft.slideshow.enabled ? SLIDE_INTERVAL_MS[draft.slideshow.interval] : null,
      }
    case 'tap':
      return {
        kind: 'tap',
        durationMs: resolveDuration(draft.minAmount, draft.maxAmount, draft.unit),
        random: draft.minAmount !== draft.maxAmount,
        punishment: draft.punishment,
        intervalMs: resolveDuration(draft.intervalAmount, draft.intervalMaxAmount, draft.intervalUnit),
        windowMs: TAP_WINDOW_MS[draft.window],
        slideMs: draft.slideshow.enabled ? SLIDE_INTERVAL_MS[draft.slideshow.interval] : null,
      }
    case 'sequence': {
      const startLength = randInt(draft.minStartLength, draft.maxStartLength)
      const targetLength = Math.max(startLength, randInt(draft.minTargetLength, draft.maxTargetLength))
      return {
        kind: 'sequence',
        imageIds: pickDistinctImages(draft.imageCount, pools),
        startLength,
        targetLength,
        flashMs: SEQUENCE_FLASH_MS[draft.flashSpeed],
        punishment: draft.punishment,
      }
    }
    case 'steady': {
      const difficulties: SteadyDifficulty[] = ['easy', 'normal', 'hard']
      const difficulty = draft.random ? pick(difficulties) : draft.difficulty
      return {
        kind: 'steady',
        difficulty,
        random: draft.random,
        punishment: draft.punishment,
        slideMs: draft.slideshow.enabled ? SLIDE_INTERVAL_MS[draft.slideshow.interval] : null,
      }
    }
  }
}

function expandChild(child: FlowChild, pools?: string[]): TaskSpec {
  return child.type === 'task'
    ? draftToSpec(child.task, pools)
    : draftToSpec(pick(child.tasks).task, pools)
}

/**
 * Flatten the flow into the runtime's ordered task list, drawing a random value
 * from every range and one candidate from every pool. With `shuffle`, the final
 * order is randomised. `pools` restricts image-based tasks to specific image
 * directories (under `src/img`); omit or pass empty for all pools.
 */
export function expandFlow(
  items: FlowItem[],
  opts: { shuffle?: boolean; pools?: string[] } = {},
): TaskSpec[] {
  const { pools } = opts
  const out: TaskSpec[] = []
  for (const item of items) {
    if (item.type === 'loop') {
      const reps = randInt(item.minRepeat, item.maxRepeat)
      for (let i = 0; i < reps; i++) for (const c of item.children) out.push(expandChild(c, pools))
    } else {
      out.push(expandChild(item, pools))
    }
  }
  if (opts.shuffle) shuffle(out)
  return out
}
