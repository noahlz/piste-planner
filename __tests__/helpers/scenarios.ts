/**
 * B1–B8 scenario fixtures — real USA Fencing tournament event schedules, with
 * fencer counts rounded to the nearest 10 (B8 excepted, which uses actuals).
 *
 * Shared by `integration.test.ts` (constraint assertions) and
 * `driftLedger.test.ts` (behavior-drift snapshots). Both must measure the same
 * tournament, so the fixtures and the two builders below live in exactly one
 * place. This file is not a test file — it holds no `describe`/`it`, because
 * importing a module that registers tests would re-register them in the
 * importing suite.
 */
import {
  EventType, DeMode, VideoPolicy, CutMode,
} from '../../src/engine/types.ts'
import type { Competition, TournamentType } from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
} from '../../src/engine/constants.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import { makeStrips, makeConfig, makeCompetition } from './factories.ts'

/**
 * The scenario list, in ledger order. This is the single source: `ScenarioId` is
 * derived from it and `SCENARIOS` is keyed by it, so adding a B9 here is a type
 * error until the fixture exists, and the drift ledger picks it up automatically.
 */
export const SCENARIO_IDS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8'] as const

export type ScenarioId = (typeof SCENARIO_IDS)[number]

export type ScenarioFixture = {
  label: string
  source: string
  fencerCounts: Record<string, number>
  days: number
  strips: number
  videoStrips: number
  tournamentType: TournamentType
}

export function buildCompetitions(fencerCounts: Record<string, number>): Competition[] {
  return Object.entries(fencerCounts).map(([id, fencerCount]) => {
    const entry = findCompetition(id)
    if (!entry) throw new Error(`Catalogue entry not found: ${id}`)

    const isTeam = entry.event_type === EventType.TEAM
    const cut = isTeam
      ? { mode: CutMode.DISABLED, value: 100 }
      : DEFAULT_CUT_BY_CATEGORY[entry.category]
    const videoPolicy = DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category]

    return makeCompetition({
      id: entry.id,
      gender: entry.gender,
      category: entry.category,
      weapon: entry.weapon,
      event_type: entry.event_type,
      vet_age_group: entry.vet_age_group,
      fencer_count: fencerCount,
      cut_mode: cut.mode,
      cut_value: cut.value,
      de_video_policy: videoPolicy,
      de_mode: (!isTeam && videoPolicy === VideoPolicy.REQUIRED)
        ? DeMode.STAGED
        : DeMode.SINGLE_STAGE,
      strips_allocated: Math.max(2, Math.ceil(fencerCount / 7)),
    })
  })
}

export function tournamentConfig(
  days: number, strips: number, videoStrips: number,
  tournamentType: TournamentType,
) {
  return makeConfig({
    days_available: days,
    strips: makeStrips(strips, videoStrips),
    tournament_type: tournamentType,
  })
}

export const SCENARIOS: Record<ScenarioId, ScenarioFixture> = {
  B1: {
    label: 'B1: Feb 2026 NAC — Div1/Junior/Veteran (4 days, 24 events)',
    source: 'https://fencingtimelive.com/tournaments/eventSchedule/CEEB23D736774CA6AA20D0988372A7D6',
    fencerCounts: {
      'D1-M-EPEE-IND': 310, 'D1-M-FOIL-IND': 260, 'D1-M-SABRE-IND': 210,
      'D1-W-EPEE-IND': 220, 'D1-W-FOIL-IND': 130, 'D1-W-SABRE-IND': 180,
      'JR-M-EPEE-IND': 200, 'JR-M-FOIL-IND': 220, 'JR-M-SABRE-IND': 210,
      'JR-W-EPEE-IND': 180, 'JR-W-FOIL-IND': 130, 'JR-W-SABRE-IND': 160,
      'VET-M-EPEE-IND-VCMB': 120, 'VET-M-FOIL-IND-VCMB': 80, 'VET-M-SABRE-IND-VCMB': 40,
      'VET-W-EPEE-IND-VCMB': 80, 'VET-W-FOIL-IND-VCMB': 40, 'VET-W-SABRE-IND-VCMB': 50,
      'VET-M-EPEE-TEAM': 30, 'VET-M-FOIL-TEAM': 10, 'VET-M-SABRE-TEAM': 10,
      'VET-W-EPEE-TEAM': 20, 'VET-W-FOIL-TEAM': 10, 'VET-W-SABRE-TEAM': 10,
    },
    days: 4, strips: 80, videoStrips: 12, tournamentType: 'NAC',
  },
  B2: {
    label: 'B2: Nov 2025 NAC — Div1/Cadet/Y-14 + Cadet Teams (4 days, 24 events)',
    source: 'https://fencingtimelive.com/tournaments/eventSchedule/EE514470341F42279A49312868171FFF',
    fencerCounts: {
      'D1-M-EPEE-IND': 310, 'D1-M-FOIL-IND': 280, 'D1-M-SABRE-IND': 200,
      'D1-W-EPEE-IND': 210, 'D1-W-FOIL-IND': 160, 'D1-W-SABRE-IND': 220,
      'CDT-M-EPEE-IND': 270, 'CDT-M-FOIL-IND': 240, 'CDT-M-SABRE-IND': 310,
      'CDT-W-EPEE-IND': 240, 'CDT-W-FOIL-IND': 220, 'CDT-W-SABRE-IND': 240,
      'Y14-M-EPEE-IND': 200, 'Y14-M-FOIL-IND': 140, 'Y14-M-SABRE-IND': 170,
      'Y14-W-EPEE-IND': 150, 'Y14-W-FOIL-IND': 150, 'Y14-W-SABRE-IND': 160,
      'CDT-M-EPEE-TEAM': 50, 'CDT-M-FOIL-TEAM': 10, 'CDT-M-SABRE-TEAM': 20,
      'CDT-W-EPEE-TEAM': 30, 'CDT-W-FOIL-TEAM': 10, 'CDT-W-SABRE-TEAM': 10,
    },
    days: 4, strips: 80, videoStrips: 12, tournamentType: 'NAC',
  },
  B3: {
    label: 'B3: March 2026 NAC — Y10/Y12/Y14/Div2 (4 days, 24 events)',
    source: 'https://fencingtimelive.com/tournaments/eventSchedule/4E2874CB40914BDCB0286561FA5531D4',
    fencerCounts: {
      'Y14-M-EPEE-IND': 260, 'Y14-M-FOIL-IND': 270, 'Y14-M-SABRE-IND': 280,
      'Y14-W-EPEE-IND': 210, 'Y14-W-FOIL-IND': 240, 'Y14-W-SABRE-IND': 230,
      'Y12-M-EPEE-IND': 210, 'Y12-M-FOIL-IND': 230, 'Y12-M-SABRE-IND': 180,
      'Y12-W-EPEE-IND': 170, 'Y12-W-FOIL-IND': 200, 'Y12-W-SABRE-IND': 170,
      'Y10-M-EPEE-IND': 80, 'Y10-M-FOIL-IND': 110, 'Y10-M-SABRE-IND': 80,
      'Y10-W-EPEE-IND': 60, 'Y10-W-FOIL-IND': 70, 'Y10-W-SABRE-IND': 70,
      'D2-M-EPEE-IND': 180, 'D2-M-FOIL-IND': 170, 'D2-M-SABRE-IND': 160,
      'D2-W-EPEE-IND': 110, 'D2-W-FOIL-IND': 120, 'D2-W-SABRE-IND': 130,
    },
    days: 4, strips: 80, videoStrips: 12, tournamentType: 'NAC',
  },
  B4: {
    label: 'B4: Jan 2026 SYC — Y8/Y10/Y12/Y14/Cadet (3 days, 30 events)',
    source: 'https://fencingtimelive.com/tournaments/eventSchedule/A502062C3346472AAA8C63C3366DC4BE',
    fencerCounts: {
      'Y14-M-EPEE-IND': 190, 'Y14-M-FOIL-IND': 170, 'Y14-M-SABRE-IND': 200,
      'Y14-W-EPEE-IND': 140, 'Y14-W-FOIL-IND': 150, 'Y14-W-SABRE-IND': 170,
      'Y12-M-EPEE-IND': 140, 'Y12-M-FOIL-IND': 150, 'Y12-M-SABRE-IND': 150,
      'Y12-W-EPEE-IND': 120, 'Y12-W-FOIL-IND': 120, 'Y12-W-SABRE-IND': 120,
      'Y10-M-EPEE-IND': 70, 'Y10-M-FOIL-IND': 80, 'Y10-M-SABRE-IND': 80,
      'Y10-W-EPEE-IND': 70, 'Y10-W-FOIL-IND': 60, 'Y10-W-SABRE-IND': 60,
      'Y8-M-EPEE-IND': 20, 'Y8-M-FOIL-IND': 20, 'Y8-M-SABRE-IND': 20,
      'Y8-W-EPEE-IND': 30, 'Y8-W-FOIL-IND': 20, 'Y8-W-SABRE-IND': 10,
      'CDT-M-EPEE-IND': 170, 'CDT-M-FOIL-IND': 100, 'CDT-M-SABRE-IND': 130,
      'CDT-W-EPEE-IND': 110, 'CDT-W-FOIL-IND': 80, 'CDT-W-SABRE-IND': 120,
    },
    days: 3, strips: 40, videoStrips: 12, tournamentType: 'SYC',
  },
  B5: {
    label: 'B5: Jan 2026 SJCC — Cadet/Junior (3 days, 12 events)',
    source: 'https://fencingtimelive.com/tournaments/eventSchedule/EB2CCA52D45B4BB08F66DCC79C0C2063',
    fencerCounts: {
      'JR-M-EPEE-IND': 120, 'JR-M-FOIL-IND': 120, 'JR-M-SABRE-IND': 120,
      'JR-W-EPEE-IND': 80, 'JR-W-FOIL-IND': 70, 'JR-W-SABRE-IND': 110,
      'CDT-M-EPEE-IND': 120, 'CDT-M-FOIL-IND': 80, 'CDT-M-SABRE-IND': 100,
      'CDT-W-EPEE-IND': 80, 'CDT-W-FOIL-IND': 70, 'CDT-W-SABRE-IND': 90,
    },
    days: 3, strips: 60, videoStrips: 12, tournamentType: 'SJCC',
  },
  B6: {
    label: 'B6: Sep 2025 ROC — 9 categories (3 days, 54 events)',
    source: 'https://fencingtimelive.com/tournaments/eventSchedule/C023BCB957844F6BAC9AD10BE8316CAA',
    fencerCounts: {
      'JR-M-EPEE-IND': 120, 'JR-M-FOIL-IND': 90, 'JR-M-SABRE-IND': 120,
      'JR-W-EPEE-IND': 70, 'JR-W-FOIL-IND': 30, 'JR-W-SABRE-IND': 80,
      'CDT-M-EPEE-IND': 110, 'CDT-M-FOIL-IND': 40, 'CDT-M-SABRE-IND': 100,
      'CDT-W-EPEE-IND': 30, 'CDT-W-FOIL-IND': 80, 'CDT-W-SABRE-IND': 80,
      'Y14-M-EPEE-IND': 50, 'Y14-M-FOIL-IND': 100, 'Y14-M-SABRE-IND': 50,
      'Y14-W-EPEE-IND': 70, 'Y14-W-FOIL-IND': 70, 'Y14-W-SABRE-IND': 30,
      'Y12-M-EPEE-IND': 70, 'Y12-M-FOIL-IND': 70, 'Y12-M-SABRE-IND': 70,
      'Y12-W-EPEE-IND': 70, 'Y12-W-FOIL-IND': 30, 'Y12-W-SABRE-IND': 50,
      'Y10-M-EPEE-IND': 20, 'Y10-M-FOIL-IND': 20, 'Y10-M-SABRE-IND': 30,
      'Y10-W-EPEE-IND': 20, 'Y10-W-FOIL-IND': 20, 'Y10-W-SABRE-IND': 20,
      'Y8-M-EPEE-IND': 10, 'Y8-M-FOIL-IND': 10, 'Y8-M-SABRE-IND': 10,
      'Y8-W-EPEE-IND': 10, 'Y8-W-FOIL-IND': 10, 'Y8-W-SABRE-IND': 6,
      'D1A-M-EPEE-IND': 50, 'D1A-M-FOIL-IND': 100, 'D1A-M-SABRE-IND': 50,
      'D1A-W-EPEE-IND': 50, 'D1A-W-FOIL-IND': 60, 'D1A-W-SABRE-IND': 10,
      'D2-M-EPEE-IND': 60, 'D2-M-FOIL-IND': 70, 'D2-M-SABRE-IND': 50,
      'D2-W-EPEE-IND': 60, 'D2-W-FOIL-IND': 20, 'D2-W-SABRE-IND': 30,
      'VET-M-EPEE-IND-VCMB': 40, 'VET-M-FOIL-IND-VCMB': 20, 'VET-M-SABRE-IND-VCMB': 20,
      'VET-W-EPEE-IND-VCMB': 20, 'VET-W-FOIL-IND-VCMB': 10, 'VET-W-SABRE-IND-VCMB': 10,
    },
    days: 3, strips: 48, videoStrips: 12, tournamentType: 'ROC',
  },
  B7: {
    label: 'B7: Oct 2025 NAC — Div1/Junior/Cadet (4 days, 18 events)',
    source: 'https://fencingtimelive.com/tournaments/eventSchedule/3BC857E223F2428ABEB1DA24D7D1DE28',
    fencerCounts: {
      'D1-M-EPEE-IND': 320, 'D1-M-FOIL-IND': 260, 'D1-M-SABRE-IND': 220,
      'D1-W-EPEE-IND': 210, 'D1-W-FOIL-IND': 180, 'D1-W-SABRE-IND': 220,
      'JR-M-EPEE-IND': 320, 'JR-M-FOIL-IND': 300, 'JR-M-SABRE-IND': 300,
      'JR-W-EPEE-IND': 240, 'JR-W-FOIL-IND': 230, 'JR-W-SABRE-IND': 240,
      'CDT-M-EPEE-IND': 230, 'CDT-M-FOIL-IND': 190, 'CDT-M-SABRE-IND': 220,
      'CDT-W-EPEE-IND': 180, 'CDT-W-FOIL-IND': 170, 'CDT-W-SABRE-IND': 180,
    },
    days: 4, strips: 80, videoStrips: 12, tournamentType: 'NAC',
  },
  B8: {
    label: 'B8: April 2026 Div1 NAC + Veteran Champs (4 days, 53 events)',
    source: 'April 2026 Div I National Championship & NAC (4 days). Para events excluded ' +
      'per real-world separation — Para has its own video discipline and is generally run ' +
      'as a parallel track rather than competing for shared strips.',
    fencerCounts: {
      // Friday
      'D1-M-FOIL-IND': 137,
      'VET-M-EPEE-IND-V40': 42, 'VET-M-EPEE-IND-V50': 54, 'VET-M-EPEE-IND-V60': 45,
      'VET-M-EPEE-IND-V70': 35, 'VET-M-EPEE-IND-V80': 10,
      'VET-W-SABRE-IND-V40': 11, 'VET-W-SABRE-IND-V50': 19, 'VET-W-SABRE-IND-V60': 18,
      'VET-W-SABRE-IND-V70': 18, 'VET-W-SABRE-IND-V80': 2,
      'VET-W-FOIL-IND-VCMB': 37,
      'D1-M-SABRE-TEAM': 7,
      'JR-W-FOIL-IND': 126,
      'D1-W-SABRE-IND': 157,
      // Saturday
      'D1-M-SABRE-IND': 139,
      'VET-M-FOIL-IND-V40': 31, 'VET-M-FOIL-IND-V50': 35, 'VET-M-FOIL-IND-V60': 28,
      'VET-M-FOIL-IND-V70': 22, 'VET-M-FOIL-IND-V80': 3,
      'VET-W-FOIL-IND-V40': 16, 'VET-W-FOIL-IND-V50': 25, 'VET-W-FOIL-IND-V60': 21,
      'VET-W-FOIL-IND-V70': 14, 'VET-W-FOIL-IND-V80': 3,
      'VET-M-EPEE-IND-VCMB': 116,
      'D1-M-EPEE-TEAM': 14,
      'D1-M-FOIL-TEAM': 4,
      'JR-W-SABRE-IND': 192,
      'D1-W-EPEE-IND': 151,
      // Sunday
      'D1-W-FOIL-IND': 103,
      'JR-M-EPEE-IND': 266,
      'D1-W-SABRE-TEAM': 7,
      'D1-W-EPEE-TEAM': 11,
      'VET-M-SABRE-IND-V40': 22, 'VET-M-SABRE-IND-V50': 17, 'VET-M-SABRE-IND-V60': 29,
      'VET-M-SABRE-IND-V70': 15, 'VET-M-SABRE-IND-V80': 5,
      'VET-W-EPEE-IND-V40': 28, 'VET-W-EPEE-IND-V50': 35, 'VET-W-EPEE-IND-V60': 32,
      'VET-W-EPEE-IND-V70': 18, 'VET-W-EPEE-IND-V80': 3,
      'JR-M-FOIL-IND': 178,
      'VET-M-FOIL-IND-VCMB': 73,
      'VET-W-SABRE-IND-VCMB': 31,
      // Monday
      'VET-W-EPEE-IND-VCMB': 74,
      'D1-M-EPEE-IND': 218,
      'JR-M-SABRE-IND': 189,
      'JR-W-EPEE-IND': 182,
      'VET-M-SABRE-IND-VCMB': 49,
    },
    days: 4,
    // Venue map shows 18 pods totalling 68 strips: A/B/C (3×4 = 12 video),
    // D and M (2 strips each), and the remaining 13 pods at 4 strips each.
    // The engine assumes a uniform 4-strip DE pod, so the 2-strip pods are
    // approximated by the global strip count (no pod-size variation modelled).
    strips: 68,
    videoStrips: 12, tournamentType: 'NAC',
  },
}
