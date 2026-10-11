import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type CaptureConfig } from './captureConfig'
import { initialContext, nextState, type FrameMetrics, type MachineContext } from './captureMachine'

const cfg: CaptureConfig = DEFAULT_CONFIG

// Build frame metrics from defaults; per-call overrides win.
const m = (overrides: Partial<FrameMetrics> = {}): FrameMetrics => ({
  sharpness: 0,
  motion: 0,
  baselineDiff: 0,
  ...overrides,
})

// Run a sequence of (metrics, dt) ticks starting from `start`. Returns the
// final context and an array of capture-triggered tick indices.
function run(
  start: MachineContext,
  steps: { dt: number; metrics: FrameMetrics }[],
): { ctx: MachineContext; captures: number[] } {
  let ctx = start
  let now = start.enteredAt
  const captures: number[] = []
  steps.forEach((s, i) => {
    now += s.dt
    const r = nextState(ctx, s.metrics, now, cfg)
    ctx = r.context
    if (r.capture) captures.push(i)
  })
  return { ctx, captures }
}

describe('initialContext', () => {
  it('starts calibrating with no motion seen', () => {
    const c = initialContext(1000)
    expect(c.state).toBe('calibrating')
    expect(c.enteredAt).toBe(1000)
    expect(c.settleStartedAt).toBeNull()
    expect(c.sawMotion).toBe(false)
  })
})

describe('calibrating → waiting', () => {
  it('stays calibrating until calibrationMs elapses', () => {
    const { ctx } = run(initialContext(0), [{ dt: cfg.calibrationMs - 1, metrics: m() }])
    expect(ctx.state).toBe('calibrating')
  })

  it('advances to waiting once calibrationMs has passed', () => {
    const { ctx } = run(initialContext(0), [{ dt: cfg.calibrationMs, metrics: m() }])
    expect(ctx.state).toBe('waiting')
    expect(ctx.sawMotion).toBe(false)
  })
})

describe('waiting', () => {
  const waiting = (): MachineContext => ({
    state: 'waiting',
    enteredAt: 0,
    settleStartedAt: null,
    sawMotion: false,
  })

  it('latches sawMotion once seen', () => {
    const { ctx } = run(waiting(), [{ dt: 50, metrics: m({ motion: cfg.motionThreshold + 5 }) }])
    expect(ctx.state).toBe('waiting')
    expect(ctx.sawMotion).toBe(true)
  })

  it('does not advance to settling when subject present but no prior motion', () => {
    const { ctx } = run(waiting(), [
      { dt: 50, metrics: m({ baselineDiff: cfg.arrivalThreshold + 10 }) },
    ])
    expect(ctx.state).toBe('waiting')
  })

  it('advances to settling once both motion and subject present', () => {
    const { ctx } = run(waiting(), [
      { dt: 50, metrics: m({ motion: cfg.motionThreshold + 5 }) },
      { dt: 50, metrics: m({ baselineDiff: cfg.arrivalThreshold + 10 }) },
    ])
    expect(ctx.state).toBe('settling')
  })
})

describe('settling', () => {
  const settling = (now = 0): MachineContext => ({
    state: 'settling',
    enteredAt: now,
    settleStartedAt: null,
    sawMotion: true,
  })

  it('re-arms to waiting (clearing motion) if subject is removed', () => {
    const { ctx } = run(settling(), [{ dt: 10, metrics: m({ baselineDiff: 0 }) }])
    expect(ctx.state).toBe('waiting')
    expect(ctx.sawMotion).toBe(false)
  })

  it('does not fire while focus is below threshold', () => {
    const { captures, ctx } = run(settling(), [
      {
        dt: cfg.settleMs + 100,
        metrics: m({
          baselineDiff: cfg.arrivalThreshold + 5,
          motion: 0,
          sharpness: cfg.focusThreshold - 1,
        }),
      },
    ])
    expect(captures).toEqual([])
    expect(ctx.state).toBe('settling')
  })

  it('resets the settle window when conditions break', () => {
    // Build a partial window, break it, and verify settleStartedAt is cleared.
    const good = {
      dt: 100,
      metrics: m({
        baselineDiff: cfg.arrivalThreshold + 5,
        motion: 0,
        sharpness: cfg.focusThreshold + 100,
      }),
    }
    const broken = {
      dt: 100,
      metrics: m({
        baselineDiff: cfg.arrivalThreshold + 5,
        motion: cfg.stillThreshold + 100,
        sharpness: cfg.focusThreshold + 100,
      }),
    }
    const { ctx } = run(settling(), [good, broken])
    expect(ctx.state).toBe('settling')
    expect(ctx.settleStartedAt).toBeNull()
  })

  it('fires capture exactly once after settleMs of continuous good shots', () => {
    const goodTick = {
      dt: 50,
      metrics: m({
        baselineDiff: cfg.arrivalThreshold + 5,
        motion: 0,
        sharpness: cfg.focusThreshold + 100,
      }),
    }
    // Just enough ticks to cross settleMs (600) — stop before the captured
    // flash window (500ms) elapses so the final state is still 'captured'.
    const ticks = Array.from({ length: 14 }, () => goodTick)
    const { captures, ctx } = run(settling(), ticks)
    expect(captures).toHaveLength(1)
    expect(ctx.state).toBe('captured')
  })
})

describe('captured → cooldown → calibrating', () => {
  it('lingers on captured before transitioning to cooldown', () => {
    const start: MachineContext = {
      state: 'captured',
      enteredAt: 0,
      settleStartedAt: null,
      sawMotion: true,
    }
    const { ctx: stillCaptured } = run(start, [{ dt: 100, metrics: m() }])
    expect(stillCaptured.state).toBe('captured')

    const { ctx: nowCooldown } = run(start, [{ dt: 600, metrics: m() }])
    expect(nowCooldown.state).toBe('cooldown')
  })

  it('re-calibrates only when the scene is empty after cooldown', () => {
    const start: MachineContext = {
      state: 'cooldown',
      enteredAt: 0,
      settleStartedAt: null,
      sawMotion: false,
    }
    // Cooldown elapsed but scene still has the subject.
    const { ctx: held } = run(start, [
      { dt: cfg.cooldownMs + 10, metrics: m({ baselineDiff: cfg.emptyThreshold + 5 }) },
    ])
    expect(held.state).toBe('cooldown')

    const { ctx: cleared } = run(start, [
      { dt: cfg.cooldownMs + 10, metrics: m({ baselineDiff: 0 }) },
    ])
    expect(cleared.state).toBe('calibrating')
  })
})

describe('idle', () => {
  it('never transitions or fires', () => {
    const start: MachineContext = {
      state: 'idle',
      enteredAt: 0,
      settleStartedAt: null,
      sawMotion: false,
    }
    const { ctx, captures } = run(start, [
      { dt: 10_000, metrics: m({ motion: 9999, baselineDiff: 9999, sharpness: 9999 }) },
    ])
    expect(ctx.state).toBe('idle')
    expect(captures).toEqual([])
  })
})
