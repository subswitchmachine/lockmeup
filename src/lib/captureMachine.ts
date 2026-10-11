import type { CaptureConfig, CaptureState } from './captureConfig'

/** Per-frame measurements fed into the machine. */
export interface FrameMetrics {
  /** Laplacian variance of the ROI (focus). */
  sharpness: number
  /** Mean abs diff vs. the previous frame's ROI (motion). */
  motion: number
  /** Mean abs diff vs. the baseline ROI (subject presence). */
  baselineDiff: number
}

/** All mutable machine bookkeeping. Treated as immutable by `nextState`. */
export interface MachineContext {
  state: CaptureState
  /** Timestamp (ms) the current state was entered. */
  enteredAt: number
  /** When the current continuous "good shot" window began, or null. */
  settleStartedAt: number | null
  /** Whether motion has been observed since arming (the "motion-then-still" gate). */
  sawMotion: boolean
}

export interface MachineResult {
  context: MachineContext
  /** True only on the single tick a capture should be taken. */
  capture: boolean
}

/** How long the "Captured!" badge lingers before cooldown. */
const CAPTURED_FLASH_MS = 500

export function initialContext(now: number): MachineContext {
  return { state: 'calibrating', enteredAt: now, settleStartedAt: null, sawMotion: false }
}

function enter(state: CaptureState, now: number, ctx: MachineContext): MachineContext {
  return { ...ctx, state, enteredAt: now, settleStartedAt: null }
}

/**
 * Pure transition function. Given the previous context, this tick's metrics,
 * the current time and config, returns the next context and whether to capture.
 *
 * The capture gate is deliberately sequential: an empty, in-focus, motionless
 * scene can never advance past `waiting`, because reaching `settling` requires
 * both a large baseline difference (something arrived) AND prior motion.
 */
export function nextState(
  ctx: MachineContext,
  m: FrameMetrics,
  now: number,
  cfg: CaptureConfig,
): MachineResult {
  switch (ctx.state) {
    case 'idle':
      return { context: ctx, capture: false }

    case 'calibrating': {
      if (now - ctx.enteredAt >= cfg.calibrationMs) {
        return { context: { ...enter('waiting', now, ctx), sawMotion: false }, capture: false }
      }
      return { context: ctx, capture: false }
    }

    case 'waiting': {
      const sawMotion = ctx.sawMotion || m.motion > cfg.motionThreshold
      const subjectPresent = m.baselineDiff > cfg.arrivalThreshold
      if (subjectPresent && sawMotion) {
        return { context: enter('settling', now, { ...ctx, sawMotion }), capture: false }
      }
      return { context: { ...ctx, sawMotion }, capture: false }
    }

    case 'settling': {
      // Subject removed before settling — re-arm and require fresh motion.
      if (m.baselineDiff <= cfg.arrivalThreshold) {
        return { context: { ...enter('waiting', now, ctx), sawMotion: false }, capture: false }
      }
      const goodShot = m.motion < cfg.stillThreshold && m.sharpness > cfg.focusThreshold
      if (!goodShot) {
        // Conditions broke — restart the continuous-window timer but stay settling.
        return { context: { ...ctx, settleStartedAt: null }, capture: false }
      }
      const startedAt = ctx.settleStartedAt ?? now
      if (now - startedAt >= cfg.settleMs) {
        return { context: enter('captured', now, ctx), capture: true }
      }
      return { context: { ...ctx, settleStartedAt: startedAt }, capture: false }
    }

    case 'captured': {
      if (now - ctx.enteredAt >= CAPTURED_FLASH_MS) {
        return { context: enter('cooldown', now, ctx), capture: false }
      }
      return { context: ctx, capture: false }
    }

    case 'cooldown': {
      const elapsed = now - ctx.enteredAt >= cfg.cooldownMs
      const sceneEmpty = m.baselineDiff < cfg.emptyThreshold
      if (elapsed && sceneEmpty) {
        // Re-calibrate against the (now empty) scene before re-arming.
        return { context: enter('calibrating', now, ctx), capture: false }
      }
      return { context: ctx, capture: false }
    }
  }
}
