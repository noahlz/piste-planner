import { describe, it, expect } from 'vitest'
import { runAppPath } from '../helpers/appPath.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'
import type { ScenarioId } from '../../src/data/tournaments.ts'

/**
 * The app-path parity check (contracts/day-axis.md C5, FR-004): for each of
 * the eight reference tournaments, the app's own route — `applyPreset` →
 * `buildTournamentConfig` → `scheduleAll` — must place the count the drift
 * ledger records for that tournament, unless FR-004a pins a documented
 * per-default exception (research.md D7).
 *
 * Every number below was measured on 2026-08-31 after the axis fix landed
 * (T006/T008, commit b20f351347), not predicted. The classification behind
 * each exception is `specs/006-day-axis-parity/parity-exceptions.md`; the
 * short form lives beside the number here so a reader who only opens this
 * file still learns why it is what it is.
 *
 * **No exception below is attributable to the day axis** (FR-004a's hard
 * limit, SC-002). That was established per row by isolation, not by argument:
 * holding the competitions fixed and swapping only the config — the app's
 * 1440-spaced day windows for the ledger's empty `dayConfigs`, and back —
 * moves no count on any row, while holding the config fixed and swapping the
 * per-competition defaults reproduces the other path's count exactly.
 */

/**
 * The drift ledger's `scheduledCount` per scenario — the target parity is
 * measured against, carried from baseline.md's ledger column and unchanged
 * by this feature (FR-005). Where a pin below differs from its entry here,
 * `PARITY_EXCEPTIONS` must say why.
 */
const LEDGER_SCHEDULED_COUNTS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 0, B5: 12, B6: 44, B7: 18, B8: 52,
}

interface ParityException {
  /** What the app path places today, and what `PINNED_APP_PATH_COUNTS` asserts. */
  appPath: number
  /** What the drift ledger records for the same tournament. */
  ledger: number
  /** The per-competition default that accounts for the whole difference. */
  cause: string
  /** The isolation run that established `cause`, and the source lines it implicates. */
  evidence: string
  /** The feature that closes it, after which this entry is deleted and the pin moves. */
  closedBy: string
}

/**
 * FR-004a exceptions. Admissible only for a per-competition default the two
 * paths have not converged on; a day-axis difference is a contract violation,
 * not an exception (contracts/day-axis.md C5).
 *
 * All three trace to the same seam: `defaultConfigForId`
 * (`src/store/store.ts:217-235`) and `buildConfig.ts`'s `strips_allocated: 0`
 * (`src/store/buildConfig.ts:145`) build a competition differently from the
 * ledger's factory (`__tests__/helpers/scenarios.ts:34-54`). Converging them
 * is 004's US4 (per-type competition defaults), deliberately out of 006's
 * scope (spec.md "Out of Scope").
 */
const PARITY_EXCEPTIONS: Partial<Record<ScenarioId, ParityException>> = {
  /**
   * B4 inverts: the app places 16 where the ledger places 0. The ledger is
   * not "stricter" — its feasibility gate simply sees demand the app's does
   * not. `estimateCompetitionStripHours` computes a SINGLE_STAGE event's DE
   * strip-hours as `strips_allocated × de_duration / 60`
   * (`src/engine/capacity.ts:146`), so `buildConfig.ts:145`'s
   * `strips_allocated: 0` zeroes the DE term for every individual event and
   * the upfront check at `src/engine/validation.ts:405` never fires. The
   * ledger pre-allocates `max(2, ceil(n/7))` strips
   * (`__tests__/helpers/scenarios.ts:54`) and reports
   * `feasibility-strip-hours`: 2161 strip-hours needed against 1680
   * available (3d × 40s × 14h), a ~29% shortfall.
   *
   * The 16 is a real scheduler result — 16 events placed, 14 left unplaced,
   * which is the scheduler reporting the same shortfall the ledger's gate
   * refuses upfront. What the app loses today is the warning, not the
   * schedule. When US4 adopts pre-allocated strips this pin flips to 0.
   */
  B4: {
    appPath: 16,
    ledger: 0,
    cause: 'strips_allocated: 0 zeroes the DE term of the feasibility estimate, so the app never trips the gate the ledger trips',
    evidence: 'adopting the ledger\'s strips_allocated alone, changing nothing else, takes the app path from 16 to 0 — the ledger\'s exact count; no other single default moves it',
    closedBy: '004 US4 (per-type competition defaults) — after which this pin becomes 0',
  },

  /**
   * B6 is one event short of the ledger, and the one event is not a single
   * identifiable event: the two paths place different sets of the same size
   * ±1 (the ledger places D2-W-EPEE-IND, JR-M-EPEE-IND, JR-M-SABRE-IND,
   * JR-W-SABRE-IND and VET-M-EPEE-IND-VCMB that the app does not; the app
   * places D1A-W-FOIL-IND, D2-W-FOIL-IND, Y12-M-EPEE-IND and Y14-W-EPEE-IND
   * that the ledger does not). It is a re-packing at the capacity margin,
   * not a dropped event.
   *
   * Two per-competition defaults each account for it independently:
   *
   * - **cut_mode.** B6 is an ROC. `buildConfig.ts:156-164` applies
   *   `REGIONAL_CUT_OVERRIDES` — all-advance for Y14/Cadet/Junior/Div1 at a
   *   regional event — which the engine's own rule requires
   *   (`src/engine/validation.ts:256-267`). The ledger's factory does not
   *   apply it and cuts at 20%. Here the app is the correct side and the
   *   ledger's 44 is measured on a config the engine flags.
   * - **de_mode.** The ledger derives STAGED from a REQUIRED video policy
   *   (`__tests__/helpers/scenarios.ts:51-53`); the store hardcodes
   *   SINGLE_STAGE (`src/store/store.ts:231`). Here the ledger is the
   *   correct side — this is D7's named staging default.
   *
   * Both change DE bracket sizes and durations, and B6 sits close enough to
   * its strip-hour ceiling that either one is worth an event.
   */
  B6: {
    appPath: 43,
    ledger: 44,
    cause: 'DE bracket sizes differ — the app applies the regional all-advance cut override the ledger\'s factory omits, and the ledger stages DEs the store leaves SINGLE_STAGE',
    evidence: 'either swap alone — the ledger\'s cut_mode/cut_value, or its de_mode — takes the app path from 43 to 44, each reaching a different set of 44; swapping the config instead of the competitions moves nothing',
    closedBy: '004 US4 (per-type competition defaults) — which must converge the regional cut override on the ledger\'s side, a constitution III change to the ledger\'s own recorded behavior',
  },

  /**
   * B8 places nothing, for B2's reason exactly: five `cut-on-team` BINDING
   * errors on the Div1 team events (`src/engine/validation.ts:158`), from
   * the same missing `event_type === TEAM` branch in `defaultConfigForId`
   * (`src/store/store.ts:220,229-230`).
   *
   * The dispatch that opened this task also expected
   * `video-dead-config` ("REQUIRED video policy has no effect with
   * SINGLE_STAGE de_mode") to be gating B2 and B8. It is not: that finding
   * is a `notice` (`src/engine/validation.ts:215`), WARN in both validation
   * modes, and never escalates. Only `cut-on-team` gates.
   *
   * Fixing the team cut alone takes B8 to 53 — one MORE than the ledger's
   * 52, because B8's remaining defaults (staging, pre-allocated strips) then
   * favor the app. So this pin does not simply become 52 when US4 lands; it
   * is re-measured then, like every other number here.
   */
  B8: {
    // 53 is 008's own measurement (T004), matching 006's forcing-run below.
    // The cause/evidence/closedBy prose beneath this line still describes
    // that forcing run, not this feature's code — T009 measures what
    // accounts for the +1 under 008's fix and T010 rewrites this entry with
    // that evidence.
    appPath: 53,
    ledger: 52,
    cause: 'team events reach the engine with a PERCENTAGE cut, which is a BINDING validation ERROR (cut-on-team) — the same default B2 fails on',
    evidence: 'forcing cut_mode=DISABLED on B8\'s five team events alone takes the app path from 0 to 53, one above the ledger\'s 52',
    closedBy: '004 US4 (per-type competition defaults) — the pin is re-measured then, not assumed to be 52',
  },
}

/**
 * What the app path places today, measured (T011), one number per scenario.
 * Five equal their ledger count; three are the FR-004a exceptions above and
 * are gated exactly as the other five are — a different pinned number, never
 * an unasserted one.
 */
const PINNED_APP_PATH_COUNTS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 16, B5: 12, B6: 43, B7: 18, B8: 53,
}

describe('app-path parity with the drift ledger (contracts/day-axis.md C5)', () => {
  it.each(SCENARIO_IDS)('%s places its pinned app-path count', (id) => {
    const exception = PARITY_EXCEPTIONS[id]
    const result = runAppPath(id)
    expect(
      result.placedCount,
      exception
        ? `${id}: app path placed ${result.placedCount}, pinned at ${PINNED_APP_PATH_COUNTS[id]} `
          + `(FR-004a exception — ledger records ${exception.ledger}; ${exception.cause}; closed by ${exception.closedBy})`
        : `${id}: app path placed ${result.placedCount}, ledger scheduledCount is ${LEDGER_SCHEDULED_COUNTS[id]}`,
    ).toBe(PINNED_APP_PATH_COUNTS[id])
  })

  /**
   * The pins and the exception table have to keep agreeing with each other.
   * Without this, a future edit could quietly move a pin off its ledger count
   * with no exception recorded — which is the whole thing FR-004a exists to
   * prevent — or leave a stale exception behind after US4 closes one.
   */
  it.each(SCENARIO_IDS)('%s: pinning off the ledger\'s count requires a recorded FR-004a exception', (id) => {
    const pinned = PINNED_APP_PATH_COUNTS[id]
    const ledger = LEDGER_SCHEDULED_COUNTS[id]
    const exception = PARITY_EXCEPTIONS[id]

    if (pinned === ledger) {
      expect(
        exception,
        `${id}: pinned at the ledger's ${ledger}, so it must carry no FR-004a exception`,
      ).toBeUndefined()
      return
    }

    expect(
      exception,
      `${id}: pinned at ${pinned} against the ledger's ${ledger} with no exception recorded. `
        + 'FR-004a admits a different number only with the ledger\'s count, the cause, and the closing feature beside it.',
    ).toBeDefined()
    expect(exception?.appPath, `${id}: the exception's appPath must be the pinned number`).toBe(pinned)
    expect(exception?.ledger, `${id}: the exception's ledger count must be the ledger's`).toBe(ledger)
    expect(exception?.cause.length, `${id}: the exception must state its cause`).toBeGreaterThan(0)
    expect(exception?.evidence.length, `${id}: the exception must state the isolation run behind its cause`).toBeGreaterThan(0)
    expect(exception?.closedBy, `${id}: the exception must name the feature that closes it`).toContain('004 US4')
  })

  /**
   * research.md D1, second symptom: with all four of B1's day windows
   * coincident on the absolute axis, `findDayForTime` resolves every
   * allocation to day 0, so referee demand collapses onto day one instead of
   * being spread across the tournament's four days. baseline.md measured
   * this exactly: day 0 carries all 134 peak refs, days 1–3 read zero.
   *
   * B1 is the scenario baseline.md measured this on, and it is the boot
   * preset — the tournament this symptom was originally noticed against.
   */
  it('spreads B1\'s referee requirements across its four days, not all onto day one', () => {
    const result = runAppPath('B1')
    const demandOffDayZero = result.refRequirementsByDay
      .filter(d => d.day !== 0)
      .reduce((sum, d) => sum + d.peak_total_refs, 0)

    expect(
      demandOffDayZero,
      `B1 ref_requirements_by_day: ${JSON.stringify(result.refRequirementsByDay)} — ` +
        'expected nonzero peak_total_refs on at least one day other than day 0',
    ).toBeGreaterThan(0)
  })
})
