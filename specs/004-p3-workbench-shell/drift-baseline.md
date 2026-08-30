# B1–B8 drift baseline

This is the pre-change comparison target for the US4 drift gate (T062).
`scheduleAll` output for scenarios B1–B8 does not change between task T002
(this capture) and the start of US4 — only US4 (research D5, D6) is permitted
to move engine output (`tasks.md` Phase 6 note, constitution III). T062 re-runs
the harness below after D5/D6 land and diffs the result against this table.

- **Commit SHA captured against**: `f9a74ca58d949ee63988b806a71c774bd2180ecd`
  (branch `004-p3-workbench-shell`'s merge-base with `main`, identical to
  `main` HEAD at capture time — no source file differs from `main` at this
  SHA).
- **Date**: 2026-08-29.

## Harness

Scratch file, run once and deleted (not a repo artifact — this table is):

```
timeout 180 pnpm --silent vitest run tmp/baseline.capture.test.ts > ./tmp/out.log 2>&1
```

The scratch file drove all eight scenarios through the same pattern
`__tests__/engine/integration.test.ts` and `__tests__/engine/driftLedger.test.ts`
use — `buildCompetitions`/`tournamentConfig` from `__tests__/helpers/scenarios.ts`
into `scheduleAll` (`src/engine/scheduler.ts`) — then computed, per scenario:

- `scheduledCount`: `Object.keys(schedule).length`.
- `peakPool`: for each day in `[0, config.days_available)`, sum
  `peakPoolRefDemand(comp, comp.ref_policy)` (`src/engine/refs.ts`) over every
  competition scheduled that day with `fencer_count > 1`; report the max over
  days. This is the same per-day accumulation `driftLedger.test.ts`'s
  `dayPeakRefDemands` uses, kept as a separate pool-only sum instead of being
  collapsed with `Math.max(poolDemand, deDemand)` per competition, since this
  table needs the pool and DE figures independently.
- `peakDe`: identical accumulation using `peakDeRefDemand(comp, config)` in
  place of `peakPoolRefDemand`.

To reproduce for T062, recreate a vitest file with this body (see git history
of this file's authoring commit for the exact scratch source if needed), run
it against the post-D5/D6 code, and diff the printed numbers against the table
below. `scheduledCount` must not move on any scenario; a drop halts the task
until the cause is identified and recorded (constitution III).

## Baseline table

| Scenario | Tournament type | Scheduled events | Total competitions | Peak pool ref demand | Peak DE ref demand |
|---|---|---:|---:|---:|---:|
| B1 | NAC  | 24 | 24 | 248 | 24 |
| B2 | NAC  | 24 | 24 | 332 | 28 |
| B3 | NAC  | 24 | 24 | 304 | 24 |
| B4 | SYC  | 0  | 30 | 0   | 0  |
| B5 | SJCC | 12 | 12 | 116 | 16 |
| B6 | ROC  | 44 | 54 | 234 | 64 |
| B7 | NAC  | 18 | 18 | 340 | 20 |
| B8 | NAC  | 52 | 53 | 316 | 64 |

B4 trips the upfront `validateFeasibility` gate before any per-day packing
runs (Ruling 11, `__tests__/engine/driftLedger.test.ts`) — 0 scheduled, 0
peak demand on either arm, by design, not a capture error.

## What research D5 and D6 predict will move

Both are documented in `specs/004-p3-workbench-shell/research.md` and are the
only changes T062 is permitted to see against this table.

- **D5** (`RefPolicy.AUTO` resolving per tournament type — two refs per pool
  at NAC/SJCC/SYC, one everywhere else): only **B6** (ROC) moves. Its refs
  per pool go 2 → 1, so B6's peak pool referee demand should drop
  (roughly halve). B1, B2, B3, B4, B5, B7, and B8 (NAC, SJCC, SYC) are
  unchanged by D5.
- **D6** (`de_mode` defaulting to `AUTO` → resolved to `STAGED` at NAC): **B1,
  B2, B3, B7, and B8** move — the five NAC scenarios. Their DE referee demand
  rises steeply; P1's DE referee correction makes staged-DE figures run
  roughly fourfold higher than single-stage. B4 (SYC), B5 (SJCC), and B6
  (ROC) are unchanged by D6.
- **Scheduled event counts must not move on any scenario.** A drop halts T062
  until the cause is identified and recorded (constitution III). Referee
  demand is reported, not scheduled against — ref-availability gating was
  removed — so D5/D6 are expected to move only the two demand columns above,
  never the scheduled-count column.

### Verification against `src/data/tournaments.ts`

The scenario-to-type mapping above was read directly from `SCENARIOS` in
`src/data/tournaments.ts` (not assumed from research.md): B1, B2, B3, B7, B8
are `NAC`; B4 is `SYC`; B5 is `SJCC`; B6 is `ROC`. This matches research D5's
and D6's stated scenario lists exactly — **no discrepancy found** between the
research predictions and the actual preset data.
