import { describe, expect, it } from 'vitest'
import type { TaskSpec } from '../lib/tasks'
import { specSummary } from './sessionLogModel'

describe('specSummary', () => {
  it('renders jigsaw piece count', () => {
    const spec: TaskSpec = { kind: 'jigsaw', imageId: 'x', pieces: 50 }
    expect(specSummary(spec)).toBe('50 pieces')
  })

  it('renders the sliding grid as N×N', () => {
    expect(specSummary({ kind: 'sliding', imageId: 'x', size: 4 })).toBe('4×4')
  })

  it('renders memory tile count', () => {
    expect(specSummary({ kind: 'memory', imageIds: ['a', 'b', 'c'], mismatchMs: 800 })).toBe(
      '3 tiles',
    )
  })

  it('renders typing reps and a fixed penalty', () => {
    expect(
      specSummary({
        kind: 'typing',
        line: 'hi',
        reps: 5,
        random: false,
        minPenaltyReps: 2,
        maxPenaltyReps: 2,
        slideMs: null,
      }),
    ).toBe('5 reps · +2 reps on mistake')
  })

  it('renders typing reps with a ranged penalty', () => {
    expect(
      specSummary({
        kind: 'typing',
        line: 'hi',
        reps: 5,
        random: false,
        minPenaltyReps: 1,
        maxPenaltyReps: 3,
        slideMs: null,
      }),
    ).toBe('5 reps · +1–3 reps on mistake')
  })

  it('renders sequence tiles + step range', () => {
    expect(
      specSummary({
        kind: 'sequence',
        imageIds: ['a', 'b', 'c', 'd'],
        startLength: 3,
        targetLength: 8,
        flashMs: 600,
        punishment: { mode: 'reset' },
      }),
    ).toBe('4 tiles · 3→8 steps')
  })

  it('renders wait as a formatted duration', () => {
    expect(
      specSummary({ kind: 'wait', durationMs: 90_000, random: false, slideMs: null }),
    ).toBe('1m 30s')
  })

  it('renders hold with duration + speed + size', () => {
    expect(
      specSummary({
        kind: 'hold',
        durationMs: 30_000,
        random: false,
        punishment: { mode: 'reset' },
        speed: 'medium',
        size: 'large',
        slideMs: null,
      }),
    ).toBe('0m 30s · medium speed · large target')
  })

  it('renders focus with sensitivity and the active requirements', () => {
    expect(
      specSummary({
        kind: 'focus',
        durationMs: 60_000,
        random: false,
        punishment: { mode: 'reset' },
        sensitivity: 'strict',
        requireFace: true,
        requireTabFocus: false,
        showCamera: false,
        slideMs: null,
      }),
    ).toBe('1m 0s · strict · face required')
  })

  it('omits inactive focus requirements', () => {
    const out = specSummary({
      kind: 'focus',
      durationMs: 60_000,
      random: false,
      punishment: { mode: 'reset' },
      sensitivity: 'relaxed',
      requireFace: false,
      requireTabFocus: false,
      showCamera: false,
      slideMs: null,
    })
    expect(out).toBe('1m 0s · relaxed')
  })

  it('renders tap with duration and interval', () => {
    expect(
      specSummary({
        kind: 'tap',
        durationMs: 60_000,
        random: false,
        punishment: { mode: 'reset' },
        intervalMs: 7_000,
        windowMs: 5_000,
        slideMs: null,
      }),
    ).toBe('1m 0s · every 0m 7s')
  })

  it('renders steady as its difficulty', () => {
    expect(
      specSummary({
        kind: 'steady',
        difficulty: 'hard',
        random: false,
        punishment: { mode: 'reset' },
        slideMs: null,
      }),
    ).toBe('hard')
  })
})
