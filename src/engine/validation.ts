import { BottleneckSeverity, CutMode, DeMode, EventType, RuleKind, ValidationMode, VideoPolicy, Weapon } from './types.ts'
import type { Competition, TournamentConfig, ValidationError } from './types.ts'
import { computePoolStructure, weightedPoolDuration } from './pools.ts'
import { computeBracketSize, calculateDeDuration } from './de.ts'
import { REGIONAL_CUT_OVERRIDES, REGIONAL_CUT_TOURNAMENT_TYPES } from './constants.ts'
import { computeStripCap } from './stripBudget.ts'
import { findIndividualCounterpart } from './crossover.ts'
import { estimateCompetitionStripHours } from './capacity.ts'

function err(field: string, message: string): ValidationError {
  return { field, message, severity: BottleneckSeverity.ERROR }
}

/** Structural finding: leaves nothing to draw, ERROR in both validation modes (research D3). */
function structural(field: string, message: string): ValidationError {
  return { field, message, severity: BottleneckSeverity.ERROR, kind: RuleKind.STRUCTURAL }
}

/** Notice finding: WARN in both modes, never escalates (research D3 correction, 2026-08-29). */
function notice(field: string, message: string): ValidationError {
  return { field, message, severity: BottleneckSeverity.WARN, kind: RuleKind.NOTICE }
}

/** Policy finding: ERROR under binding mode, WARN under advisory, same substance either way. */
function policy(field: string, message: string, mode: ValidationMode): ValidationError {
  return {
    field,
    message,
    severity: mode === ValidationMode.BINDING ? BottleneckSeverity.ERROR : BottleneckSeverity.WARN,
    kind: RuleKind.POLICY,
  }
}

/**
 * Pushes a structural error if the DE duration table has no entry for the given
 * weapon/bracket — an undefined table lookup leaves nothing to draw. Shared by
 * individual and team DE-entry validation.
 */
function checkDeDurationEntry(
  compId: string,
  weapon: Weapon,
  bracketSize: number,
  table: TournamentConfig['de_duration_table'],
  errors: ValidationError[],
): void {
  const deDuration = table[weapon]?.[bracketSize]
  if (deDuration === undefined) {
    errors.push(structural('de_duration_table', `${compId}: no DE duration entry for weapon=${weapon} bracket=${bracketSize}`))
  }
}

/**
 * Computes the worst-case single-day duration for a competition:
 * pool round + admin gap + full DE.
 * Returns a ValidationError if it exceeds DAY_LENGTH_MINS, null otherwise.
 */
export function validateSameDayCompletion(
  competition: Competition,
  config: TournamentConfig,
): ValidationError | null {
  const { fencer_count, weapon, cut_mode, cut_value, event_type, use_single_pool_override } = competition

  const poolStructure = computePoolStructure(fencer_count, use_single_pool_override)
  const poolDuration = weightedPoolDuration(poolStructure, weapon, config.pool_round_duration_table)
  const bracketSize = computeBracketSize(fencer_count, cut_mode, cut_value, event_type)
  const deDuration = calculateDeDuration(weapon, bracketSize, config.de_duration_table) ?? 0
  const total = poolDuration + config.ADMIN_GAP_MINS + deDuration

  if (total > config.DAY_LENGTH_MINS) {
    return err(
      'same_day_completion',
      `Competition ${competition.id} worst-case duration ${total} min exceeds DAY_LENGTH_MINS ${config.DAY_LENGTH_MINS} min (pool=${poolDuration}, admin=${config.ADMIN_GAP_MINS}, DE=${deDuration})`,
    )
  }
  return null
}

// ── Sub-validators ─────────────────────────────────────────────────────────────

function validateStripConfig(config: TournamentConfig, competitions: Competition[], mode: ValidationMode): ValidationError[] {
  const errors: ValidationError[] = []

  if (config.strips_total === 0) {
    errors.push(structural('strips_total', 'strips_total must be > 0'))
  }

  // Flighting group strips exceed strips_total — same resource-capacity class
  // as resource_precondition's strip minimum shortfalls (research D3).
  // Group competitions by their flighting_group_id, sum strips_allocated, check against total
  const flightingGroupStrips = new Map<string, number>()
  for (const comp of competitions) {
    if (comp.flighted && comp.flighting_group_id) {
      const current = flightingGroupStrips.get(comp.flighting_group_id) ?? 0
      flightingGroupStrips.set(comp.flighting_group_id, current + comp.strips_allocated)
    }
  }
  for (const [groupId, totalStrips] of flightingGroupStrips) {
    if (totalStrips > config.strips_total) {
      errors.push(policy('flighting_group', `Flighting group "${groupId}" requires ${totalStrips} strips but strips_total is ${config.strips_total}`, mode))
    }
  }

  return errors
}

function validateRefConfig(_config: TournamentConfig, _competitions: Competition[]): ValidationError[] {
  return []
}

function validateCompetitionFields(config: TournamentConfig, competitions: Competition[], mode: ValidationMode): ValidationError[] {
  const errors: ValidationError[] = []

  const seenIds = new Set<string>()
  for (const comp of competitions) {
    if (seenIds.has(comp.id)) {
      errors.push(structural('competition.id', `Duplicate competition ID: "${comp.id}"`))
    }
    seenIds.add(comp.id)
  }

  for (const comp of competitions) {
    // Fencer count bounds
    if (comp.fencer_count <= 0 || comp.fencer_count < config.MIN_FENCERS) {
      errors.push(structural('fencer_count', `${comp.id}: fencer_count ${comp.fencer_count} is below minimum ${config.MIN_FENCERS}`))
    } else if (comp.fencer_count > config.MAX_FENCERS) {
      errors.push(structural('fencer_count', `${comp.id}: fencer_count ${comp.fencer_count} exceeds maximum ${config.MAX_FENCERS}`))
    }

    // Team events must not use cuts
    if (comp.event_type === EventType.TEAM && comp.cut_mode !== CutMode.DISABLED) {
      errors.push(policy('cut_mode', `${comp.id}: team events must have cut_mode=DISABLED`, mode))
    }

    // Cut value range checks (individual events only)
    if (comp.event_type === EventType.INDIVIDUAL) {
      if (comp.cut_mode === CutMode.PERCENTAGE) {
        if (comp.cut_value <= 0 || comp.cut_value > 100) {
          errors.push(structural('cut_value', `${comp.id}: PERCENTAGE cut_value must be in (0, 100], got ${comp.cut_value}`))
        }
      } else if (comp.cut_mode === CutMode.COUNT) {
        if (comp.cut_value > comp.fencer_count) {
          errors.push(structural('cut_value', `${comp.id}: COUNT cut_value ${comp.cut_value} exceeds fencer_count ${comp.fencer_count}`))
        }
      }

      // Cut must produce at least 2 promoted fencers (skip if fencer count already invalid)
      if (comp.fencer_count >= config.MIN_FENCERS && comp.cut_mode !== CutMode.DISABLED) {
        // computeDeFencerCount returns max(result, 2) so check the raw math:
        // PERCENTAGE: round(count * value / 100); COUNT: min(value, count)
        let rawPromoted: number
        if (comp.cut_mode === CutMode.PERCENTAGE) {
          rawPromoted = Math.round((comp.fencer_count * comp.cut_value) / 100)
        } else {
          rawPromoted = Math.min(comp.cut_value, comp.fencer_count)
        }
        if (rawPromoted < 2) {
          errors.push(structural('cut_value', `${comp.id}: cut produces only ${rawPromoted} promoted fencer(s); minimum is 2`))
        }
      }

      // DE duration table must contain an entry for the computed bracket size
      if (comp.fencer_count >= config.MIN_FENCERS) {
        checkDeDurationEntry(
          comp.id,
          comp.weapon,
          computeBracketSize(comp.fencer_count, comp.cut_mode, comp.cut_value, comp.event_type),
          config.de_duration_table,
          errors,
        )
      }
    }

    // Team events also need a DE duration table entry (teams bypass cuts, bracket = nextPowerOf2(fencer_count))
    if (comp.event_type === EventType.TEAM && comp.fencer_count >= config.MIN_FENCERS) {
      checkDeDurationEntry(
        comp.id,
        comp.weapon,
        computeBracketSize(comp.fencer_count, CutMode.DISABLED, 100, comp.event_type),
        config.de_duration_table,
        errors,
      )
    }

    // Video policy checks
    if (comp.de_video_policy === VideoPolicy.REQUIRED && comp.de_mode === DeMode.SINGLE_STAGE) {
      // REQUIRED + SINGLE_STAGE is dead config: SINGLE_STAGE doesn't use staged video strips.
      // Soft hint, not a gate (research D3 correction).
      errors.push(notice('de_video_policy', `${comp.id}: REQUIRED video policy has no effect with SINGLE_STAGE de_mode`))
    }

    if (
      comp.de_mode === DeMode.STAGED &&
      comp.de_video_policy === VideoPolicy.REQUIRED &&
      config.video_strips_total < comp.de_round_of_16_strips
    ) {
      // Physical resource impossibility for the R16 stage — structural.
      errors.push(structural('de_video_policy', `${comp.id}: REQUIRED video policy needs ${comp.de_round_of_16_strips} video strips for R16 but only ${config.video_strips_total} available`))
    }

    // DE strip requests exceed the computed DE cap. Soft resource-tuning
    // guidance (research D3 correction) because the user may have
    // intentionally overridden.
    const deStripCap = computeStripCap(
      config.strips_total,
      config.max_de_strip_pct,
      comp.max_de_strip_pct_override,
    )
    if (comp.de_round_of_16_strips > deStripCap) {
      errors.push(notice('de_round_of_16_strips', `${comp.id}: R16 requests ${comp.de_round_of_16_strips} strips but DE cap is ${deStripCap}`))
    }

    // Resource precondition checks — skip competitions with invalid fencer counts
    if (comp.fencer_count >= config.MIN_FENCERS) {
      const { n_pools } = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)

      // Strip capacity: n_pools strips needed (one per pool running in parallel).
      // strips_total is a global scalar — no per-day strip availability model yet.
      if (n_pools > config.strips_total) {
        errors.push(policy('resource_precondition', `${comp.id}: requires ${n_pools} strips for pools but only ${config.strips_total} total strips configured`, mode))
      }

    }
  }

  // Regional tournament cut override notices
  // Heads-up when a regional tournament has a competition with custom cuts on
  // an override category. buildConfig applies the override automatically
  // regardless, so this blocks nothing (research D3 correction).
  if (REGIONAL_CUT_TOURNAMENT_TYPES.has(config.tournament_type)) {
    for (const comp of competitions) {
      if (REGIONAL_CUT_OVERRIDES[comp.category] && comp.cut_mode !== CutMode.DISABLED) {
        errors.push(notice(
          'cut_mode',
          `${comp.id}: regional tournament (${config.tournament_type}) requires all-advance for ${comp.category} — cut_mode will be overridden to DISABLED`,
        ))
      }
    }
  }

  return errors
}

function validateTimingConstraints(config: TournamentConfig, competitions: Competition[], mode: ValidationMode): ValidationError[] {
  const errors: ValidationError[] = []

  // Individual + team same-day worst-case duration
  for (const team of competitions) {
    if (team.event_type !== EventType.TEAM) continue
    if (team.fencer_count < config.MIN_FENCERS) continue

    const matchingIndividual = findIndividualCounterpart(team, competitions)
    if (!matchingIndividual) continue
    if (matchingIndividual.fencer_count < config.MIN_FENCERS) continue

    // Compute total durations independently to find the worst-case combined day
    const indivPoolStructure = computePoolStructure(matchingIndividual.fencer_count, matchingIndividual.use_single_pool_override)
    const indivPoolDur = weightedPoolDuration(indivPoolStructure, matchingIndividual.weapon, config.pool_round_duration_table)
    const indivBracket = computeBracketSize(matchingIndividual.fencer_count, matchingIndividual.cut_mode, matchingIndividual.cut_value, matchingIndividual.event_type)
    const indivDeDur = calculateDeDuration(matchingIndividual.weapon, indivBracket, config.de_duration_table) ?? 0
    const indivTotal = indivPoolDur + config.ADMIN_GAP_MINS + indivDeDur

    const teamPoolStructure = computePoolStructure(team.fencer_count, team.use_single_pool_override)
    const teamPoolDur = weightedPoolDuration(teamPoolStructure, team.weapon, config.pool_round_duration_table)
    const teamBracket = computeBracketSize(team.fencer_count, team.cut_mode, team.cut_value, team.event_type)
    const teamDeDur = calculateDeDuration(team.weapon, teamBracket, config.de_duration_table) ?? 0
    const teamTotal = teamPoolDur + config.ADMIN_GAP_MINS + teamDeDur

    const combinedTotal = indivTotal + config.INDIV_TEAM_MIN_GAP_MINS + teamTotal
    if (combinedTotal > config.DAY_LENGTH_MINS) {
      errors.push(policy('indiv_team_same_day', `Individual ${matchingIndividual.id} + team ${team.id} worst-case same-day duration ${combinedTotal} min exceeds DAY_LENGTH_MINS ${config.DAY_LENGTH_MINS} min`, mode))
    }
  }

  return errors
}

function validateDependencies(config: TournamentConfig, competitions: Competition[], mode: ValidationMode): ValidationError[] {
  const errors: ValidationError[] = []

  // Team events require a matching individual
  const individualKeys = new Set(
    competitions
      .filter(c => c.event_type === EventType.INDIVIDUAL)
      .map(c => `${c.category}|${c.gender}|${c.weapon}`),
  )
  for (const comp of competitions) {
    if (comp.event_type === EventType.TEAM) {
      const key = `${comp.category}|${comp.gender}|${comp.weapon}`
      if (!individualKeys.has(key)) {
        errors.push(policy('event_type', `${comp.id}: team event has no matching individual for ${comp.category} ${comp.gender} ${comp.weapon}`, mode))
      }
    }
  }

  // Same population: N individual events for same category+gender+weapon
  // Veteran events include vet_age_group in the key because each age group is a distinct population.
  const populationCounts = new Map<string, number>()
  for (const comp of competitions) {
    if (comp.event_type === EventType.INDIVIDUAL) {
      const key = comp.vet_age_group !== null
        ? `${comp.category}|${comp.gender}|${comp.weapon}|${comp.vet_age_group}`
        : `${comp.category}|${comp.gender}|${comp.weapon}`
      populationCounts.set(key, (populationCounts.get(key) ?? 0) + 1)
    }
  }
  for (const [key, count] of populationCounts) {
    if (count > config.days_available) {
      errors.push(policy('same_population', `Same-population group [${key}] has ${count} individual events but only ${config.days_available} days available`, mode))
    }
  }

  return errors
}

/**
 * Up-front feasibility check: total estimated strip-hours vs. tournament
 * capacity. Catches *obviously* insufficient configs (e.g. 1 day for an
 * 18-event NAC) before the scheduler spends effort. Real-world tournaments
 * routinely sit within ~15% of the estimator's worst-case demand because
 * scheduling slack and day-window padding overlap with the per-event
 * estimate; we tolerate that band rather than false-fail.
 *
 * Runs in O(events). Skips silently when capacity inputs are zero or
 * negative — those cases are caught by validateStripConfig with their own
 * targeted messages.
 */
const FEASIBILITY_SLACK = 1.15

/**
 * Feasibility finding: kind is always 'policy' (research D3 — grouped with
 * resource shortfalls), but severity stays ERROR regardless of mode. This
 * function's own 2-arg contract is unchanged by the T017 mode split —
 * `validateConfig` re-derives mode-driven severity when it assembles these
 * findings into its pipeline (see below).
 */
function feasibilityErr(field: string, message: string): ValidationError {
  return { field, message, severity: BottleneckSeverity.ERROR, kind: RuleKind.POLICY }
}

export function validateFeasibility(
  config: TournamentConfig,
  competitions: Competition[],
): ValidationError[] {
  const errors: ValidationError[] = []
  if (competitions.length === 0) return errors
  if (config.strips_total <= 0 || config.days_available <= 0) return errors
  if (config.DAY_LENGTH_MINS <= 0) return errors

  let totalNeeded = 0
  let videoNeeded = 0
  for (const c of competitions) {
    if (c.fencer_count < config.MIN_FENCERS || c.fencer_count > config.MAX_FENCERS) continue
    const e = estimateCompetitionStripHours(c, config)
    totalNeeded += e.total_strip_hours
    videoNeeded += e.video_strip_hours
  }

  const dayLengthHours = config.DAY_LENGTH_MINS / 60
  const totalAvailable = config.days_available * config.strips_total * dayLengthHours

  if (totalNeeded > totalAvailable * FEASIBILITY_SLACK) {
    const shortfall = totalNeeded - totalAvailable
    const pct = Math.round((shortfall / totalAvailable) * 100)
    const perExtraDay = config.strips_total * dayLengthHours
    const perExtraStrip = config.days_available * dayLengthHours
    const extraDays = Math.ceil(shortfall / perExtraDay)
    const extraStrips = Math.ceil(shortfall / perExtraStrip)
    errors.push(feasibilityErr(
      'feasibility',
      `RESOURCE_INSUFFICIENT: ${Math.round(totalNeeded)} strip-hours needed over ${competitions.length} events; ` +
      `${Math.round(totalAvailable)} available (${config.days_available}d × ${config.strips_total}s × ${dayLengthHours}h). ` +
      `Shortfall ${Math.round(shortfall)} (~${pct}%). Add ${extraDays} more day(s) OR ${extraStrips} more strip(s).`,
    ))
  }

  // Video shortfall is meaningful only when any video work is required.
  if (videoNeeded > 0) {
    const videoAvailable = config.days_available * config.video_strips_total * dayLengthHours
    if (videoNeeded > videoAvailable * FEASIBILITY_SLACK) {
      const shortfall = videoNeeded - videoAvailable
      const perExtraDay = config.video_strips_total * dayLengthHours
      const perExtraStrip = config.days_available * dayLengthHours
      const extraDays = perExtraDay > 0 ? Math.ceil(shortfall / perExtraDay) : Number.POSITIVE_INFINITY
      const extraStrips = Math.ceil(shortfall / perExtraStrip)
      const dayHint = Number.isFinite(extraDays) ? `${extraDays} more day(s)` : 'add video strips first'
      errors.push(feasibilityErr(
        'feasibility_video',
        `RESOURCE_INSUFFICIENT (video): ${Math.round(videoNeeded)} video strip-hours needed; ` +
        `${Math.round(videoAvailable)} available (${config.days_available}d × ${config.video_strips_total}vs × ${dayLengthHours}h). ` +
        `Shortfall ${Math.round(shortfall)}. ${dayHint} OR ${extraStrips} more video strip(s).`,
      ))
    }
  }

  return errors
}

/**
 * Validates tournament configuration and competition list before scheduling.
 * Returns an array of ValidationErrors; empty array means valid.
 * Checks all conditions per METHODOLOGY.md §Phase 1: Validation.
 *
 * `mode` computes severity from each rule's `kind` (research D3): structural
 * findings are ERROR in both modes, policy findings are ERROR under `binding`
 * and WARN under `advisory`, and notice findings are WARN in both modes and
 * never escalate. The rule catalogue itself — which fields fire, with what
 * message — is identical across modes; only severity differs.
 */
export function validateConfig(
  config: TournamentConfig,
  competitions: Competition[],
  mode: ValidationMode,
): ValidationError[] {
  const globalErrors: ValidationError[] = []

  if (config.days_available < 1 || config.days_available > 14) {
    globalErrors.push(structural('days_available', `days_available must be 1–14, got ${config.days_available}`))
  } else if (config.days_available < 2 || config.days_available > 4) {
    globalErrors.push(notice('days_available', `days_available outside the recommended 2–4 day range, got ${config.days_available} — the schedule can still be computed`))
  }

  // Feasibility findings are always ERROR from validateFeasibility itself
  // (its own 2-arg contract), so re-derive severity from mode here — the
  // same policy-kind mapping every other policy finding gets.
  const feasibilityFindings = validateFeasibility(config, competitions).map(finding => ({
    ...finding,
    severity: mode === ValidationMode.BINDING ? BottleneckSeverity.ERROR : BottleneckSeverity.WARN,
  }))

  return [
    ...globalErrors,
    ...validateStripConfig(config, competitions, mode),
    ...validateRefConfig(config, competitions),
    ...validateCompetitionFields(config, competitions, mode),
    ...validateTimingConstraints(config, competitions, mode),
    ...validateDependencies(config, competitions, mode),
    ...feasibilityFindings,
  ]
}
