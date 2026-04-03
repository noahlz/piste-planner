import { describe, it, expect } from 'vitest'
import {
  computePoolStructure,
  poolDurationForSize,
  weightedPoolDuration,
  estimatePoolDuration,
  computeDeFencerCount,
  resolveRefsPerPool,
} from '../../src/engine/pools.ts'
import { Weapon, CutMode, EventType, RefPolicy } from '../../src/engine/types.ts'
import { DEFAULT_POOL_ROUND_DURATION_TABLE } from '../../src/engine/constants.ts'

// ──────────────────────────────────────────────
// computePoolStructure
// ──────────────────────────────────────────────

describe('computePoolStructure', () => {
  it.each([
    { n: 2, expectedPools: 1, expectedSizes: [2] },
    { n: 5, expectedPools: 1, expectedSizes: [5] },
    { n: 6, expectedPools: 1, expectedSizes: [6] },
    { n: 7, expectedPools: 1, expectedSizes: [7] },
    { n: 8, expectedPools: 1, expectedSizes: [8] },
    { n: 9, expectedPools: 1, expectedSizes: [9] },
    { n: 10, expectedPools: 2, expectedSizes: [5, 5] },
    { n: 12, expectedPools: 2, expectedSizes: [6, 6] },
    { n: 13, expectedPools: 2, expectedSizes: [7, 6] },
    { n: 24, expectedPools: 4, expectedSizes: [6, 6, 6, 6] },
  ])('n=$n → $expectedPools pool(s)', ({ n, expectedPools, expectedSizes }) => {
    const result = computePoolStructure(n)
    expect(result.n_pools).toBe(expectedPools)
    expect(result.pool_sizes).toEqual(expectedSizes)
  })

  it('n=100 → 15 pools with 6+7 mix', () => {
    const result = computePoolStructure(100)
    expect(result.n_pools).toBe(15)
    // 100 = 15 pools → pools_of_7 = 100 - 6*15 = 10, pools_of_6 = 5
    const sevens = result.pool_sizes.filter(s => s === 7).length
    const sixes = result.pool_sizes.filter(s => s === 6).length
    expect(sevens).toBe(10)
    expect(sixes).toBe(5)
    expect(result.pool_sizes.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('n=500 → 72 pools (68×7 + 4×6)', () => {
    const result = computePoolStructure(500)
    expect(result.n_pools).toBe(72)
    const sevens = result.pool_sizes.filter(s => s === 7).length
    const sixes = result.pool_sizes.filter(s => s === 6).length
    expect(sevens).toBe(68)
    expect(sixes).toBe(4)
    expect(result.pool_sizes.reduce((a, b) => a + b, 0)).toBe(500)
  })

  it('n=10 with single_pool_override=true → 1 pool of 10', () => {
    const result = computePoolStructure(10, true)
    expect(result.n_pools).toBe(1)
    expect(result.pool_sizes).toEqual([10])
  })

  it('n=10 with override=false → 2×5 (not single pool)', () => {
    const result = computePoolStructure(10, false)
    expect(result.n_pools).toBe(2)
    expect(result.pool_sizes).toEqual([5, 5])
  })

  it('n=11 with override=true → still 1×6+1×5 (override only valid ≤10)', () => {
    // override is ignored for n > 10
    const result = computePoolStructure(11, true)
    expect(result.n_pools).toBe(2)
    expect(result.pool_sizes).toEqual([6, 5])
  })

  it.each([0, 1, -5])('n=%i → throws (fencerCount must be > 1)', (n) => {
    expect(() => computePoolStructure(n)).toThrow(/fencerCount must be > 1/)
  })
})

// ──────────────────────────────────────────────
// poolDurationForSize
// ──────────────────────────────────────────────

describe('poolDurationForSize', () => {
  it.each([
    { weapon: Weapon.EPEE, size: 6, expected: 120 },
    { weapon: Weapon.EPEE, size: 5, expected: 80 },
    { weapon: Weapon.EPEE, size: 7, expected: 168 },
    { weapon: Weapon.FOIL, size: 6, expected: 105 },
    { weapon: Weapon.SABRE, size: 6, expected: 75 },
  ])('$weapon pool size $size → $expected min', ({ weapon, size, expected }) => {
    const result = poolDurationForSize(weapon, size, DEFAULT_POOL_ROUND_DURATION_TABLE)
    expect(result).toBe(expected)
  })
})

// ──────────────────────────────────────────────
// weightedPoolDuration
// ──────────────────────────────────────────────

describe('weightedPoolDuration', () => {
  it('1×7 + 1×6, EPEE → weighted average of 168 and 120 = 144', () => {
    const structure = computePoolStructure(13) // 1×7 + 1×6
    const result = weightedPoolDuration(structure, Weapon.EPEE, DEFAULT_POOL_ROUND_DURATION_TABLE)
    // (168 * 1 + 120 * 1) / 2 = 144
    expect(result).toBe(144)
  })

  it('uniform pool sizes (all 6s) → equals single-size duration', () => {
    const structure = computePoolStructure(24) // 4×6
    const result = weightedPoolDuration(structure, Weapon.EPEE, DEFAULT_POOL_ROUND_DURATION_TABLE)
    expect(result).toBe(120)
  })

  it('n=100 → weighted average of 10×7 and 5×6 pools', () => {
    const structure = computePoolStructure(100) // 10×7 + 5×6
    const result = weightedPoolDuration(structure, Weapon.EPEE, DEFAULT_POOL_ROUND_DURATION_TABLE)
    // (10*168 + 5*120) / 15 = 2280 / 15 = 152
    expect(result).toBe(152)
  })

  it('SABRE 1×7 + 1×6 → weighted average of 105 and 75 = 90', () => {
    const structure = computePoolStructure(13) // 1×7 + 1×6
    const result = weightedPoolDuration(structure, Weapon.SABRE, DEFAULT_POOL_ROUND_DURATION_TABLE)
    // SABRE base=75 for pool of 6. Pool of 7: round(75 * 21/15) = 105
    // (105 + 75) / 2 = 90
    expect(result).toBe(90)
  })

  it('single pool of 8 EPEE → double-stripped, 0.6×', () => {
    const structure = computePoolStructure(8) // 1×8
    const result = weightedPoolDuration(structure, Weapon.EPEE, DEFAULT_POOL_ROUND_DURATION_TABLE)
    // poolDurationForSize(EPEE, 8) = round(120 * 28/15) = 224
    // Single pool of 8+ → 0.6×: round(224 * 0.6) = 134
    expect(result).toBe(134)
  })

  it('single pool of 9 SABRE → double-stripped, 0.6×', () => {
    const structure = computePoolStructure(9) // 1×9
    const result = weightedPoolDuration(structure, Weapon.SABRE, DEFAULT_POOL_ROUND_DURATION_TABLE)
    // poolDurationForSize(SABRE, 9) = round(75 * 36/15) = 180
    // Single pool of 9+ → 0.6×: round(180 * 0.6) = 108
    expect(result).toBe(108)
  })

  it('single pool of 7 is NOT double-stripped', () => {
    const structure = computePoolStructure(7) // 1×7
    const result = weightedPoolDuration(structure, Weapon.EPEE, DEFAULT_POOL_ROUND_DURATION_TABLE)
    // poolDurationForSize(EPEE, 7) = round(120 * 21/15) = 168
    // Pool of 7 → no halving
    expect(result).toBe(168)
  })
})

// ──────────────────────────────────────────────
// estimatePoolDuration
// ──────────────────────────────────────────────

describe('estimatePoolDuration', () => {
  const baseline = 120 // EPEE 6-person pool

  it('4 pools, 4 strips, 4 refs, 1 ref/pool → baseline (no penalty)', () => {
    const result = estimatePoolDuration(4, baseline, 4, 4, 1)
    expect(result.actual_duration).toBe(baseline)
    expect(result.baseline).toBe(baseline)
    expect(result.effective_parallelism).toBe(4)
    expect(result.double_duty_pairs).toBe(0)
    expect(result.uncompensated).toBe(0)
    expect(result.penalised).toBe(false)
  })

  it('4 pools, 2 strips → double-duty compensates with excess refs', () => {
    // 4 refs, 2 strips, refsPerPool=1: staffable=min(2,4,4)=2, excess=4-2=2, dd=min(2,2)=2
    // effective=2+2=4, batches=1
    const result = estimatePoolDuration(4, baseline, 2, 4, 1)
    expect(result.effective_parallelism).toBe(4)
    expect(result.double_duty_pairs).toBe(2)
    expect(result.actual_duration).toBe(baseline)
    expect(result.penalised).toBe(false)
  })

  it('4 pools, 2 strips, 2 refs → strip+ref limited, no double-duty excess', () => {
    // staffable=min(2,4,2)=2, excess=2-2=0, dd=0, effective=2, batches=2
    const result = estimatePoolDuration(4, baseline, 2, 2, 1)
    expect(result.effective_parallelism).toBe(2)
    expect(result.double_duty_pairs).toBe(0)
    expect(result.actual_duration).toBe(baseline * 2)
    expect(result.penalised).toBe(true)
  })

  it('4 pools, 4 strips, 2 refs, 1 ref/pool → ref-limited with no double-duty', () => {
    // staffable=min(4,4,2)=2, excess=2-2=0, dd=0, effective=2
    const result = estimatePoolDuration(4, baseline, 4, 2, 1)
    expect(result.effective_parallelism).toBe(2)
    expect(result.double_duty_pairs).toBe(0)
    expect(result.actual_duration).toBe(baseline * 2)
    expect(result.uncompensated).toBe(2)
    expect(result.penalised).toBe(true)
  })

  it('nPools=0 → zero duration, no penalty (degenerate but valid upstream)', () => {
    const result = estimatePoolDuration(0, baseline, 4, 4, 1)
    expect(result.actual_duration).toBe(0)
    expect(result.effective_parallelism).toBe(0)
    expect(result.penalised).toBe(false)
  })

  it('no double-duty when refsPerPool > 1', () => {
    // 4 pools, 4 strips, 6 refs, refsPerPool=2: staffable=min(4,4,3)=3, dd=0 (rpp!=1)
    const result = estimatePoolDuration(4, baseline, 4, 6, 2)
    expect(result.double_duty_pairs).toBe(0)
    expect(result.effective_parallelism).toBe(3)
    expect(result.penalised).toBe(true)
  })
})

// ──────────────────────────────────────────────
// computeDeFencerCount
// ──────────────────────────────────────────────

describe('computeDeFencerCount', () => {
  it.each([
    // cutValue is % to CUT; 20% cut of 100 → keep 80% → 80 promoted
    { fencerCount: 100, mode: CutMode.PERCENTAGE, value: 20, eventType: EventType.INDIVIDUAL, expected: 80 },
    { fencerCount: 100, mode: CutMode.COUNT, value: 50, eventType: EventType.INDIVIDUAL, expected: 50 },
    { fencerCount: 100, mode: CutMode.DISABLED, value: 0, eventType: EventType.INDIVIDUAL, expected: 100 },
    // 10% cut of 10 → keep 90% → round(9) = 9; max(9, 2) = 9
    { fencerCount: 10, mode: CutMode.PERCENTAGE, value: 10, eventType: EventType.INDIVIDUAL, expected: 9 },
  ])('$fencerCount fencers, $mode $value → $expected', ({ fencerCount, mode, value, eventType, expected }) => {
    const result = computeDeFencerCount(fencerCount, mode, value, eventType)
    expect(result).toBe(expected)
  })

  it.each([CutMode.PERCENTAGE, CutMode.COUNT, CutMode.DISABLED])(
    'TEAM event with cut_mode=%s → fencer_count unchanged',
    (mode) => {
      const result = computeDeFencerCount(8, mode, 20, EventType.TEAM)
      expect(result).toBe(8)
    },
  )

  it.each([0, 1, -3])('fencerCount=%i → throws (must be > 1)', (n) => {
    expect(() => computeDeFencerCount(n, CutMode.DISABLED, 0, EventType.INDIVIDUAL)).toThrow(/fencerCount must be > 1/)
  })

  it('fencerCount=1 TEAM → also throws', () => {
    expect(() => computeDeFencerCount(1, CutMode.DISABLED, 0, EventType.TEAM)).toThrow(/fencerCount must be > 1/)
  })
})

// ──────────────────────────────────────────────
// resolveRefsPerPool
// ──────────────────────────────────────────────

describe('resolveRefsPerPool', () => {
  it('Policy ONE, 4 pools, 4 refs → refs_per_pool=1, no shortfall', () => {
    const result = resolveRefsPerPool(RefPolicy.ONE, 4, 4)
    expect(result.refs_per_pool).toBe(1)
    expect(result.refs_needed).toBe(4)
    expect(result.shortfall).toBe(0)
  })

  it('Policy TWO, 4 pools, 8 refs → refs_per_pool=2, no shortfall', () => {
    const result = resolveRefsPerPool(RefPolicy.TWO, 4, 8)
    expect(result.refs_per_pool).toBe(2)
    expect(result.refs_needed).toBe(8)
    expect(result.shortfall).toBe(0)
  })

  it('Policy TWO, 4 pools, 6 refs → fallback to 1, shortfall>0', () => {
    // wants 8 refs (2 per pool), only 6 available → falls back to 1 ref/pool
    const result = resolveRefsPerPool(RefPolicy.TWO, 4, 6)
    expect(result.refs_per_pool).toBe(1)
    expect(result.shortfall).toBe(2)
  })

  it('Policy AUTO, 4 pools, 8 refs → refs_per_pool=2, no shortfall', () => {
    const result = resolveRefsPerPool(RefPolicy.AUTO, 4, 8)
    expect(result.refs_per_pool).toBe(2)
    expect(result.shortfall).toBe(0)
  })

  it('Policy AUTO, 4 pools, 5 refs → refs_per_pool=1, no shortfall (graceful fallback)', () => {
    // 5 < 8 needed for 2/pool, so falls back to 1/pool; 5 >= 4 needed for 1/pool
    const result = resolveRefsPerPool(RefPolicy.AUTO, 4, 5)
    expect(result.refs_per_pool).toBe(1)
    expect(result.shortfall).toBe(0)
  })

  it('Policy AUTO, 4 pools, 2 refs → refs_per_pool=1, shortfall=2', () => {
    // 2 < 4 needed for 1/pool → shortfall
    const result = resolveRefsPerPool(RefPolicy.AUTO, 4, 2)
    expect(result.refs_per_pool).toBe(1)
    expect(result.refs_needed).toBe(4)
    expect(result.shortfall).toBe(2)
  })
})
