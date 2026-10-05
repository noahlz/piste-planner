# 015 Ledger convergence – handoff

**Status: delivered 2026-10-05** on branch `015-ledger-convergence-impl`
(worktree `.claude/worktrees/015-ledger-convergence-impl`, cut from `main`
`a5da71a244`), awaiting the user's `merge-with-costs`. Plan:
[`plan.md`](./plan.md).

## What changed

In product terms: nothing a user can see. Nothing under `src/` changed, and the
live smoke matches 014. The drift ledger is the yardstick every engine change is
measured against. It now builds each reference tournament the way the app does.
Before, it measured a configuration the app never runs – and on B4, B5 and B6,
one that the engine's own regional-cut-override rule flags.

In code terms (plan D1–D6):

- `__tests__/helpers/scenarios.ts`: `buildCompetitions(fencerCounts,
  tournamentType)` takes the tournament type. It holds its own `TYPE_RULES`
  table (referee policy and DE mode per type, transcribed from
  `git show 0ab5bd2dc9:specs/004-p3-workbench-shell/data-model.md`). The
  regional cut comes from `REGIONAL_CUT_OVERRIDES` and
  `REGIONAL_CUT_TOURNAMENT_TYPES` in `src/engine/constants.ts`, and
  `latest_end` is `Infinity`. The docblock names the four deliberate copies.
  The 15 call sites in 6 files pass the type.
- New `__tests__/store/factoryParity.test.ts` (D3): field-level parity for B1–B8,
  plus one case per `TournamentType` (review C7). Equality is
  `isDeepStrictEqual` (review C5). `dayConfigs` is allowlisted and its shape is
  checked.
- `driftLedger.test.ts`: refs per pool come from the resolved policy
  (`scenarioRefsPerPool`, uniformity asserted, `AUTO_REFS_PER_POOL` removed –
  D5). The D4 floor rule is amended with the input-correction case, and the
  header says so. Floors are B4 18, B6 40 and B8 53. The B4 pin is 18 with 12
  ERRORs. `SCENARIOS_WITH_DAY_SUMMARY` is `['B4','B6']`, asserted in both
  directions (review C12).
- `appPathParity.test.ts`: `PARITY_EXCEPTIONS` is empty. `LEDGER_SCHEDULED_COUNTS`
  is asserted against a live ledger run. The exception checks are extracted
  (`assertWellFormedException`, `assertPinAgreesWithLedger`) and exercised on
  synthetic cases (10 for well-formedness, 4 pin/ledger combinations), where
  each rejecting case asserts its own message.
- `bottleneckSubjects.test.ts` (D6): `SCENARIOS_WITHOUT_ANALYSIS_WARNINGS =
  ['B5']`.
- `integration.test.ts`: floors B4 18, B6 40 (D4 rule cited), B8 53.
- `stripSearch.test.ts`: B1 `range.floor` 36 to 35, ceiling 135 unchanged,
  docblock re-measured.
- Comment-only: `appPath.test.ts`, `validation.test.ts`, `store.test.ts`,
  `buildConfig.test.ts`, `pinnedScheduling.test.ts`.

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 78 files / 1830 tests, all pass (from 77 / 1794) | `d754066869`, comment-correction commit |
| `tsc -b`, lint | exit 0, exit 0 | same |
| Drift ledger snapshot SHA-256 | `5483c40c1349944b6ac26659406b39bb84fef9091c2e259c7f0e36920520d0b6` to `a4a71e333c7749f46790b88e0dbd4d0a1a929549b4b2359290c193f37d596d19` | re-baseline `de44580073`, unchanged after |
| B1–B8 scheduled | 24 / 24 / 24 / 17 / 12 / 45 / 18 / 52 to 24 / 24 / 24 / 18 / 12 / 40 / 18 / 53, equal to the app path on all eight | `de44580073`, live `LEDGER_SCHEDULED_COUNTS` test |
| Live smoke | **SMOKE PASS** ×2, 0 console errors, dev server from the worktree on `:5187` | `src/` untouched |
| Boot, B1 | 24 schedule rows, footer `19 placed · 5 unplaced · 0 pinned` | smoke, both runs |
| Suggest: ROC Div1A/Vet, NAC Youth, NAC Vet/Div1/Junior, NAC Cadet/Junior | 15 / 66 / 80 / 48, identical to 014 | smoke, both runs |

Every scheduled count, errorCount, strip recommendation and smoke number
matched the plan's tables. The one exception is B8's day-1 peak (Decision 1).
Smoke command:
`SMOKE_BASE=http://localhost:5187/piste-planner/ timeout 240 node scripts/smoke.mjs`,
after `pnpm dev --port 5187 --strictPort`. No locator change.

Per scenario, before to after (from `de44580073`):

| Scenario | Errors | Strip recommendation | Day-summary peaks | Other |
|---|---|---|---|---|
| B1 | 0 | 48 | unchanged | events changed 13 of 24 |
| B2 | 0 | 70 | unchanged | events changed 14 of 24 |
| B3 | 0 | 71 to 68 | unchanged | events changed 24 of 24 |
| B4 | 13 to 12 | 76 | 86 / 182 / 98 to 86 / 156 / 162 | events changed 15 of 21 |
| B5 | 0 | 28 to 32 | unchanged | events changed 12 of 12 |
| B6 | 9 to 14 | 60 to 65 | 170 / 220 / 194 to 92 / 107 / 95 | refRecommendation `{66, 2}` to `{33, 1}`, events changed 47 of 48 |
| B7 | 0 | 64 | unchanged | byte-identical, events changed 0 of 18 |
| B8 | 1 to 0 | 69 to 51 | day 1 316 to 368 (+52) | events changed 48 of 53 |

Mutation checks (drift audit, scratch worktree): dropping the regional cut turns
`cut_mode` and `cut_value` red at B4, B5 and B6 only. Dropping `de_mode` turns
`de_mode` red at B1, B2, B3, B7 and B8. Dropping `ref_policy` turns `ref_policy`
red on all eight. Setting `latest_end` to 9999 turns `latest_end` red on all
eight. The Task 1 red run reported exactly the predicted scenario × field set,
and the Task 1 blast radius was exactly the plan's 12 tests in 4 files.

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `a5da71a244` (main) | 1794 | – | baseline |
| `de44580073` T1+T2 | 1810 | +16 | factoryParity 8, live `LEDGER_SCHEDULED_COUNTS` 8 |
| `aad6c14eaf` review fix wave | 1830 | +20 | per-type parity 6, exception well-formedness 10, pin/ledger combinations 4 |
| `d754066869` comment corrections | 1830 | 0 | comments only |
| handoff commit | 1830 | 0 | docs only |

No test was deleted without a successor, except the length assertion in
`factoryParity.test.ts` that could not fail (review C8).

## Reviews

- Task 1: an independent red-run re-run and a D3 conformance audit (12 of 12),
  then an independent blast-radius re-run and a factory audit.
- Task 2: an independent snapshot diff against the plan's tables, and an
  independent full verification before the commit. Three low comment issues
  were fixed before the commit.
- Review wave: spec and quality (Opus), `test-quality-reviewer` twice, and a
  drift audit with mutation checks (Opus). The Task 3 smoke ran in parallel.
- Triage: 15 findings confirmed and 8 rejected (they re-opened D4 or D5, were a
  preference, needed `src/`, or duplicated another). Three fix rounds, each
  re-reviewed by `test-quality-reviewer`, and the last had no high finding. Four
  comment notes from the last re-review are fixed in `d754066869`.

## Decisions made on the owner's behalf

Each with what it costs if wrong.

1. B8's day-1 peak rose by 52 (`[316,174,256,148]` to `[368,174,256,148]`) and
   was ruled not a halt. The plan's table gives B8's peaks as "emits none" and
   did not predict a value. B8 does stop writing a `Day N refs:` line, as the
   plan says, and the one newly placed event, `JR-W-EPEE-IND` (182 fencers, 26
   pools × 2 refs) on day 1, accounts for the 52 exactly. Cost if wrong: an unexplained day-1
   referee-demand move on B8 would hide in the new baseline.
2. `stripSearch`'s B1 pins moved (floor 36 to 35, placed at 47 from 20 to 23,
   scan 13 to 14 candidates). A probe that reverted only `de_mode` restored 36
   and 20, so the per-type DE mode is the cause. The plan required no isolation
   for strip counts. Cost: none on behavior.
3. `TYPE_RULES` holds referee policy and DE mode only, not video strips, because
   each scenario fixture supplies its video-strip count and the parity test
   compares every config key. Cost: none found.
4. `factoryParity` grew beyond D3. It uses deep equality instead of string
   comparison (so `310` against `'310'` fails), runs a per-`TournamentType`
   case so the RYC and RJCC rows are checked, and pins the `dayConfigs`
   difference to its shape. Cost: the per-type case rebuilds B1 six more times
   per run.
5. Comment-only fixes in `buildConfig.test.ts`, which the plan's file list does
   not name, replace stale `scenarios.ts:69` citations with a pointer to
   `buildCompetitions`' `strips_allocated` by name. Cost: none.
6. Task 3's live smoke ran in parallel with the review wave instead of after
   it, because nothing under `src/` changed and every review fix was test-only.
   Cost: none, since no fix touched `src/`.
7. The review loop stopped after three fix rounds. The last gap is inherent and
   stated in the helper's docblock: the real per-scenario consistency call in
   `appPathParity.test.ts` cannot be proven wired while all eight scenarios
   agree. Cost: a regression that unwires or mis-wires that one call passes
   until the next parity gap opens.
8. The live `LEDGER_SCHEDULED_COUNTS` test repeats `driftLedger`'s `runScenario`
   calls inline instead of sharing a helper (triage rejected the helper as
   preference). Cost: a change to `driftLedger`'s `runScenario` is not followed
   automatically.

## Left unfixed

- **RYC is missing from `REGIONAL_CUT_TOURNAMENT_TYPES`** (owner ruling
  2026-10-05, assigned to 024). No B1–B8 scenario is an RYC, so no ledger
  number moves.
- **B6 places 40 of 54.** This is existing product behavior that 015 makes
  visible in the ledger.
- **`src/store/buildConfig.ts:233` cites `scenarios.ts:69`**, which is now
  stale (the plan said `:232`). It stays because `src/` is out of scope.
  `strips_allocated` sits at a different line in the factory.
- **The shared regional-cut tables' exact membership is unpinned.** Plan D1
  accepts it, `constants.test.ts` pins only the present rows, and 024 changes
  the set.
- **`assertWellFormedException` trims `closedBy` but not `cause` or `evidence`**,
  and of the placeholder words only `'TBD'` has a rejecting row. The code moved
  verbatim from the pre-015 test.
- **`pinnedScheduling` case 5's pinned run places 23 of 24.**
  `VET-W-FOIL-IND-VCMB` is unscheduled with an ERROR (both attempts failed at
  `DE_ROUND_OF_16`). A comment records it and nothing asserts it.

### For later features

`factoryParity.test.ts` goes red on any store-side change to per-event
derivation. A feature that changes `TYPE_DEFAULTS`, `defaultCutForEntry` or
`buildCompetitions` must change the factory's own copy in the same commit, and
must list `scenarios.ts` and `factoryParity.test.ts` among its editable files.
024 (the cut, video and DE timing tables) and 023 (the team-event DE rule) are
both exposed. A change to the shared engine cut tables moves both paths, and
parity will not catch it.

## Merge

The user merges `015-ledger-convergence-impl` into `main` with
`merge-with-costs`, from the main checkout `/Users/noahlz/projects/piste-planner`.
Never squash, and never merge by hand followed by `commit-with-costs`.

What was checked:

- `main` and `origin/main` are `a5da71a244`, the branch's merge base, so
  `git merge-tree --write-tree main <branch>` equals the branch's own tree. The
  orchestrator re-confirms this after the handoff commit.
- The suite, `tsc -b` and lint at `d754066869` therefore cover the merged tree.
  The handoff commit touches only `docs/` and `specs/`.
- `package.json` and `pnpm-lock.yaml` are untouched. Nothing under `src/`
  changed, so the app is the one 014 shipped.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 015 (the ledger converges with the store) is delivered
and merged into main, and its record is specs/015-ledger-convergence/handoff.md.

Next is roadmap feature 024, the 2026-27 Operations Manual conformance:
docs/design/competition-planner-workbench.md §Roadmap row 024, and
docs/design/backlog.md §"The engine's rules predate the 2026-27 Operations
Manual" and §"Policy tables are stale against USA Fencing 2025-26 changes"
(its "RYC regional cut" and "Y14 at NACs" items). It starts with drafted
METHODOLOGY.md amendments that the owner approves before any code changes. Its
drift is measured against the converged ledger 015 left, and every scenario
moves, so run one drift review per rule group. Where 024 changes per-event
derivation, list __tests__/helpers/scenarios.ts and
__tests__/store/factoryParity.test.ts among its editable files and change the
factory's copy in the same commit.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch. Plan 024 yourself: no Spec Kit, choose the planning approach, and keep
the constitution's guardrails (drift ledger, test-first, live smoke, git
ownership).
```
