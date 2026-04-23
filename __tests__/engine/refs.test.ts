import { describe, it, expect } from 'vitest'
import { podCaptainsNeeded, computeRefRequirements } from '../../src/engine/refs.ts'
import { PodCaptainOverride, DeMode, Weapon, Phase } from '../../src/engine/types.ts'
import type { RefDemandByDay } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// podCaptainsNeeded
// ──────────────────────────────────────────────

describe('podCaptainsNeeded', () => {
  it('DISABLED override → 0 regardless of strips', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.DISABLED, DeMode.SINGLE_STAGE, 32, Phase.DE_FINALS, 12)).toBe(0)
  })

  it('FORCE_4 override with 12 strips → ceil(12/4) = 3', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.FORCE_4, DeMode.SINGLE_STAGE, 32, Phase.DE_FINALS, 12)).toBe(3)
  })

  it('AUTO, SINGLE_STAGE, bracket ≤32, 8 strips → ceil(8/4) = 2', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.SINGLE_STAGE, 32, Phase.DE_FINALS, 8)).toBe(2)
  })

  it('AUTO, SINGLE_STAGE, bracket 64, 16 strips → ceil(16/8) = 2', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.SINGLE_STAGE, 64, Phase.DE_FINALS, 16)).toBe(2)
  })

  it('AUTO, STAGED, DE_ROUND_OF_16 phase, 4 strips → ceil(4/4) = 1', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.STAGED, 64, Phase.DE_ROUND_OF_16, 4)).toBe(1)
  })

  it('AUTO, STAGED, DE_FINALS phase, 8 strips → ceil(8/8) = 1', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.STAGED, 64, Phase.DE_FINALS, 8)).toBe(1)
  })

  it('AUTO, SINGLE_STAGE, bracket ≤32, 9 strips → ceil(9/4) = 3', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.SINGLE_STAGE, 16, Phase.DE_FINALS, 9)).toBe(3)
  })

  it('FORCE_4 with 7 strips → ceil(7/4) = 2', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.FORCE_4, DeMode.SINGLE_STAGE, 64, Phase.DE_FINALS, 7)).toBe(2)
  })
})


// ──────────────────────────────────────────────
// computeRefRequirements
// ──────────────────────────────────────────────

describe('computeRefRequirements', () => {
  it('single FOIL interval on day 0 → peak_total=3, peak_saber=0, peak_time=600', () => {
    const demandByDay: Record<number, RefDemandByDay> = {
      0: { intervals: [{ startTime: 600, endTime: 660, count: 3, weapon: Weapon.FOIL }] },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result).toEqual([{ day: 0, peak_total_refs: 3, peak_saber_refs: 0, peak_time: 600 }])
  })

  it('two non-overlapping intervals → peak equals max interval count', () => {
    // {600,660,2} ends at 660; {780,840,3} starts at 780 — gap=120, fully non-adjacent
    // Running sum never exceeds 3 (no overlap)
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL },
          { startTime: 780, endTime: 840, count: 3, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(3)
    expect(result[0].peak_time).toBe(780)
  })

  it('two overlapping FOIL intervals → peak is their sum at the overlap start', () => {
    // {600,720,2} overlaps with {660,780,3} — at t=660 running sum = 2+3 = 5
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 720, count: 2, weapon: Weapon.FOIL },
          { startTime: 660, endTime: 780, count: 3, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(5)
    expect(result[0].peak_time).toBe(660)
  })

  it('mixed weapons → peak_total sums across weapons, peak_saber counts only SABRE', () => {
    // FOIL {600,660,2} overlaps SABRE {630,690,4} from t=630: total=6, saber=4
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL },
          { startTime: 630, endTime: 690, count: 4, weapon: Weapon.SABRE },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(6)
    expect(result[0].peak_saber_refs).toBe(4)
    expect(result[0].peak_time).toBe(630)
  })

  it('tie-break: +count events before -count at same time → peak includes both concurrent intervals', () => {
    // A {600,660,2} ends at 660; B {660,720,3} starts at 660.
    // At t=660: +3 applied before -2, so running sum reaches 2+3=5 before dropping to 3.
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL },
          { startTime: 660, endTime: 720, count: 3, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(5)
    expect(result[0].peak_time).toBe(660)
  })

  it('empty demandByDay → single zero entry for daysAvailable=1', () => {
    const result = computeRefRequirements({}, 1)
    expect(result).toEqual([{ day: 0, peak_total_refs: 0, peak_saber_refs: 0, peak_time: 0 }])
  })

  it('multi-day: day 0 FOIL, day 1 empty, day 2 SABRE → 3 entries with correct peaks', () => {
    const demandByDay: Record<number, RefDemandByDay> = {
      0: { intervals: [{ startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL }] },
      2: { intervals: [{ startTime: 540, endTime: 600, count: 3, weapon: Weapon.SABRE }] },
    }
    const result = computeRefRequirements(demandByDay, 3)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ day: 0, peak_total_refs: 2, peak_saber_refs: 0, peak_time: 600 })
    expect(result[1]).toEqual({ day: 1, peak_total_refs: 0, peak_saber_refs: 0, peak_time: 0 })
    expect(result[2]).toEqual({ day: 2, peak_total_refs: 3, peak_saber_refs: 3, peak_time: 540 })
  })

  it('daysAvailable = 0 → returns empty array', () => {
    expect(computeRefRequirements({}, 0)).toEqual([])
  })

  it('three overlapping FOIL intervals → peak is reached mid-stack', () => {
    // A: 600-720 count=1
    // B: 630-690 count=2   (A+B=3 at 630)
    // C: 660-680 count=4   (A+B+C=7 at 660 — peak mid-stack)
    const demand: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 720, count: 1, weapon: Weapon.FOIL },
          { startTime: 630, endTime: 690, count: 2, weapon: Weapon.FOIL },
          { startTime: 660, endTime: 680, count: 4, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demand, 1)
    expect(result[0].peak_total_refs).toBe(7)
    expect(result[0].peak_time).toBe(660)
  })
})
