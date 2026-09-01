# Baseline: Day-Axis Parity (pre-change)

**Feature**: 006-day-axis-parity | **Captured**: 2026-08-31, before any
source file under `src/`, `__tests__/`, or `scripts/` is edited.

`git rev-parse main`: `46404e406b70a447aefb5cbc75f9c4bdd3abb905`
`git rev-parse HEAD`: `46404e406b70a447aefb5cbc75f9c4bdd3abb905`

(HEAD and `main` are the same commit — `006: spec the day-axis parity fix` —
at the time this baseline was captured. No 006 commit has landed yet.)

## B1–B8: app path vs. drift ledger

Two different `TournamentConfig` builds, per
[`docs/design/reassessment-2026-08-31.md` §2](../../docs/design/reassessment-2026-08-31.md):

- **App path**: `applyPreset(id)` → `buildTournamentConfig` →
  `scheduleAll`, the route `src/store/boot.ts` takes. "App-path placed-event
  count" is `Object.keys(store.placements).length` after `runScheduleAll()`
  — i.e. events with a non-null `pool_start`, the same filter
  `src/store/runActions.ts:28` applies.
- **Drift ledger**: the factory path `buildCompetitions` +
  `tournamentConfig` from `__tests__/helpers/scenarios.ts`, the same route
  `__tests__/engine/driftLedger.test.ts` uses. "Drift-ledger `scheduledCount`"
  is `Object.keys(schedule).length` — every competition that received a
  schedule entry, exactly as `driftLedger.test.ts`'s `buildDigest` computes it
  (`__tests__/engine/driftLedger.test.ts:182`).

| Scenario | Selected events | App-path placed | Ledger `scheduledCount` | Gap (ledger − app) |
|---|---:|---:|---:|---:|
| B1 | 24 | 11 | 24 | 13 |
| B2 | 24 | 0 | 24 | 24 |
| B3 | 24 | 9 | 24 | 15 |
| B4 | 30 | 8 | 0 | −8 |
| B5 | 12 | 9 | 12 | 3 |
| B6 | 54 | 19 | 44 | 25 |
| B7 | 18 | 3 | 18 | 15 |
| B8 | 53 | 0 | 52 | 52 |

B1's 11-of-24 matches the reassessment's repro exactly.

**B4 is an outlier worth flagging, not explaining here.** The ledger path
trips the upfront feasibility gate for B4 and schedules 0 (pinned by its own
test in `driftLedger.test.ts`). The app path does not trip that gate and
places 8. The two paths differ in more than the day axis — `de_mode`,
`strips_allocated`, and the `latest_end` sentinel all differ between them
(research.md D6, D7) — so B4's feasibility check evidently sees a different
aggregate demand on each path. This baseline only records the numbers; T012
(FR-004a classification) or the day-axis fix itself must explain whether
B4's gap survives as a pinned exception or closes.

**Answered by T012**: it survives, pinned at 16 against the ledger's 0, traced
to `strips_allocated: 0`. That classification and the other three live in
[`parity-exceptions.md`](./parity-exceptions.md), the post-change record — this
file stays the pre-change one.

## Referee attribution (research.md D1, second symptom)

Measured on B1 (the boot preset) by re-running `scheduleAll` directly over
the app-path `TournamentConfig` (`buildTournamentConfig(store.getState())`)
after `applyPreset('B1')`, and reading the returned `ref_requirements_by_day`
(not persisted by the store today, so read from the `scheduleAll` result
directly rather than through `runActions.ts`):

```json
[
  {"day":0,"peak_total_refs":134,"peak_saber_refs":112,"peak_time":480},
  {"day":1,"peak_total_refs":0,"peak_saber_refs":0,"peak_time":0},
  {"day":2,"peak_total_refs":0,"peak_saber_refs":0,"peak_time":0},
  {"day":3,"peak_total_refs":0,"peak_saber_refs":0,"peak_time":0}
]
```

All 134 peak refs land on day 0; days 1–3 show zero. This confirms
research.md D1's second symptom on the app path: with all four day windows
coincident on the absolute axis, `findDayForTime` (`concurrentScheduler.ts:1227`)
resolves every window's day as day 0 (the first day whose coincident window
contains the time), so referee peaks collapse onto day 1 instead of being
attributed to the day each event is actually assigned to.

## Suite total

```
rm -f tmp/t002-baseline.test.ts   # the scratch measurement file, gitignored, deleted before this run
timeout 200 pnpm --silent test > ./tmp/test.log 2>&1
```

**Test Files: 51 passed (51)**
**Tests: 1221 passed (1221)**

Matches tasks.md's expected 1221 / 51 exactly.

## Commands run to produce every number above

```bash
# git identity
git rev-parse main
git rev-parse HEAD

# app-path placed count, total selected, ledger scheduledCount, and the B1
# ref_requirements_by_day — all measured together in one scratch vitest file,
# tmp/t002-baseline.test.ts (deleted after this run; tmp/ is gitignored):
#
#   for each id in B1..B8:
#     useStore.setState(useStore.getInitialState(), true)   // fresh store
#     applyPreset(id)
#     totalSelected = Object.keys(store.selectedCompetitions).length
#     runScheduleAll()
#     appPlaced = Object.keys(store.placements).length
#
#     competitions = buildCompetitions(fencerCounts)          // ledger factory path
#     config = tournamentConfig(days, strips, videoStrips, tournamentType)
#     { schedule } = scheduleAll(competitions, config)
#     ledgerScheduledCount = Object.keys(schedule).length
#
#   for B1 only:
#     { config, competitions } = buildTournamentConfig(store.getState())
#     result = scheduleAll(competitions, config)
#     print result.ref_requirements_by_day
#
timeout 120 pnpm --silent vitest run tmp/t002-baseline.test.ts > ./tmp/t002-run.log 2>&1

# suite total (after deleting the scratch file above)
rm -f tmp/t002-baseline.test.ts
timeout 200 pnpm --silent test > ./tmp/test.log 2>&1

# confirm no source file was touched to produce this baseline
git diff --stat -- src/ __tests__/ scripts/
```

## Raw output from the measurement run

```
B1 ref_requirements_by_day (app path): [{"day":0,"peak_total_refs":134,"peak_saber_refs":112,"peak_time":480},{"day":1,"peak_total_refs":0,"peak_saber_refs":0,"peak_time":0},{"day":2,"peak_total_refs":0,"peak_saber_refs":0,"peak_time":0},{"day":3,"peak_total_refs":0,"peak_saber_refs":0,"peak_time":0}]
SCENARIO	selected	appPlaced	ledgerScheduledCount
B1	24	11	24
B2	24	0	24
B3	24	9	24
B4	30	8	0
B5	12	9	12
B6	54	19	44
B7	18	3	18
B8	53	0	52
```
