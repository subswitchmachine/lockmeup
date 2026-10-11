import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, STATE_LABELS, type CaptureState } from './captureConfig'

describe('DEFAULT_CONFIG', () => {
  it('keeps the still threshold below the motion threshold so there is a settle gap', () => {
    expect(DEFAULT_CONFIG.stillThreshold).toBeLessThan(DEFAULT_CONFIG.motionThreshold)
  })

  it('uses positive ROI fraction and analysis width', () => {
    expect(DEFAULT_CONFIG.analysisWidth).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.roiFraction).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.roiFraction).toBeLessThanOrEqual(1)
  })

  it('has non-zero timing windows', () => {
    expect(DEFAULT_CONFIG.calibrationMs).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.settleMs).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.cooldownMs).toBeGreaterThan(0)
  })

  it('captures at least one frame per trigger', () => {
    expect(DEFAULT_CONFIG.burstCount).toBeGreaterThanOrEqual(1)
    expect(DEFAULT_CONFIG.burstIntervalMs).toBeGreaterThan(0)
  })
})

describe('STATE_LABELS', () => {
  it('has a non-empty label for every capture state', () => {
    const states: CaptureState[] = [
      'idle',
      'calibrating',
      'waiting',
      'settling',
      'captured',
      'cooldown',
    ]
    for (const s of states) {
      expect(STATE_LABELS[s]).toBeTruthy()
      expect(typeof STATE_LABELS[s]).toBe('string')
    }
  })
})
