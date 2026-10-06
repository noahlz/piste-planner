import { Weapon, CutMode, EventType, Category, VetAgeGroup, DeMode, VideoPolicy } from './types.ts'
import type { Competition, DeBlocks, DeBoutTimes, DeRound, TournamentConfig } from './types.ts'
import { computeDeFencerCount } from './pools.ts'
import { VIDEO_STAGE_ROUND, VIDEO_STAGE_ROUND_FALLBACK, VIDEO_BLOCK_STRIP_ASK } from './constants.ts'

/**
 * Returns the smallest power of 2 that is ≥ n.
 * Uses bit manipulation: for n > 1, right-shifts to find the highest bit,
 * then left-shifts back — rounding up if n is not already a power of 2.
 */
export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1
  // Check if already a power of 2
  if ((n & (n - 1)) === 0) return n
  // Find next power of 2 via bit length
  return 1 << Math.ceil(Math.log2(n))
}

/**
 * Computes the DE bracket size for a competition.
 * Applies pool-round cuts via computeDeFencerCount, then rounds up to next power of 2.
 */
export function computeBracketSize(
  fencerCount: number,
  cutMode: CutMode,
  cutValue: number,
  eventType: EventType,
): number {
  const promoted = computeDeFencerCount(fencerCount, cutMode, cutValue, eventType)
  return nextPowerOf2(promoted)
}

/**
 * Strips a single-stage DE or prelims block asks for: `min(bracketSize / 2,
 * defaultFootprint)` (METHODOLOGY.md §DE Modes). Asking for bracketSize/2
 * uncapped would let one event's DE claim 64+ strips and serialize against
 * every other event sharing the day. A bracket with no counted round – a
 * bracket of 2 – asks none (METHODOLOGY.md §DE Duration 'No counted round';
 * 024 plan D5), keyed to its rounds rather than to the ask.
 *
 * `defaultFootprint` is `config.DEFAULT_DE_STRIP_FOOTPRINT` — required rather
 * than defaulted to the constant, so no caller can silently keep reading module
 * state past the organizer's override.
 */
export function deStripFootprint(bracketSize: number, defaultFootprint: number): number {
  if (deRounds(bracketSize).length === 0) return 0
  return Math.max(1, Math.min(Math.floor(bracketSize / 2), defaultFootprint))
}

/**
 * Minutes per DE bout (METHODOLOGY.md §DE Duration – Bout time, Appendix A
 * §Timing Constants; Ops Manual 2026-27 p.17).
 *
 * - every team event: the team match time
 * - Y8, Y10 and the VETERAN category, or any event with a vet age group: the
 *   10-touch time. The vet arm keys off either field, so a VETERAN event with
 *   no age group and a Vet Combined event both qualify.
 * - every other individual event: the 15-touch time
 *
 * `boutTimes` carries the three tables, so callers can thread them off the
 * config rather than module state.
 */
export function perBoutDuration(
  weapon: Weapon,
  category: Category,
  vet_age_group: VetAgeGroup | null,
  eventType: EventType,
  boutTimes: DeBoutTimes,
): number {
  if (eventType === EventType.TEAM) return boutTimes.TEAM_MATCH_DURATION[weapon]
  const isTenTouch =
    category === Category.Y8 ||
    category === Category.Y10 ||
    category === Category.VETERAN ||
    vet_age_group !== null
  return isTenTouch ? boutTimes.DE_BOUT_DURATION_10_TOUCH[weapon] : boutTimes.DE_BOUT_DURATION[weapon]
}

/**
 * The counted DE rounds for `promoted` fencers, largest first, from the first
 * bracket round through the semis (METHODOLOGY.md §Bracket Sizing, §DE Duration).
 *
 * Byes are not bouts, so the first round has `promoted − bracket/2` bouts and
 * every later round is full. The gold bout is not counted (the tail estimate
 * covers it), so a bracket of 2 has no counted round.
 *
 * Bounded: the round size halves every pass.
 */
export function deRounds(promoted: number): DeRound[] {
  const bracketSize = nextPowerOf2(promoted)
  const rounds: DeRound[] = []
  for (let round = bracketSize; round >= 4; round /= 2) {
    const bouts = round === bracketSize ? promoted - bracketSize / 2 : round / 2
    rounds.push({ round, bouts })
  }
  return rounds
}

/**
 * Minutes to run `rounds` back to back on `strips` strips (METHODOLOGY.md
 * §DE Duration): each round takes `ceil(bouts / strips)` waves of one bout
 * time. No gap sits between rounds – the changeover is inside the bout time.
 * A grant of 0 strips counts as 1. The result is not snapped – only start
 * times snap to the slot.
 */
export function deRoundsMinutes(rounds: readonly DeRound[], strips: number, boutMinutes: number): number {
  const effectiveStrips = Math.max(strips, 1)
  return rounds.reduce((sum, { bouts }) => sum + Math.ceil(bouts / effectiveStrips) * boutMinutes, 0)
}

/**
 * Splits a staged DE at its video-stage round (METHODOLOGY.md §DE Phase
 * Breakdown): prelims are the rounds above it, the video block runs from it
 * through the semis. A bracket at or below the video round has no prelims.
 */
export function splitAtVideoStage(
  rounds: readonly DeRound[],
  videoRound: number,
): { prelims: DeRound[]; video: DeRound[] } {
  return {
    prelims: rounds.filter((r) => r.round > videoRound),
    video: rounds.filter((r) => r.round <= videoRound),
  }
}

/**
 * The DE round at which an individual event's video stage begins (Ops Manual
 * 2026-27 p.19; METHODOLOGY.md §Video Replay Policy). A VETERAN event keys
 * off its age group, and with none it takes the round-of-8 fallback.
 */
export function videoStageRound(category: Category, vet_age_group: VetAgeGroup | null): number {
  const key = category === Category.VETERAN && vet_age_group !== null
    ? (`${category}:${vet_age_group}` as const)
    : category
  return VIDEO_STAGE_ROUND[key] ?? VIDEO_STAGE_ROUND_FALLBACK
}

/**
 * Video strips one video block asks for: `min(4, bracket/2)` (METHODOLOGY.md
 * §DE Modes, §DE Phase Breakdown), and none for a bracket with no counted
 * round – a bracket of 2 (§DE Duration 'No counted round'; 024 plan D5). The
 * one reading of the video ask.
 */
export function deVideoStripAsk(bracketSize: number): number {
  if (deRounds(bracketSize).length === 0) return 0
  return Math.min(VIDEO_BLOCK_STRIP_ASK, Math.floor(bracketSize / 2))
}

/**
 * Whether an event adds to video demand: a STAGED, REQUIRED individual event.
 * A team event never does, whatever it carries – a team DE has no video stage
 * (024 plan D4; METHODOLOGY.md §DE Modes, §Video Replay Policy, Ops Manual
 * 2026-27 p.19). The one reading of video demand for the day-assignment and
 * initial-analysis counts.
 */
export function demandsVideoStage(competition: Competition): boolean {
  return (
    competition.event_type === EventType.INDIVIDUAL &&
    competition.de_mode === DeMode.STAGED &&
    competition.de_video_policy === VideoPolicy.REQUIRED
  )
}

/**
 * One event's DE as the scheduler places it (METHODOLOGY.md §DE Modes, §DE
 * Duration, §DE Phase Breakdown). A SINGLE_STAGE DE is one general block of
 * every counted round. A STAGED DE splits at its video-stage round into
 * prelims on general strips and a video block that asks `deVideoStripAsk`.
 *
 * The scheduler, `derive.ts`, the capacity estimate and validation all read
 * the split from here, so no two of them can derive a DE differently.
 */
export function deBlocksFor(competition: Competition, config: TournamentConfig): DeBlocks {
  const { fencer_count, cut_mode, cut_value, event_type, category, vet_age_group, weapon } = competition
  const promoted = computeDeFencerCount(fencer_count, cut_mode, cut_value, event_type)
  const bracketSize = nextPowerOf2(promoted)
  const rounds = deRounds(promoted)
  const boutMinutes = perBoutDuration(weapon, category, vet_age_group, event_type, config)
  const generalAsk = deStripFootprint(bracketSize, config.DEFAULT_DE_STRIP_FOOTPRINT)
  const videoAsk = deVideoStripAsk(bracketSize)

  let general: DeRound[] = rounds
  let video: DeRound[] = []
  if (competition.de_mode === DeMode.STAGED) {
    const split = splitAtVideoStage(rounds, videoStageRound(category, vet_age_group))
    general = split.prelims
    video = split.video
  }

  return {
    bracketSize,
    boutMinutes,
    general,
    video,
    generalAsk,
    videoAsk,
    baselineMinutes:
      deRoundsMinutes(general, generalAsk, boutMinutes) + deRoundsMinutes(video, videoAsk, boutMinutes),
  }
}
