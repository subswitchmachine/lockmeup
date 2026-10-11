import { describe, expect, it } from 'vitest'
import { formatRemaining, UNIT_MS, UNIT_SHORT } from './time'

describe('formatRemaining', () => {
  it('shows minutes and seconds for sub-hour durations', () => {
    expect(formatRemaining(5_000)).toBe('0m 5s')
    expect(formatRemaining(90_000)).toBe('1m 30s')
  })

  it('adds hours once an hour or more remains', () => {
    expect(formatRemaining(3_600_000)).toBe('1h 0m 0s')
    expect(formatRemaining(3_661_000)).toBe('1h 1m 1s')
  })

  it('adds days for multi-day durations', () => {
    expect(formatRemaining(90_061_000)).toBe('1d 1h 1m 1s')
  })

  it('omits the hours segment below an hour', () => {
    expect(formatRemaining(59_000)).toBe('0m 59s')
  })

  it('clamps negatives to zero', () => {
    expect(formatRemaining(-5_000)).toBe('0m 0s')
  })

  it('floors partial seconds', () => {
    expect(formatRemaining(1_999)).toBe('0m 1s')
  })

  it('handles exact-day boundaries', () => {
    expect(formatRemaining(86_400_000)).toBe('1d 0h 0m 0s')
    expect(formatRemaining(2 * 86_400_000)).toBe('2d 0h 0m 0s')
  })
})

describe('UNIT_MS', () => {
  it('maps each unit to its millisecond value', () => {
    expect(UNIT_MS.seconds).toBe(1_000)
    expect(UNIT_MS.minutes).toBe(60_000)
    expect(UNIT_MS.hours).toBe(3_600_000)
    expect(UNIT_MS.days).toBe(86_400_000)
  })

  it('is strictly ascending across the four units', () => {
    expect(UNIT_MS.seconds).toBeLessThan(UNIT_MS.minutes)
    expect(UNIT_MS.minutes).toBeLessThan(UNIT_MS.hours)
    expect(UNIT_MS.hours).toBeLessThan(UNIT_MS.days)
  })
})

describe('UNIT_SHORT', () => {
  it('has a short label for every unit', () => {
    expect(UNIT_SHORT.seconds).toBe('s')
    expect(UNIT_SHORT.minutes).toBe('min')
    expect(UNIT_SHORT.hours).toBe('h')
    expect(UNIT_SHORT.days).toBe('d')
  })
})
