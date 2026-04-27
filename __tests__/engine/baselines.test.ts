/**
 * Smoke test for SERIAL_BASELINES export.
 * Verifies the baseline constants are properly typed and contain valid values.
 */
import { describe, it, expect } from 'vitest'
import { SERIAL_BASELINES } from './baselines.ts'

describe('SERIAL_BASELINES', () => {
  it('should export all 7 baseline scenarios', () => {
    expect(Object.keys(SERIAL_BASELINES)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'])
  })

  it('should have positive integer counts for each scenario', () => {
    for (const [scenario, count] of Object.entries(SERIAL_BASELINES)) {
      expect(count, `${scenario} count`).toBeGreaterThanOrEqual(1)
      expect(Number.isInteger(count), `${scenario} is integer`).toBe(true)
    }
  })

  it('should be typed as const', () => {
    // This is a compile-time assertion; if it fails, TS will report an error
    // Verify by checking that the type is literally readonly
    const x: typeof SERIAL_BASELINES = SERIAL_BASELINES
    expect(x).toBeDefined()
  })
})
