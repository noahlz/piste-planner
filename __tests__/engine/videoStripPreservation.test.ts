/**
 * Video Strip Preservation in the scheduler (021 T8, METHODOLOGY.md §Video
 * Strip Preservation, default 11). On a day that holds a REQUIRED video phase,
 * a pool phase may take video strips only in the start-of-day wave (day start
 * + MORNING_WAVE_WINDOW_MINS, that minute included) or on a single-event day.
 * Elsewhere pools use video strips as overflow, as DE prelims do.
 *
 * The unit cases for the predicate and the strip search are in
 * `resources.test.ts`. These check the scheduler's own day facts – each
 * event's day, pins included – on hand-built boards, and the rule on the
 * ledger scenarios and the four NAC templates.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import {
  BottleneckRule, Category, DeMode, Gender, Phase, VideoPolicy, Weapon, dayStart,
} from '../../src/engine/types.ts'
import type {
  Competition, PinnedPlacement, TournamentConfig,
} from '../../src/engine/types.ts'
import { MORNING_WAVE_WINDOW_MINS } from '../../src/engine/constants.ts'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'

const POOL_PHASES: ReadonlySet<Phase> = new Set([Phase.POOLS, Phase.FLIGHT_A, Phase.FLIGHT_B])

type ScheduleAllResult = ReturnType<typeof scheduleAll>

/** The strip indices a competition's phase holds, ascending. */
function stripsOf(result: ScheduleAllResult, id: string, phase: Phase): number[] {
  const held: number[] = []
  result.strip_allocations.forEach((list, i) => {
    if (list.some(a => a.event_id === id && a.phase === phase)) held.push(i)
  })
  return held
}

// ──────────────────────────────────────────────
// Hand-built boards
// ──────────────────────────────────────────────

describe('the scheduler keeps video strips for the video stage on a video day', () => {
  // One day on the fallback axis (day start 0). Strips 0–3 are video, 4–9 general.
  const config = makeConfig({ strips: makeStrips(10, 4), days_available: 1 })
  const isVideo = (i: number) => config.strips[i].video_capable

  /** A small NAC individual: 12 fencers, 2 pools, a STAGED DE under REQUIRED video. */
  const required = makeCompetition({
    id: 'REQ', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.EPEE,
    fencer_count: 12, de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED,
  })
  const notRequired = { ...required, de_mode: DeMode.SINGLE_STAGE, de_video_policy: VideoPolicy.BEST_EFFORT }

  /** 49 fencers: 7 pools, one more than the 6 general strips, so its pools need a video strip. */
  const wide = (earliestStart: number, overrides: Partial<Competition> = {}) => makeCompetition({
    id: 'WIDE', category: Category.CADET, gender: Gender.WOMEN, weapon: Weapon.SABRE,
    fencer_count: 49, earliest_start: earliestStart, ...overrides,
  })

  const AFTER_WAVE = MORNING_WAVE_WINDOW_MINS + 60

  it('after the wave on a multi-event video day, a pool that needs a video strip is never placed', () => {
    const result = scheduleAll([required, wide(AFTER_WAVE)], config)
    expect(result.schedule.WIDE).toBeUndefined()
    expect(stripsOf(result, 'WIDE', Phase.POOLS)).toEqual([])
  })

  it('a pinned REQUIRED event makes its day a video day', () => {
    const pin: PinnedPlacement = { competition_id: 'REQ', day: 0, start_time: 400, strip_count: 2 }
    const result = scheduleAll([required, wide(AFTER_WAVE)], config, [pin])
    expect(result.schedule.REQ).toBeDefined()
    expect(result.schedule.WIDE).toBeUndefined()
  })

  it.each([
    ['inside the wave on a multi-event video day', [required, wide(60)]],
    ['after the wave on a single-event video day', [
      wide(AFTER_WAVE, { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
    ]],
    ['after the wave on a day with no REQUIRED video phase', [notRequired, wide(AFTER_WAVE)]],
  ])('%s, a pool may overflow onto a video strip (guard)', (_name, competitions) => {
    const result = scheduleAll(competitions, config)
    expect(result.schedule.WIDE).toBeDefined()
    expect(stripsOf(result, 'WIDE', Phase.POOLS).some(isVideo)).toBe(true)
  })

  it('a pinned pool after the wave refuses the video strips the loop refuses, and its phase goes unclaimed', () => {
    const pin: PinnedPlacement = { competition_id: 'WIDE', day: 0, start_time: AFTER_WAVE, strip_count: 7 }
    const result = scheduleAll([required, wide(0)], config, [pin])
    expect(stripsOf(result, 'WIDE', Phase.POOLS)).toEqual([])
    expect(result.bottlenecks.filter(b =>
      b.rule === BottleneckRule.PINNED_PHASE_UNCLAIMED && b.competition_id === 'WIDE' && b.phase === Phase.POOLS,
    )).toHaveLength(1)
  })

  it('a pinned pool inside the wave claims video strips (guard)', () => {
    const pin: PinnedPlacement = { competition_id: 'WIDE', day: 0, start_time: 60, strip_count: 7 }
    const result = scheduleAll([required, wide(0)], config, [pin])
    expect(stripsOf(result, 'WIDE', Phase.POOLS).some(isVideo)).toBe(true)
  })

  // Both flights are pool phases. 98 fencers make 14 pools, 7 per flight, one
  // more than the 6 general strips, so each flight needs a video strip.
  const flighted = (earliestStart: number) => wide(earliestStart, { fencer_count: 98, flighted: true })

  it('after the wave on a multi-event video day, a flighted event whose flights need a video strip is never placed', () => {
    const result = scheduleAll([required, flighted(AFTER_WAVE)], config)
    expect(result.schedule.WIDE).toBeUndefined()
    expect(stripsOf(result, 'WIDE', Phase.FLIGHT_A)).toEqual([])
    expect(stripsOf(result, 'WIDE', Phase.FLIGHT_B)).toEqual([])
  })

  it('after the wave on a day with no REQUIRED video phase, both flights overflow onto video strips (guard)', () => {
    const result = scheduleAll([notRequired, flighted(AFTER_WAVE)], config)
    expect(result.schedule.WIDE).toBeDefined()
    expect(stripsOf(result, 'WIDE', Phase.FLIGHT_A).some(isVideo)).toBe(true)
    expect(stripsOf(result, 'WIDE', Phase.FLIGHT_B).some(isVideo)).toBe(true)
  })

  describe('on a day that starts at 9:00, the wave is measured from 9:00', () => {
    const NINE_AM = 540
    const nineAm = {
      ...config,
      dayConfigs: [{ day_start_time: NINE_AM, day_end_time: NINE_AM + 600, day_hard_end_time: NINE_AM + 780 }],
    }

    it('a pool at day start + 60 overflows onto a video strip (guard)', () => {
      const result = scheduleAll([required, wide(NINE_AM + 60)], nineAm)
      expect(result.schedule.WIDE).toBeDefined()
      expect(stripsOf(result, 'WIDE', Phase.POOLS).some(isVideo)).toBe(true)
    })

    it('a pool at day start + 180 that needs a video strip is never placed', () => {
      const result = scheduleAll([required, wide(NINE_AM + 180)], nineAm)
      expect(result.schedule.WIDE).toBeUndefined()
      expect(stripsOf(result, 'WIDE', Phase.POOLS)).toEqual([])
    })
  })
})

// ──────────────────────────────────────────────
// Ledger scenarios and NAC templates
// ──────────────────────────────────────────────

const NAC_TEMPLATES = ['NAC Youth', 'NAC Cadet/Junior', 'NAC Div1/Junior', 'NAC Vet/Div1/Junior'] as const

/** A NAC template at 4 days on 80 strips with the type's default video strips, as the drift probes load it. */
function templateBoard(name: string): { competitions: Competition[]; config: TournamentConfig } {
  useStore.setState(useStore.getInitialState(), true)
  const store = useStore.getState()
  store.setTournamentType('NAC')
  store.setDays(4)
  store.setStrips(80)
  store.setVideoStrips(null)
  useStore.getState().applyTemplate(name)
  return buildTournamentConfig(useStore.getState())
}

function scenarioBoard(id: (typeof SCENARIO_IDS)[number]): { competitions: Competition[]; config: TournamentConfig } {
  const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
  return {
    competitions: buildCompetitions(fencerCounts, tournamentType),
    config: tournamentConfig(days, strips, videoStrips, tournamentType),
  }
}

/**
 * Every pool phase that starts after the wave on a placed day holding a
 * REQUIRED video phase and more than one event, and still holds a video strip.
 * The day facts come from the placed events, a subset of the scheduler's own
 * (which also count an event that later failed), so a day judged multi-event
 * here is multi-event to the scheduler too.
 */
function midDayPoolsOnVideo(competitions: Competition[], config: TournamentConfig): string[] {
  const result = scheduleAll(competitions, config)
  const byId = new Map(competitions.map(c => [c.id, c]))
  const days = new Map<number, { count: number; required: boolean }>()
  for (const r of Object.values(result.schedule)) {
    const c = byId.get(r.competition_id)
    const day = days.get(r.assigned_day) ?? { count: 0, required: false }
    day.count++
    if (c?.de_mode === DeMode.STAGED && c.de_video_policy === VideoPolicy.REQUIRED) day.required = true
    days.set(r.assigned_day, day)
  }
  const found = new Set<string>()
  result.strip_allocations.forEach((list, i) => {
    if (!config.strips[i].video_capable) return
    for (const a of list) {
      const r = result.schedule[a.event_id]
      if (!r || !POOL_PHASES.has(a.phase)) continue
      const day = days.get(r.assigned_day)
      const offset = a.start_time - dayStart(r.assigned_day, config)
      if (day?.required && day.count > 1 && offset > MORNING_WAVE_WINDOW_MINS) {
        found.add(`${a.event_id}/${a.phase} at day start + ${offset}`)
      }
    }
  })
  return [...found]
}

describe('no pool starting after the wave holds a video strip on a multi-event video day', () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState(), true)
  })

  it.each(SCENARIO_IDS)('%s', id => {
    const { competitions, config } = scenarioBoard(id)
    expect(midDayPoolsOnVideo(competitions, config)).toEqual([])
  })

  it.each(NAC_TEMPLATES)('template %s at NAC, 4 days', name => {
    const { competitions, config } = templateBoard(name)
    expect(midDayPoolsOnVideo(competitions, config)).toEqual([])
  })
})
