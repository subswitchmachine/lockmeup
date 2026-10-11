import { describe, expect, it } from 'vitest'
import { migrateOptions } from './useLockbox'

describe('migrateOptions', () => {
  it('returns defaults when given null', () => {
    expect(migrateOptions(null)).toMatchObject({
      hideMode: 'show',
      stepCountRandom: false,
      maxTotalMs: null,
      maxTotalRandom: false,
      pools: [],
    })
  })

  it('returns defaults when given a non-object', () => {
    expect(migrateOptions('not an object')).toMatchObject({ hideMode: 'show', pools: [] })
  })

  it('keeps modern records intact and normalises missing pools to []', () => {
    const out = migrateOptions({
      hideMode: 'hide-random',
      stepCountRandom: true,
      maxTotalMs: 3_600_000,
      maxTotalRandom: false,
    })
    expect(out.hideMode).toBe('hide-random')
    expect(out.stepCountRandom).toBe(true)
    expect(out.maxTotalMs).toBe(3_600_000)
    expect(out.pools).toEqual([])
  })

  it('preserves an existing pools array', () => {
    expect(migrateOptions({ hideMode: 'show', pools: ['femdom'] }).pools).toEqual(['femdom'])
  })

  it('migrates legacy hideRandom=true to hide-random', () => {
    expect(migrateOptions({ hideRandom: true }).hideMode).toBe('hide-random')
  })

  it('migrates legacy hideRandom=false (or missing) to show', () => {
    expect(migrateOptions({ hideRandom: false }).hideMode).toBe('show')
    expect(migrateOptions({}).hideMode).toBe('show')
  })

  it('carries legacy stepCountRandom / maxTotalMs through the migration', () => {
    const out = migrateOptions({
      hideRandom: false,
      stepCountRandom: true,
      maxTotalMs: 60_000,
      maxTotalRandom: true,
    })
    expect(out).toMatchObject({
      hideMode: 'show',
      stepCountRandom: true,
      maxTotalMs: 60_000,
      maxTotalRandom: true,
    })
  })

  it('defaults pools to [] on legacy records', () => {
    expect(migrateOptions({ hideRandom: true }).pools).toEqual([])
  })
})
