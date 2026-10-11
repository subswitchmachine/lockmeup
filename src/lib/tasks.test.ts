import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyPunishment,
  draftToSpec,
  expandFlow,
  flowTaskRange,
  gridForAspect,
  hasRandomStepCount,
  newDraft,
  newFlowId,
  penaltyLabel,
  resolveDuration,
  FOCUS_MOTION_LIMIT,
  HOLD_SIZE_FRACTION,
  HOLD_SPEED_PX_PER_MS,
  MISMATCH_MS,
  PIECE_OPTIONS,
  SEQUENCE_FLASH_MS,
  SLIDE_INTERVAL_MS,
  TAP_WINDOW_MS,
  type FlowItem,
  type Punishment,
  type TaskDraft,
} from './tasks'

afterEach(() => vi.restoreAllMocks())

// Build a flow `task` item with a fresh id around the given draft.
const taskItem = (task: TaskDraft): FlowItem => ({ id: newFlowId(), type: 'task', task })

describe('tuning constants', () => {
  it('exposes ascending PIECE_OPTIONS', () => {
    const sorted = [...PIECE_OPTIONS].sort((a, b) => a - b)
    expect([...PIECE_OPTIONS]).toEqual(sorted)
    expect(PIECE_OPTIONS[0]).toBeGreaterThan(0)
  })

  it('orders mismatch hold-times by speed (quick < normal < slow < verySlow)', () => {
    expect(MISMATCH_MS.quick).toBeLessThan(MISMATCH_MS.normal)
    expect(MISMATCH_MS.normal).toBeLessThan(MISMATCH_MS.slow)
    expect(MISMATCH_MS.slow).toBeLessThan(MISMATCH_MS.verySlow)
  })

  it('orders hold-speed knob ascending', () => {
    expect(HOLD_SPEED_PX_PER_MS.slow).toBeLessThan(HOLD_SPEED_PX_PER_MS.medium)
    expect(HOLD_SPEED_PX_PER_MS.medium).toBeLessThan(HOLD_SPEED_PX_PER_MS.fast)
  })

  it('orders hold-size fractions ascending and within (0, 1)', () => {
    for (const v of Object.values(HOLD_SIZE_FRACTION)) {
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThan(1)
    }
    expect(HOLD_SIZE_FRACTION.small).toBeLessThan(HOLD_SIZE_FRACTION.medium)
    expect(HOLD_SIZE_FRACTION.medium).toBeLessThan(HOLD_SIZE_FRACTION.large)
  })

  it('relaxes the focus motion limit as sensitivity decreases', () => {
    expect(FOCUS_MOTION_LIMIT.strict).toBeLessThan(FOCUS_MOTION_LIMIT.normal)
    expect(FOCUS_MOTION_LIMIT.normal).toBeLessThan(FOCUS_MOTION_LIMIT.relaxed)
  })

  it('orders sequence flash durations descending with speed (slow > normal > fast)', () => {
    expect(SEQUENCE_FLASH_MS.slow).toBeGreaterThan(SEQUENCE_FLASH_MS.normal)
    expect(SEQUENCE_FLASH_MS.normal).toBeGreaterThan(SEQUENCE_FLASH_MS.fast)
  })

  it('orders slide intervals ascending (fast < medium < slow)', () => {
    expect(SLIDE_INTERVAL_MS.fast).toBeLessThan(SLIDE_INTERVAL_MS.medium)
    expect(SLIDE_INTERVAL_MS.medium).toBeLessThan(SLIDE_INTERVAL_MS.slow)
  })

  it('orders tap windows ascending (quick < normal < slow)', () => {
    expect(TAP_WINDOW_MS.quick).toBeLessThan(TAP_WINDOW_MS.normal)
    expect(TAP_WINDOW_MS.normal).toBeLessThan(TAP_WINDOW_MS.slow)
  })
})

describe('gridForAspect', () => {
  it('produces a square grid for a square aspect', () => {
    expect(gridForAspect(100, 1)).toEqual({ cols: 10, rows: 10 })
  })

  it('clamps to a minimum of 2 columns and rows', () => {
    const { cols, rows } = gridForAspect(2, 1)
    expect(cols).toBeGreaterThanOrEqual(2)
    expect(rows).toBeGreaterThanOrEqual(2)
  })

  it('makes wider grids for wider aspect ratios', () => {
    const wide = gridForAspect(100, 4)
    expect(wide.cols).toBeGreaterThan(wide.rows)
  })
})

describe('resolveDuration', () => {
  it('returns an exact value when the bounds are equal', () => {
    expect(resolveDuration(5, 5, 'minutes')).toBe(300_000)
    expect(resolveDuration(30, 30, 'seconds')).toBe(30_000)
  })

  it('returns the low bound (in ms) when Math.random is 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(resolveDuration(1, 3, 'minutes')).toBe(60_000)
  })

  it('stays within the range and tolerates reversed bounds', () => {
    for (let i = 0; i < 100; i++) {
      const v = resolveDuration(3, 1, 'seconds')
      expect(v).toBeGreaterThanOrEqual(1_000)
      expect(v).toBeLessThanOrEqual(3_000)
    }
  })
})

describe('applyPunishment', () => {
  const penalty = (minAmount: number, maxAmount: number): Punishment => ({
    mode: 'penalty',
    random: minAmount !== maxAmount,
    minAmount,
    maxAmount,
    unit: 'seconds',
  })

  it('wipes the accumulator to zero on reset', () => {
    expect(applyPunishment(123_456, { mode: 'reset' })).toBe(0)
  })

  it('subtracts a fixed penalty', () => {
    expect(applyPunishment(100_000, penalty(10, 10))).toBe(90_000)
  })

  it('clamps the result at zero', () => {
    expect(applyPunishment(5_000, penalty(10, 10))).toBe(0)
  })

  it('subtracts from within the ranged penalty bounds', () => {
    for (let i = 0; i < 30; i++) {
      const out = applyPunishment(60_000, penalty(5, 20))
      expect(out).toBeGreaterThanOrEqual(60_000 - 20_000)
      expect(out).toBeLessThanOrEqual(60_000 - 5_000)
    }
  })

  it('returns zero when the accumulator is already zero', () => {
    expect(applyPunishment(0, penalty(5, 5))).toBe(0)
    expect(applyPunishment(0, { mode: 'reset' })).toBe(0)
  })
})

describe('penaltyLabel', () => {
  it('renders a fixed penalty compactly', () => {
    expect(
      penaltyLabel({ mode: 'penalty', random: false, minAmount: 5, maxAmount: 5, unit: 'seconds' }),
    ).toBe('5s')
  })

  it('renders a ranged penalty', () => {
    expect(
      penaltyLabel({ mode: 'penalty', random: true, minAmount: 1, maxAmount: 3, unit: 'minutes' }),
    ).toBe('1–3 min')
  })
})

describe('flowTaskRange', () => {
  it('counts one per task item', () => {
    const items = [taskItem(newDraft('wait')), taskItem(newDraft('hold'))]
    expect(flowTaskRange(items)).toEqual({ min: 2, max: 2 })
  })

  it('counts a pool as a single task position', () => {
    const pool: FlowItem = {
      id: newFlowId(),
      type: 'pool',
      tasks: [
        { id: newFlowId(), task: newDraft('wait') },
        { id: newFlowId(), task: newDraft('hold') },
      ],
    }
    expect(flowTaskRange([pool])).toEqual({ min: 1, max: 1 })
  })

  it('multiplies loop children by the repeat range', () => {
    const loop: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: true,
      minRepeat: 2,
      maxRepeat: 4,
      children: [{ id: newFlowId(), type: 'task', task: newDraft('wait') }],
    }
    expect(flowTaskRange([loop])).toEqual({ min: 2, max: 4 })
  })

  it('returns 0..0 for an empty flow', () => {
    expect(flowTaskRange([])).toEqual({ min: 0, max: 0 })
  })

  it('sums multiple loops + tasks correctly', () => {
    const items: FlowItem[] = [
      taskItem(newDraft('wait')),
      {
        id: newFlowId(),
        type: 'loop',
        random: true,
        minRepeat: 1,
        maxRepeat: 3,
        children: [
          { id: newFlowId(), type: 'task', task: newDraft('hold') },
          { id: newFlowId(), type: 'task', task: newDraft('typing') },
        ],
      },
      taskItem(newDraft('memory')),
    ]
    // 1 + (1..3)*2 + 1 = 4..8
    expect(flowTaskRange(items)).toEqual({ min: 4, max: 8 })
  })
})

describe('hasRandomStepCount', () => {
  it('is false without loops', () => {
    expect(hasRandomStepCount([taskItem(newDraft('wait'))])).toBe(false)
  })

  it('is true for a loop with a non-trivial repeat range', () => {
    const loop: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: true,
      minRepeat: 1,
      maxRepeat: 3,
      children: [{ id: newFlowId(), type: 'task', task: newDraft('wait') }],
    }
    expect(hasRandomStepCount([loop])).toBe(true)
  })

  it('is false for a fixed-repeat loop', () => {
    const loop: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: false,
      minRepeat: 3,
      maxRepeat: 3,
      children: [{ id: newFlowId(), type: 'task', task: newDraft('wait') }],
    }
    expect(hasRandomStepCount([loop])).toBe(false)
  })
})

describe('draftToSpec', () => {
  it('resolves a wait draft to a concrete spec', () => {
    const draft = newDraft('wait') // fixed 5 minutes, no slideshow
    const spec = draftToSpec(draft)
    expect(spec.kind).toBe('wait')
    if (spec.kind === 'wait') {
      expect(spec.durationMs).toBe(300_000)
      expect(spec.random).toBe(false)
      expect(spec.slideMs).toBeNull()
    }
  })

  it('flags `random` when the bounds differ', () => {
    const draft: TaskDraft = { ...newDraft('wait'), random: true, minAmount: 1, maxAmount: 3 }
    const spec = draftToSpec(draft)
    if (spec.kind === 'wait') expect(spec.random).toBe(true)
  })

  it('resolves a hold draft to ms with its speed / size carried over', () => {
    const spec = draftToSpec(newDraft('hold'))
    if (spec.kind === 'hold') {
      expect(spec.durationMs).toBe(30_000)
      expect(spec.speed).toBe('medium')
      expect(spec.size).toBe('medium')
    }
  })

  it('resolves a focus draft preserving its sensitivity / camera flags', () => {
    const spec = draftToSpec(newDraft('focus'))
    if (spec.kind === 'focus') {
      expect(spec.sensitivity).toBe('strict')
      expect(spec.requireFace).toBe(true)
      expect(spec.requireTabFocus).toBe(true)
      expect(spec.showCamera).toBe(false)
    }
  })

  it('resolves a tap draft with both task and tap-interval durations in ms', () => {
    const spec = draftToSpec(newDraft('tap'))
    if (spec.kind === 'tap') {
      expect(spec.durationMs).toBe(30_000)
      expect(spec.intervalMs).toBe(7_000)
      expect(spec.windowMs).toBeGreaterThan(0)
    }
  })

  it('resolves a typing draft preserving its line and penalty bounds', () => {
    const draft: TaskDraft = { ...newDraft('typing'), line: 'hello world', minReps: 4, maxReps: 4 }
    const spec = draftToSpec(draft)
    if (spec.kind === 'typing') {
      expect(spec.line).toBe('hello world')
      expect(spec.reps).toBe(4)
      expect(spec.minPenaltyReps).toBe(1)
      expect(spec.maxPenaltyReps).toBe(1)
    }
  })

  it('resolves a sequence draft with target ≥ start', () => {
    const spec = draftToSpec(newDraft('sequence'))
    if (spec.kind === 'sequence') {
      expect(spec.startLength).toBe(3)
      expect(spec.targetLength).toBe(8)
      expect(spec.flashMs).toBeGreaterThan(0)
    }
  })

  it('resolves a steady draft to a fixed difficulty when random is false', () => {
    const spec = draftToSpec(newDraft('steady'))
    if (spec.kind === 'steady') {
      expect(spec.difficulty).toBe('normal')
      expect(spec.random).toBe(false)
    }
  })

  it('picks a random difficulty when steady.random is true', () => {
    const draft: TaskDraft = { ...newDraft('steady'), random: true }
    const spec = draftToSpec(draft)
    if (spec.kind === 'steady') {
      expect(['easy', 'normal', 'hard']).toContain(spec.difficulty)
      expect(spec.random).toBe(true)
    }
  })

  it('enables slideshow timing when the slideshow draft is on', () => {
    const draft: TaskDraft = {
      ...newDraft('wait'),
      slideshow: { enabled: true, interval: 'medium' },
    }
    const spec = draftToSpec(draft)
    if (spec.kind === 'wait') {
      expect(spec.slideMs).not.toBeNull()
      expect(spec.slideMs!).toBeGreaterThan(0)
    }
  })
})

describe('expandFlow', () => {
  it('emits one spec per task item', () => {
    const items = [taskItem(newDraft('wait')), taskItem(newDraft('hold'))]
    expect(expandFlow(items)).toHaveLength(2)
  })

  it('expands a loop into repeat × children specs', () => {
    const loop: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: false,
      minRepeat: 3,
      maxRepeat: 3,
      children: [{ id: newFlowId(), type: 'task', task: newDraft('wait') }],
    }
    expect(expandFlow([loop])).toHaveLength(3)
  })

  it('keeps the same multiset of kinds when shuffling', () => {
    const items = [
      taskItem(newDraft('wait')),
      taskItem(newDraft('hold')),
      taskItem(newDraft('typing')),
    ]
    const kinds = expandFlow(items, { shuffle: true })
      .map((s) => s.kind)
      .sort()
    expect(kinds).toEqual(['hold', 'typing', 'wait'])
  })

  it('expands a pool by picking exactly one child', () => {
    const pool: FlowItem = {
      id: newFlowId(),
      type: 'pool',
      tasks: [
        { id: newFlowId(), task: newDraft('wait') },
        { id: newFlowId(), task: newDraft('hold') },
        { id: newFlowId(), task: newDraft('typing') },
      ],
    }
    const out = expandFlow([pool])
    expect(out).toHaveLength(1)
    expect(['wait', 'hold', 'typing']).toContain(out[0].kind)
  })

  it('combines loops + pools without losing items', () => {
    const items: FlowItem[] = [
      taskItem(newDraft('wait')),
      {
        id: newFlowId(),
        type: 'loop',
        random: false,
        minRepeat: 2,
        maxRepeat: 2,
        children: [
          { id: newFlowId(), type: 'task', task: newDraft('hold') },
          {
            id: newFlowId(),
            type: 'pool',
            tasks: [
              { id: newFlowId(), task: newDraft('typing') },
              { id: newFlowId(), task: newDraft('memory') },
            ],
          },
        ],
      },
    ]
    // 1 wait + 2 loop reps × (1 hold + 1 from pool) = 5 specs
    expect(expandFlow(items)).toHaveLength(5)
  })

  it('returns an empty array for an empty flow', () => {
    expect(expandFlow([])).toEqual([])
  })

  it('produces zero specs from a loop with zero repeats', () => {
    const loop: FlowItem = {
      id: newFlowId(),
      type: 'loop',
      random: false,
      minRepeat: 0,
      maxRepeat: 0,
      children: [{ id: newFlowId(), type: 'task', task: newDraft('wait') }],
    }
    expect(expandFlow([loop])).toEqual([])
  })
})
