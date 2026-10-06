import { describe, it, expect } from 'vitest'
import { scheduleAllConcurrent } from '../../src/engine/concurrentScheduler.ts'
import {
  BottleneckCause,
  BottleneckRule,
  BottleneckSeverity,
  Category,
  CutMode,
  DeMode,
  EventType,
  Gender,
  RefPolicy,
  TournamentType,
  VideoPolicy,
  Weapon,
  dayStart,
} from '../../src/engine/types.ts'
import type { Bottleneck, Competition, PinnedPlacement, TournamentConfig } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'
import { checkInvariants } from '../helpers/bottleneckInvariants.ts'

// The regional Group 1 time-of-day window (Ops Manual p.20 – Group 1, METHODOLOGY
// §Regional Types: Soft, With a Time-of-Day Window and §Cross-Event Dependency
// Edges, 024 plan D10): at ROC, RYC and RJCC the older side of a Group 1 pair that
// shares a day may not start its pools before day start + 4 hours.

const WINDOW_MINS = 240

/** A small men's épée event on single-stage DEs, so only the window moves its start. */
function event(id: string, category: Category, overrides: Partial<Competition> = {}): Competition {
  return makeCompetition({
    id,
    category,
    gender: Gender.MEN,
    weapon: Weapon.EPEE,
    fencer_count: 14,
    ref_policy: RefPolicy.ONE,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    de_mode: DeMode.SINGLE_STAGE,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    ...overrides,
  })
}

/** A one-day tournament on ample strips, so strip contention never delays a start. */
function oneDay(tournamentType: TournamentType, overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return makeConfig({
    tournament_type: tournamentType,
    days_available: 1,
    strips: makeStrips(40, 0),
    max_pool_strip_pct: 1.0,
    max_de_strip_pct: 1.0,
    ...overrides,
  })
}

const WINDOW_RULES: readonly string[] = [
  BottleneckRule.REGIONAL_WINDOW_HONOURED,
  BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED,
]

function windowFindings(bottlenecks: Bottleneck[]): Bottleneck[] {
  return bottlenecks.filter(b => WINDOW_RULES.includes(b.rule))
}

/** The one window finding naming exactly this pair; fails the test when there is not one. */
function findingFor(bottlenecks: Bottleneck[], a: string, b: string): Bottleneck {
  const subjects = [a, b].sort().join('|')
  const matches = windowFindings(bottlenecks).filter(f => f.subjects.join('|') === subjects)
  expect(matches, `window findings for ${subjects}`).toHaveLength(1)
  return matches[0]
}

function poolStart(result: ReturnType<typeof scheduleAllConcurrent>, id: string): number | null | undefined {
  return result.schedule[id]?.pool_start
}

describe('regional Group 1 window – the older side waits for day start + 4 hours', () => {
  it('starts the older side of a Y12–Y14 pair at exactly day start + 240, the younger at day start, with an INFO', () => {
    const config = oneDay(TournamentType.ROC)
    const ds = dayStart(0, config)
    const result = scheduleAllConcurrent([event('y12', Category.Y12), event('y14', Category.Y14)], config)

    expect(poolStart(result, 'y14')).toBe(ds + WINDOW_MINS)
    expect(poolStart(result, 'y12')).toBe(ds)
    const finding = findingFor(result.bottlenecks, 'y12', 'y14')
    expect(finding.rule).toBe(BottleneckRule.REGIONAL_WINDOW_HONOURED)
    expect(finding.severity).toBe(BottleneckSeverity.INFO)
    expect(finding.competition_id).toBe('y14')
  })

  it('applies the floor at ROC, RYC and RJCC and at no national type, where no window finding fires', () => {
    // The pair shares the one day at every type: at NAC, SYC and SJCC the
    // least-bad colouring breaks the hard Group 1 edge to place both.
    const types = [
      { type: TournamentType.NAC, offset: 0 },
      { type: TournamentType.SYC, offset: 0 },
      { type: TournamentType.SJCC, offset: 0 },
      { type: TournamentType.ROC, offset: WINDOW_MINS },
      { type: TournamentType.RYC, offset: WINDOW_MINS },
      { type: TournamentType.RJCC, offset: WINDOW_MINS },
    ]
    for (const { type, offset } of types) {
      const config = oneDay(type)
      const result = scheduleAllConcurrent([event('y12', Category.Y12), event('y14', Category.Y14)], config)

      expect(poolStart(result, 'y14'), `${type} Y14 pool start`).toBe(dayStart(0, config) + offset)
      expect(windowFindings(result.bottlenecks).length > 0, `${type} window finding`).toBe(offset > 0)
    }
  })

  it('on a Y10/Y12/Y14 day honours the Y10–Y12 window (INFO) and not the Y12–Y14 one (WARN): windows do not stack', () => {
    const config = oneDay(TournamentType.ROC)
    const ds = dayStart(0, config)
    const competitions = [event('y10', Category.Y10), event('y12', Category.Y12), event('y14', Category.Y14)]
    const result = scheduleAllConcurrent(competitions, config)

    expect(poolStart(result, 'y10')).toBe(ds)
    expect(poolStart(result, 'y12')).toBe(ds + WINDOW_MINS)
    expect(poolStart(result, 'y14')).toBe(ds + WINDOW_MINS)

    const honoured = findingFor(result.bottlenecks, 'y10', 'y12')
    expect(honoured.rule).toBe(BottleneckRule.REGIONAL_WINDOW_HONOURED)
    expect(honoured.severity).toBe(BottleneckSeverity.INFO)
    const broken = findingFor(result.bottlenecks, 'y12', 'y14')
    expect(broken.rule).toBe(BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED)
    expect(broken.severity).toBe(BottleneckSeverity.WARN)

    const ids = competitions.map(c => c.id)
    for (const b of windowFindings(result.bottlenecks)) {
      expect(b.cause).toBe(BottleneckCause.SEQUENCING_CONSTRAINT)
      checkInvariants(b, ids, new Set())
    }
  })

  it('pairs a Cadet individual with the Div 1 team, the team being the older side', () => {
    // The team needs its Div 1 individual (validation), which is itself the
    // older side of a Div 1–Cadet pair. The team also waits on that
    // individual's end + 120, so the finding is what names the team's pair.
    const config = oneDay(TournamentType.ROC)
    const ds = dayStart(0, config)
    const competitions = [
      event('cdt', Category.CADET),
      event('d1', Category.DIV1),
      event('d1-team', Category.DIV1, { event_type: EventType.TEAM, fencer_count: 8 }),
    ]
    const result = scheduleAllConcurrent(competitions, config)

    expect(poolStart(result, 'cdt')).toBe(ds)
    expect(poolStart(result, 'd1')).toBe(ds + WINDOW_MINS)
    expect(poolStart(result, 'd1-team')).toBeGreaterThanOrEqual(ds + WINDOW_MINS)
    const finding = findingFor(result.bottlenecks, 'cdt', 'd1-team')
    expect(finding.rule).toBe(BottleneckRule.REGIONAL_WINDOW_HONOURED)
    expect(finding.competition_id).toBe('d1-team')
  })

  it('leaves a pin inside the window where it is and reports the window as not honoured (WARN)', () => {
    const config = oneDay(TournamentType.ROC)
    const ds = dayStart(0, config)
    const pin: PinnedPlacement = { competition_id: 'y14', day: 0, start_time: ds + 60, strip_count: 2 }
    const result = scheduleAllConcurrent([event('y12', Category.Y12), event('y14', Category.Y14)], config, [pin])

    expect(poolStart(result, 'y14')).toBe(ds + 60)
    const finding = findingFor(result.bottlenecks, 'y12', 'y14')
    expect(finding.rule).toBe(BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED)
    expect(finding.severity).toBe(BottleneckSeverity.WARN)
  })

  it('restarts a retried older side at the floor, never at day start', () => {
    // 40 fencers on 9 strips, pools capped at 3 strips and DEs at 2: the event
    // spans 630 minutes from its start. From day start it fits the 780-minute
    // hard window (the control); from day start + 240 it cannot, so attempt 1
    // fails and the retry must not fall back to day start.
    const config = oneDay(TournamentType.ROC, {
      strips: makeStrips(9, 0),
      max_pool_strip_pct: 0.35,
      max_de_strip_pct: 0.25,
    })
    const long = event('y14', Category.Y14, { fencer_count: 40 })

    const control = scheduleAllConcurrent([long], config)
    expect(poolStart(control, 'y14')).toBe(dayStart(0, config))

    const result = scheduleAllConcurrent([event('y12', Category.Y12), long], config)
    const retried = result.bottlenecks.filter(
      b => b.competition_id === 'y14' && b.rule === BottleneckRule.FIRST_ATTEMPT_FAILED,
    )
    expect(retried).toHaveLength(1)
    expect(result.schedule['y14']).toBeUndefined()
    expect(windowFindings(result.bottlenecks)).toEqual([])
  })
})
