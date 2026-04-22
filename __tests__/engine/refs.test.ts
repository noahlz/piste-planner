import { describe, it, expect } from 'vitest'
import { podCaptainsNeeded, refsAvailableOnDay, calculateOptimalRefs, preliminaryDayAssign } from '../../src/engine/refs.ts'
import { PodCaptainOverride, DeMode, Weapon, Category, Gender, Phase, RefPolicy } from '../../src/engine/types.ts'
import type { DayRefereeAvailability } from '../../src/engine/types.ts'
import { makeConfig, makeCompetition } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function makeAvailability(day: number, foil_epee_refs: number, three_weapon_refs: number): DayRefereeAvailability {
  return { day, foil_epee_refs, three_weapon_refs, source: 'ACTUAL' }
}

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
// refsAvailableOnDay
// ──────────────────────────────────────────────

describe('refsAvailableOnDay', () => {
  const config = makeConfig({
    days_available: 2,
    referee_availability: [
      makeAvailability(0, 10, 5),
      makeAvailability(1, 8, 3),
    ],
  })

  it('SABRE weapon → three_weapon_refs only', () => {
    expect(refsAvailableOnDay(0, Weapon.SABRE, config)).toBe(5)
  })

  it('FOIL weapon → foil_epee_refs + three_weapon_refs (saber refs cross over)', () => {
    expect(refsAvailableOnDay(0, Weapon.FOIL, config)).toBe(15)
  })

  it('EPEE weapon → foil_epee_refs + three_weapon_refs (saber refs cross over)', () => {
    expect(refsAvailableOnDay(0, Weapon.EPEE, config)).toBe(15)
  })

  it('day 1, SABRE → 3 saber refs only', () => {
    expect(refsAvailableOnDay(1, Weapon.SABRE, config)).toBe(3)
  })

  it('day 1, FOIL → 11 (8 + 3)', () => {
    expect(refsAvailableOnDay(1, Weapon.FOIL, config)).toBe(11)
  })

  it('out-of-bounds day index → 0', () => {
    expect(refsAvailableOnDay(99, Weapon.FOIL, config)).toBe(0)
  })
})

// ──────────────────────────────────────────────
// preliminaryDayAssign
// ──────────────────────────────────────────────

describe('preliminaryDayAssign', () => {
  it('single competition → assigned to day 0', () => {
    const config = makeConfig({ days_available: 2 })
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL })
    const result = preliminaryDayAssign([comp], config)
    expect(result.get('foil-1')).toBe(0)
  })

  it('two non-conflicting competitions → both can land on day 0', () => {
    // Different genders: no crossover penalty → greedy assigns both to lowest-penalty day
    const config = makeConfig({ days_available: 2 })
    const comps = [
      makeCompetition({ id: 'men-foil', weapon: Weapon.FOIL, gender: Gender.MEN }),
      makeCompetition({ id: 'women-foil', weapon: Weapon.FOIL, gender: Gender.WOMEN }),
    ]
    const result = preliminaryDayAssign(comps, config)
    // No crossover between genders — both should land on day 0 (lowest index first)
    expect(result.get('men-foil')).toBe(0)
    expect(result.get('women-foil')).toBe(0)
  })

  it('two conflicting same-gender competitions → assigned to different days', () => {
    // CADET + JUNIOR same gender+weapon have crossover penalty > 0
    const config = makeConfig({ days_available: 2 })
    const comps = [
      makeCompetition({ id: 'men-cadet-foil', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.CADET }),
      makeCompetition({ id: 'men-junior-foil', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.JUNIOR }),
    ]
    const result = preliminaryDayAssign(comps, config)
    // Crossover between CADET+JUNIOR (same gender+weapon) forces them onto different days
    expect(result.get('men-cadet-foil')).not.toBe(result.get('men-junior-foil'))
  })

  it('constraint-scored assignment avoids conflicts that round-robin would create', () => {
    // Input order is arranged so round-robin (idx % 2) puts MEN_CADET and MEN_JUNIOR
    // on the same day (idx 0 and 2 both → day 0). They have Infinity crossover
    // (GROUP_1_MANDATORY pair), so round-robin produces an avoidable conflict.
    //
    // Constraint-scored processes the most-constrained events first and assigns
    // MEN_JUNIOR to day 1 (lowest penalty against day 0 which already has MEN_CADET).
    const config = makeConfig({ days_available: 2 })
    const comps = [
      makeCompetition({ id: 'men-cadet', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.CADET }),
      makeCompetition({ id: 'women-div1', weapon: Weapon.FOIL, gender: Gender.WOMEN, category: Category.DIV1 }),
      makeCompetition({ id: 'men-junior', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.JUNIOR }),
      makeCompetition({ id: 'women-junior', weapon: Weapon.FOIL, gender: Gender.WOMEN, category: Category.JUNIOR }),
    ]
    const result = preliminaryDayAssign(comps, config)

    // Constraint-scored separates the Infinity-crossover pair (MEN_CADET + MEN_JUNIOR)
    expect(result.get('men-cadet')).not.toBe(result.get('men-junior'))
  })
})

// ──────────────────────────────────────────────
// calculateOptimalRefs
// ──────────────────────────────────────────────

describe('calculateOptimalRefs', () => {
  it('returns one entry per day in config', () => {
    const config = makeConfig({ days_available: 2 })
    const foilComp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 20, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([foilComp], config)
    expect(result).toHaveLength(2)
    expect(result[0].day).toBe(0)
    expect(result[1].day).toBe(1)
  })

  it('all results have source=OPTIMAL', () => {
    const config = makeConfig({ days_available: 1 })
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 10, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([comp], config)
    expect(result.every(r => r.source === 'OPTIMAL')).toBe(true)
  })

  it('foil competition assigned to day 0 → foil_epee demand = 6 on day 0', () => {
    const config = makeConfig({ days_available: 1 })
    // 20-fencer foil comp (AUTO policy): 3 pools × 2 refs = 6 pool demand.
    // DE: bracket=32, 4 R16 strips + 1 pod captain = 5. Peak = max(6, 5) = 6.
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 20, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([comp], config)
    expect(result[0].foil_epee_refs).toBe(6)
    expect(result[0].three_weapon_refs).toBe(0)
  })

  it('saber competition → saber demand = 6, foil_epee demand = 0', () => {
    const config = makeConfig({ days_available: 1 })
    // 20-fencer saber comp (AUTO policy): 3 pools × 2 refs = 6 pool demand.
    // DE: bracket=32, 4 R16 strips + 1 pod captain = 5. Peak = max(6, 5) = 6.
    const comp = makeCompetition({ id: 'saber-1', weapon: Weapon.SABRE, fencer_count: 20, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([comp], config)
    expect(result[0].three_weapon_refs).toBe(6)
    expect(result[0].foil_epee_refs).toBe(0)
  })

  it('3 foil + 3 epee competitions on day 0 → summed foil_epee demand = 36', () => {
    // Single-day config so all comps land on day 0
    const config = makeConfig({ days_available: 1 })
    // Each 18-fencer comp (AUTO policy): 3 pools × 2 refs = 6 pool demand.
    // DE: bracket=32, 4 R16 strips + 1 captain = 5. Peak per comp = max(6, 5) = 6.
    // Sum across 6 foil/epee comps = 36.
    const comps = [
      makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 18 }),
      makeCompetition({ id: 'foil-2', weapon: Weapon.FOIL, fencer_count: 18 }),
      makeCompetition({ id: 'foil-3', weapon: Weapon.FOIL, fencer_count: 18 }),
      makeCompetition({ id: 'epee-1', weapon: Weapon.EPEE, fencer_count: 18 }),
      makeCompetition({ id: 'epee-2', weapon: Weapon.EPEE, fencer_count: 18 }),
      makeCompetition({ id: 'epee-3', weapon: Weapon.EPEE, fencer_count: 18 }),
    ]
    const result = calculateOptimalRefs(comps, config)
    expect(result[0].foil_epee_refs).toBe(36)
    expect(result[0].three_weapon_refs).toBe(0)
  })

  it('2 saber competitions on day 0 → summed saber demand = 12', () => {
    const config = makeConfig({ days_available: 1 })
    // Each 18-fencer saber comp (AUTO policy): 3 pools × 2 refs = 6 pool demand.
    // DE: bracket=32, 4 R16 strips + 1 captain = 5. Peak = max(6, 5) = 6. Sum = 12.
    const comps = [
      makeCompetition({ id: 'saber-1', weapon: Weapon.SABRE, fencer_count: 18 }),
      makeCompetition({ id: 'saber-2', weapon: Weapon.SABRE, fencer_count: 18 }),
    ]
    const result = calculateOptimalRefs(comps, config)
    expect(result[0].three_weapon_refs).toBe(12)
    expect(result[0].foil_epee_refs).toBe(0)
  })

  it('no competitions → zero demand on all days', () => {
    const config = makeConfig({ days_available: 2 })
    const result = calculateOptimalRefs([], config)
    expect(result[0].foil_epee_refs).toBe(0)
    expect(result[0].three_weapon_refs).toBe(0)
    expect(result[1].foil_epee_refs).toBe(0)
    expect(result[1].three_weapon_refs).toBe(0)
  })

  it('known small config: 1 foil comp, 3 pools → pool demand drives foil_epee_refs with AUTO policy', () => {
    const config = makeConfig({ days_available: 1 })
    // 18 fencers (AUTO policy) → 3 pools × 2 refs = 6 pool demand
    // DE: bracket=32, de_round_of_16_strips=4, AUTO pod captains → ceil(4/4)=1 captain + 4 strip refs = 5
    // Peak = max(6, 5) = 6
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 18, strips_allocated: 3 })
    const result = calculateOptimalRefs([comp], config)
    // Pool phase is now the bottleneck with AUTO policy (6 > 5)
    expect(result[0].foil_epee_refs).toBe(6)
  })

  it('TWO policy yields higher ref count than ONE policy for same competition', () => {
    // With ONE policy: n_pools × 1 refs. With TWO policy: n_pools × 2 refs.
    // 18 fencers → 3 pools. ONE = 3, TWO = 6. Peak = max(pool, DE).
    const config = makeConfig({ days_available: 1 })
    const compONE = makeCompetition({ id: 'foil-one', weapon: Weapon.FOIL, fencer_count: 18, ref_policy: RefPolicy.ONE })
    const compTWO = makeCompetition({ id: 'foil-two', weapon: Weapon.FOIL, fencer_count: 18, ref_policy: RefPolicy.TWO })

    const resultONE = calculateOptimalRefs([compONE], config)
    const resultTWO = calculateOptimalRefs([compTWO], config)

    expect(resultTWO[0].foil_epee_refs).toBeGreaterThan(resultONE[0].foil_epee_refs)
  })

  it('AUTO policy yields same ref count as TWO policy for small pool count', () => {
    // AUTO tries 2 refs per pool first, identical to TWO for the peak estimate
    const config = makeConfig({ days_available: 1 })
    const compAUTO = makeCompetition({ id: 'foil-auto', weapon: Weapon.FOIL, fencer_count: 18, ref_policy: RefPolicy.AUTO })
    const compTWO = makeCompetition({ id: 'foil-two', weapon: Weapon.FOIL, fencer_count: 18, ref_policy: RefPolicy.TWO })

    const resultAUTO = calculateOptimalRefs([compAUTO], config)
    const resultTWO = calculateOptimalRefs([compTWO], config)

    expect(resultAUTO[0].foil_epee_refs).toBe(resultTWO[0].foil_epee_refs)
  })

  it('known small config: 1 foil comp with no DE strips → pool demand drives foil_epee_refs', () => {
    const config = makeConfig({ days_available: 1 })
    // 18 fencers (AUTO policy) → 3 pools × 2 refs = 6 pool demand
    // DE: de_round_of_16_strips=0, de_finals_strips=0 → 0 DE demand
    // Peak = max(6, 0) = 6
    const comp = makeCompetition({
      id: 'foil-1',
      weapon: Weapon.FOIL,
      fencer_count: 18,
      strips_allocated: 3,
      de_round_of_16_strips: 0,
      de_finals_strips: 0,
    })
    const result = calculateOptimalRefs([comp], config)
    // Pool phase is the bottleneck with AUTO policy: 3 pools × 2 = 6 refs
    expect(result[0].foil_epee_refs).toBe(6)
  })
})
