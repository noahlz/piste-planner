import { BottleneckCause, BottleneckSeverity, CutMode, VideoPolicy, DeMode } from './types.ts'
import type { AnalysisResult, Bottleneck, Competition, TournamentConfig } from './types.ts'
import { computePoolStructure, computeDeFencerCount } from './pools.ts'
import { computeBracketSize } from './de.ts'
import { suggestFlightingGroups } from './flighting.ts'
import { REGIONAL_QUALIFIER_TYPES } from './constants.ts'

/**
 * Returns true when the tournament is a regional qualifier (RYC, RJCC, ROC, SYC, SJCC).
 * Tournament type lives on the config, not on individual competitions.
 */
export function isRegionalQualifier(config: TournamentConfig): boolean {
  return REGIONAL_QUALIFIER_TYPES.has(config.tournament_type)
}

/**
 * Returns the maximum allowable pool count difference between men's and women's
 * events sharing the same age/weapon group (PRD Section 9.1).
 *
 * Threshold is based on the LARGER pool count of the two events:
 *   ≤3 pools → 0  (must be equal)
 *   4–7      → 1
 *   8–11     → 2
 *   12+      → 3
 */
export function genderEquityAllowableDiff(largerPools: number): number {
  if (largerPools <= 3) return 0
  if (largerPools <= 7) return 1
  if (largerPools <= 11) return 2
  return 3
}

/**
 * Performs pre-scheduling analysis across all 7 passes defined in PRD Section 9.1.
 * Pure function — no global state, identical output for identical input.
 *
 * @param config         Tournament-wide configuration (strips, video count, tournament type, etc.)
 * @param competitions   All competitions to be scheduled
 * @param dayAssignments Map of competition id → estimated day number (0-indexed)
 */
export function initialAnalysis(
  config: TournamentConfig,
  competitions: Competition[],
  dayAssignments: Record<string, number>,
): AnalysisResult {
  const warnings: Bottleneck[] = []
  const suggestions: string[] = []

  // ── Pass 1: strip deficit → flighting suggestions ────────────────────────
  for (const comp of competitions) {
    const ps = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
    if (ps.n_pools > config.strips_total) {
      if (!comp.flighted) {
        warnings.push({
          competition_id: comp.id,
          phase: 'POOLS',
          cause: BottleneckCause.STRIP_DEFICIT_NO_FLIGHTING,
          severity: BottleneckSeverity.WARN,
          delay_mins: 0,
          message: `${comp.id}: ${ps.n_pools} pools but only ${config.strips_total} strips available; flighting not enabled`,
        })
      }
      // Suggest splitting into two flights regardless of current flighting state
      const poolsPerFlight = Math.ceil(ps.n_pools / 2)
      suggestions.push(
        `${comp.id}: consider flighting (${poolsPerFlight} pools per flight) — ${ps.n_pools} pools exceeds ${config.strips_total} strips`,
      )
    }
  }

  // ── Pass 2: flighting group suggestions ──────────────────────────────────
  const flightingSuggestions = suggestFlightingGroups(competitions, config.strips_total, dayAssignments)
  for (const b of flightingSuggestions.bottlenecks) {
    warnings.push(b)
  }
  for (const group of flightingSuggestions.suggestions) {
    suggestions.push(
      `Flighting group suggested: ${group.priority_competition_id} (priority, ${group.strips_for_priority} strips) + ${group.flighted_competition_id} (flighted, ${group.strips_for_flighted} strips)`,
    )
  }

  // ── Pass 3: validate only one flighted competition per day ────────────────
  // Group competitions by their estimated day, then look for days with >1 flighted.
  const flightedByDay = new Map<number, Competition[]>()
  for (const comp of competitions) {
    if (!comp.flighted) continue
    const day = dayAssignments[comp.id]
    if (day === undefined) continue
    const list = flightedByDay.get(day) ?? []
    list.push(comp)
    flightedByDay.set(day, list)
  }
  for (const [day, flighted] of flightedByDay) {
    if (flighted.length > 1) {
      // Emit one warning per flighted competition on the over-subscribed day
      for (const comp of flighted) {
        warnings.push({
          competition_id: comp.id,
          phase: 'FLIGHTING',
          cause: BottleneckCause.MULTIPLE_FLIGHTED_SAME_DAY,
          severity: BottleneckSeverity.WARN,
          delay_mins: 0,
          message: `Multiple flighted competitions on day ${day}: ${flighted.map((c: Competition) => c.id).join(', ')}`,
        })
      }
    }
  }

  // ── Pass 4: video strip peak demand ──────────────────────────────────────
  // Count STAGED_DE_BLOCKS + REQUIRED competitions per day as peak concurrent video demand.
  // Each such competition needs video strips during its DE phase.
  const videoDemandByDay = new Map<number, number>()
  for (const comp of competitions) {
    if (comp.de_mode === DeMode.STAGED_DE_BLOCKS && comp.de_video_policy === VideoPolicy.REQUIRED) {
      const day = dayAssignments[comp.id]
      if (day === undefined) continue
      videoDemandByDay.set(day, (videoDemandByDay.get(day) ?? 0) + 1)
    }
  }
  for (const [day, demand] of videoDemandByDay) {
    if (demand > config.video_strips_total) {
      warnings.push({
        // Use empty string for competition_id — this is a venue-level warning, not per-competition
        competition_id: '',
        phase: 'DE',
        cause: BottleneckCause.VIDEO_STRIP_CONTENTION,
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `Day ${day}: peak video-required DE demand is ${demand} but only ${config.video_strips_total} video strips available`,
      })
    }
  }

  // ── Pass 5: flighting group video conflict ────────────────────────────────
  // If both competitions in a flighting group require video, warn about combined demand.
  for (const group of flightingSuggestions.suggestions) {
    const pri = competitions.find((c: Competition) => c.id === group.priority_competition_id)
    const flt = competitions.find((c: Competition) => c.id === group.flighted_competition_id)
    if (!pri || !flt) continue
    if (
      pri.de_video_policy === VideoPolicy.REQUIRED &&
      flt.de_video_policy === VideoPolicy.REQUIRED
    ) {
      warnings.push({
        competition_id: group.flighted_competition_id,
        phase: 'DE',
        cause: BottleneckCause.VIDEO_STRIP_CONTENTION,
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `Flighting group (${group.priority_competition_id}, ${group.flighted_competition_id}): both competitions require video strips`,
      })
    }
  }

  // ── Pass 6: cut summary (informational) ──────────────────────────────────
  for (const comp of competitions) {
    if (comp.cut_mode === CutMode.DISABLED) continue
    const promoted = computeDeFencerCount(comp.fencer_count, comp.cut_mode, comp.cut_value, comp.event_type)
    const bracket = computeBracketSize(comp.fencer_count, comp.cut_mode, comp.cut_value, comp.event_type)
    warnings.push({
      competition_id: comp.id,
      phase: 'CUT',
      cause: BottleneckCause.CUT_SUMMARY,
      severity: BottleneckSeverity.INFO,
      delay_mins: 0,
      message: `${comp.id}: cut summary — ${comp.fencer_count} entered, ${promoted} promoted, bracket of ${bracket}`,
    })
  }

  // ── Pass 7: gender equity validation ────────────────────────────────────
  // Compare men's vs women's events in the same (category, weapon) group
  // Build lookup: key = `${category}:${weapon}` → { men?, women? }
  type GenderPair = { men?: Competition; women?: Competition }
  const byGroup = new Map<string, GenderPair>()
  for (const comp of competitions) {
    const key = `${comp.category}:${comp.weapon}`
    const pair = byGroup.get(key) ?? {}
    if (comp.gender === 'MEN') pair.men = comp
    else if (comp.gender === 'WOMEN') pair.women = comp
    byGroup.set(key, pair)
  }

  for (const [, pair] of byGroup) {
    const { men, women } = pair
    if (!men || !women) continue

    const mPools = computePoolStructure(men.fencer_count, men.use_single_pool_override).n_pools
    const wPools = computePoolStructure(women.fencer_count, women.use_single_pool_override).n_pools
    const largerPools = Math.max(mPools, wPools)
    const poolDiff = Math.abs(mPools - wPools)
    const allowed = genderEquityAllowableDiff(largerPools)

    if (poolDiff > allowed) {
      warnings.push({
        competition_id: men.id,
        phase: 'ENTRY',
        cause: BottleneckCause.GENDER_EQUITY_CAP_VIOLATION,
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `${men.id} vs ${women.id}: pool count difference is ${poolDiff}, max allowed is ${allowed} for ${largerPools}-pool larger event`,
      })
    }
  }

  return { warnings, suggestions }
}
