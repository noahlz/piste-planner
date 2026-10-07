# 016 Hand placements obey the rules – handoff

**Status: delivered 2026-10-07** on branch `016-hand-placement-rules`
(worktree `.claude/worktrees/016-hand-placement-rules`, cut from `main`
`b84be7e291`), awaiting the user's `merge-with-costs`. Spec:
[`spec.md`](./spec.md). Plan: [`plan.md`](./plan.md).

## What changed

In product terms: an organizer who drags two events that may never share a day
onto one day now sees a Warning naming both by label, with the marker on both
blocks and no way to dismiss it. At a regional tournament the same pair gets
the Group 1 window finding instead. Day-scoped findings say which day they
belong to, the first and last day warning reaches the Findings panel, and the
footer's referee peak is the same number the scheduler reports. Scheduled
counts, ERRORs and every other ledger field are unmoved. Only the referee
peaks rose, on 13 days plus one sabre peak.

Headline, before to after (Base is `b84be7e291`, After is `9e918de7b9`):

| What | Before | After |
|---|---|---|
| Ledger B1–B8 scheduled | 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53 | unchanged |
| ERRORs | 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0 | unchanged |
| Peak referees, scheduler's own report, 13 days | 210 / 134 / 228 / 136 / 80 / 80 / 78 / 68 / 64 / 156 / 156 / 212 / 136 | 218 / 140 / 244 / 140 / 90 / 104 / 98 / 90 / 112 / 164 / 168 / 236 / 172 |
| Footer peak referees, B1 boot | 218 | 218 |

The days, in the order of the row above, are B1 days 1 and 2, B2 days 0 and 3,
B4 days 1 and 2, B6 days 0 to 2, B7 days 0 and 2, and B8 days 0 and 2.

What each task does now:

- **Spec and amendment (`6a73a30190`, `8e6b8d8e73`, plan `b31b382508`).** The
  owner amended METHODOLOGY §Ref Demand Derivation and Phase 7 before the
  referee change: demand counts the schedule as the workbench draws it.
- **A – findings carry their day (`a006cc751b`, review fix `56e92b4d55`).**
  `Bottleneck` gains an optional 0-based `day`, set by every day-scoped
  producer. The two 0-based day messages print "Day N" 1-based. The late-day
  WARN prints clock times through a new pure `clockOnDay`. Message formats
  that the ledger parses (the `DAY_RESOURCE_SUMMARY` lines) are unchanged.
- **B – the rule check (`1b9e804716`, review fix `30a898bbb2`).**
  `checkPlacementRules` (`src/engine/placementRules.ts`) is a pure function over
  the current placements. It emits one hard-separation Warning per pair whose
  `crossoverPenalty` is infinite, and the regional Group 1 window finding
  (honoured, not honoured) at ROC, RYC and RJCC. Unplaced and out-of-range
  events are skipped. The scheduler's own code and messages are untouched.
- **C – the panel (`a99499b696`, review fixes `de1410fa33`, `5680b3bf48`,
  `f3a5e8cf42`).** The Findings panel appends the rule check and the first and
  last day WARN. The bottleneck row id becomes
  `analysis:<rule>:<competition_id>:<subjects joined by +>:<day or ->`, with no
  ordinal. A venue row with a day reads "Day N". `Finding` gains `dismissable`,
  and the hard-separation row is a Warning that cannot be dismissed (R1),
  enforced when a save is read as well as in `dismissFinding`. Rule-break
  messages name events by label in the app.
- **D – two-event findings (`1d01d4b57e`, review fix `28aed57036`).** A finding
  that names two events marks every block of both, in every phase, and both
  gutter flags and findings edges. `flighting-group-both-video` shows on both
  blocks as a result. Mirrored `multiple-flighted-same-day` warnings list once
  in a tooltip.
- **E – one referee number (`bce5a8ec5e`, review fix `9e918de7b9`).** New pure
  `refDemandFromSchedule` in `src/engine/refs.ts`, and
  `placementFromResult` in `derive.ts` (the conversion `runScheduleAll` already
  did). The store's `buildRefDemandByDay` delegates to it, and the scheduler
  counts `ref_requirements_by_day` through the same path.
  `computePostScheduleRefDemand` and its inert clamp are deleted. This is the
  only task that moved the ledger.
- **S – live smoke (`a721f48cb0`, `3b3cfb6c72`, `8e7583ae49`).** The driver is
  extended in place (below).
- **Docs.** `backlog.md` closes §Hand-placed events and §The scorecard's
  peak-referee row (corrected: the cause was timing, not clamping), marks the
  parts of §Day-level findings 016 fixed, and adds §The canvas draws phases
  without the scheduler's waits and a §What 016 deliberately left unfixed index.
  `competition-planner-workbench.md` marks row 016 delivered, adds row 025 and
  records the new baseline.

Task E's drift, the one ledger move. Peak total referees, old to new, with the
sabre peaks and the scheduler-axis peak time (the exact table is in
`bce5a8ec5e`'s body):

| Scenario / day | Total | Sabre | Peak time |
|---|---|---|---|
| B1 d1 | 210 to 218 | 64 to 68 | 1500 held |
| B1 d2 | 134 to 140 | 56 held | 2940 to 2970 |
| B2 d0 | 228 to 244 | 90 held | 115 held |
| B2 d3 | 136 to 140 | 70 held | 4320 to 4410 |
| B4 d1 | 80 to 90 | 44 held | 1440 to 1525 |
| B4 d2 | 80 to 104 | 54 to 60 | 2935 to 2965 |
| B6 d0 | 78 to 98 | 48 held | 150 to 90 |
| B6 d1 | 68 to 90 | 20 to 24 | 1665 to 1640 |
| B6 d2 | 64 to 112 | 32 to 58 | 3035 to 3030 |
| B7 d0 | 156 to 164 | 64 held | 0 to 90 |
| B7 d2 | 156 to 168 | 70 to 86 | 2880 to 2970 |
| B8 d0 | 212 to 236 | 56 to 66 | 120 held |
| B8 d1 | 146 held | 56 to 64 | 1555 held |
| B8 d2 | 136 to 172 | 48 held | 2880 to 3075 |

B8 day 1 is outside the spec's 13 days, since the spec's table listed totals
only. The owner accepted it (below).

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 82 files / 2278 tests, all pass (from 81 / 2148) | `9e918de7b9`, the last code commit |
| `tsc -b`, lint | clean, clean | every commit in the chain |
| Drift ledger snapshot SHA-256 | `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06` to `cd484a89c7c95f9dc1afebbccf705177487683bde7c1fdd99a674b0afeaff481` | Task E `bce5a8ec5e`, byte-identical through Task D |
| Snapshot change in Task E | 30 changed lines, all `peak_*` fields inside `refRequirementsByDay` | `bce5a8ec5e` |
| B1–B8 scheduled, ERRORs | 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53 and 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0, both unchanged | every commit |
| Engine against store | equal on every B1–B8 day, pinned by a new `appPathParity` case | `bce5a8ec5e` |
| Live smoke | **pass**, two consecutive passes each round plus an independent fresh run | `8e7583ae49` |

Smoke command: `SMOKE_BASE=http://localhost:5187/piste-planner/ timeout 240
node scripts/smoke.mjs`, after `pnpm -C <wt> dev --port 5187 --strictPort`.
What the driver now checks:

1. **NAC.** Moving one event of a Junior/Cadet Foil pair onto the other's day
   shows one Warning naming both by label, with no dismiss control and the
   findings edge on both events.
2. **ROC Mega.** A hand-moved Junior/Cadet Men's Foil pair shows the
   regional-window-not-honoured Warning (Cadet 10:50, Junior 10:55, floor
   13:00).
3. **B1 boot.** The footer's peak referees read 218, unchanged by Task E.

Chain of measurements, oldest first. The snapshot is byte-identical to
`7e2db75c38bb…` until Task E, and the ledger counts never move.

| Step | Commit | Files / tests | Notes |
|---|---|---|---|
| Base | `b84be7e291` (main) | 81 / 2148 | spec baseline |
| A | `a006cc751b` | 81 / 2172 | snapshot unchanged |
| A review fix | `56e92b4d55` | 81 / 2173 | tests only |
| B | `1b9e804716` | 82 / 2205 | snapshot unchanged |
| B review fix | `30a898bbb2` | 82 / 2207 | tests only |
| C | `a99499b696` | 82 / 2233 | snapshot unchanged |
| C review fix | `de1410fa33` | 82 / 2238 | read-side dismissal |
| C review fix (2) | `5680b3bf48` | 82 / 2242 | labels in messages |
| C labels | `f3a5e8cf42` | 82 / 2242 | comment re-wrap |
| D | `1d01d4b57e` | 82 / 2250 | snapshot unchanged |
| D review fix | `28aed57036` | 82 / 2254 | |
| E | `bce5a8ec5e` | 82 / 2274 | snapshot `cd484a89c7c9…`, referee peaks move |
| E review fix | `9e918de7b9` | 82 / 2278 | tests and comments only |
| S | `a721f48cb0`, `3b3cfb6c72`, `8e7583ae49` | 82 / 2278 | smoke driver only |
| handoff commit | – | 82 / 2278 | docs only |

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `b84be7e291` (main) | 2148 | – | baseline |
| `a006cc751b` A | 2172 | +24 | `day` on findings, clock times |
| `56e92b4d55` A review fix | 2173 | +1 | one vacuous sweep removed, `clockOnDay` and Day 3 message cases added |
| `1b9e804716` B | 2205 | +32 | `placementRules.test.ts` (new) |
| `30a898bbb2` B review fix | 2207 | +2 | order, boundary and relaxable cases |
| `a99499b696` C | 2233 | +26 | panel rows, row id, dismissability, first and last day |
| `de1410fa33` C review fix | 2238 | +5 | read-side dismissal, stranded day, window floor |
| `5680b3bf48` C review fix (2) | 2242 | +4 | label cases |
| `f3a5e8cf42` C labels | 2242 | 0 | comment only |
| `1d01d4b57e` D | 2250 | +8 | two-event blocks and flags |
| `28aed57036` D review fix | 2254 | +4 | mirrored warnings, parametrized pair case |
| `bce5a8ec5e` E | 2274 | +20 | `refDemandFromSchedule`, `placementFromResult`, parity |
| `9e918de7b9` E review fix | 2278 | +4 | pinned-event parity on B1, B2, B6, B8 |
| S commits | 2278 | 0 | smoke driver only |
| handoff commit | 2278 | 0 | docs only |

## Reviews

- **A.** `test-quality-reviewer`. The fix commit removed a vacuous sweep (no
  B1–B8 scenario emits a hard-separation finding, so a non-zero day for that
  rule stayed unexercised), added `clockOnDay` rows for a fractional minute, a
  wrap past midnight and a non-default day start, and corrected the commit's
  claim about out-of-list test files.
- **B.** `test-quality-reviewer`. The fix commit pinned the output order's day
  sort key, ran the no-window check at NAC, SYC and SJCC, ran the relaxable
  individual/team row at ROC so it isolates its own rule, and added the window's
  lower boundary (one minute before the floor), checked against a mutant.
- **C.** `test-quality-reviewer` and `react-code-reviewer`. The reviews found
  that a save carrying a hard-separation id could hide that row for good, which
  broke R1 on the read side. They also found rule-break messages naming ids
  where spec §1 says labels. Both were fixed with tests that failed first, and
  the comment was re-wrapped.
- **D.** `test-quality-reviewer` and `react-code-reviewer`. The fix commit
  de-duplicated mirrored warnings in a tooltip, renamed the flagged and warned
  sets to say what they hold, split the gutter and edge assertions into
  single-render tests and pinned `Finding.subjects` for a validation row. Two
  mutants were probed red.
- **E.** Four drift judges, each on at most four scenario-days (the step cap),
  plus `test-quality-reviewer`. Every move was attributed to the drawn-schedule
  cause, and no judge raised an issue. The fix commit documented that the
  comparison is red on 14 days (13 by total plus B8 day 1's sabre), and added a
  parity case that hand-pins four events per scenario and checks the engine
  honours every pin.
- **S.** Two review-fix rounds on the driver. The passes counted are two
  consecutive in each round and one independent fresh run.

## Decisions made on the owner's behalf

### Owner rulings

1. **2026-10-06, spec rulings R1 to R5** (hard break a non-dismissable Warning,
   the store's late-finish row stays the late-day finding, two-event markers on
   both blocks, the regional Note and Warning, the referee number counted from
   the drawn schedule with the canvas gap filed separately).
2. **2026-10-07, asked at the Task E halt.** Accept the sabre and peak-time
   moves on the 13 days and B8 day 1's sabre 56 to 64, since they share the
   totals' cause. Spec §5's table listed totals only.

### Decisions the work made

Each with what it costs if wrong.

1. **Late-day clock times measure from the day's own start.** `clockOnDay`
   subtracts `d × 1440` on the app axis and uses `DAY_START_MINS` on the
   uniform fallback axis (no `dayConfigs`, the ledger). Cost: none in the app.
   `a006cc751b`'s commit body is wrong that both axes give 20:00 and 19:00 for
   4080 and 4020 on day index 2. That holds only on the app axis. On the
   fallback axis day 2 reads 3500 and 3480 as 19:20 and 19:00.
2. **The hard-pair and regional-window checks are independent.** One pair, such
   as a Div 1 individual and a Junior team at a ROC, can raise both, as the
   scheduler's own code would. Cost if wrong: one extra row on such a pair.
3. **Rule-break messages name events by label in the app, not ids.** The plan
   said ids and spec §1 says labels. An optional `labelOf` on
   `checkPlacementRules` (engine default: ids, so the engine stays pure) is
   passed `competitionLabel` by the store (`5680b3bf48`). The scheduler's own
   hard-separation and regional messages still print ids, and its regional
   message still prints scheduler-axis minutes and a lowercase "day N",
   because 016 must not change the scheduler's findings. Cost: the same
   violation reads differently from the engine and the app, though the engine's
   version never reaches the panel.
4. **The bottleneck row id uses the raw `Bottleneck.day` even when out of
   range**, so two stranded day findings (days 4 and 5 after the days are
   reduced) keep distinct ids. The row's day and `where` still fall back
   through a range check. Cost: an id can name a day the board no longer has.
5. **`Finding.subjects` was added in `src/store/derived.ts` by Task D**, outside
   its file list, so the gutter flag and the findings edge mark every event a
   row names. Cost: a field beyond the plan, reviewed with its task.
6. **A non-dismissable row stays visible even when a loaded save carries its
   id as dismissed.** Enforced on the read side too (Task C review). Cost: none.
7. **`refDemandFromSchedule(results, config, competitions)`** takes the plan's
   signature plus `competitions`, for the weapon. A result with no competition
   is skipped. Cost: a third parameter the plan did not list.
8. **`ref_requirements_by_day.peak_time` stays on the scheduler axis.** The
   scheduler shifts the drawn intervals by `day × 1440` in one place, so days
   whose drawn timing matches did not move. Cost if wrong: a reader comparing
   the footer's clock time with this field must convert.
9. **A pinned event is counted from the scheduler's own result in the engine
   and from the organizer's pin in the store.** They agree whenever the engine
   honours the pin, and a test now pins that (Task E review). Cost if wrong: a
   pin the engine overrides would count differently in the two places.
10. **No B1–B8 scenario has a flighted event**, so the store and engine
    flight-rounding difference (odd `refs_needed`) cannot show in the ledger.
    Cost if wrong: an odd flighted event could differ by one referee between
    the footer and the scheduler, unmeasured.
11. **The orchestrator corrected one Task B test fixture.** The Group 1 trio is
    hard in every pair at NAC. Cost: none.

## Left unfixed

Backlog-worthy items are marked with an asterisk.

- **\*The canvas draws phases without the scheduler's waits.** Later phases are
  drawn 25–60+ minutes early on busy days, and the referee peak now inherits
  that optimism by design. Cost if ignored: DE start times and the peak read
  early and high. Backlog §The canvas draws phases without the scheduler's
  waits, roadmap row 025.
- **\*The Vet age-group co-day rule is not checked for hand placements.** Only
  the scheduler's day colouring enforces it (`vetCoDayRequiredColor`). Cost if
  ignored: a hand-split Vet co-day raises nothing. In the backlog under
  §Hand-placed events, tied to §Vet co-day serialization.
- **Phase-repeating scheduler findings** (`phase-deferred` and the like) stay
  out of the panel. Backlog §Day-level findings.
- **\*The regional Note is unreachable by hand in the live app.** No control
  sets an event's start time (Move day keeps the start). The live smoke asserts
  the not-honoured Warning on ROC Mega and the store tests cover the Note.
- **\*An overflowing block never draws the findings edge** (`Block.tsx`,
  `warnedEdge = warned && !overflow`), so on a board with overflow one event of
  a hard pair can show its marker on some phases only. It predates 016, and 017
  (one strip model, no overflow) removes the cause.
- **No fixture puts a scheduler-reported hard-separation violation on a
  non-zero day**, so that producer's `day` is pinned only on day 0.
- **Review focus 5 is vacuous over B1–B8.** None breaks a hard pair, and the
  NAC Cadet/Junior template case (6 broken pairs) carries it.

### For later features

017 through 019 and 023 are measured against the numbers above, so their drift
reviews start from this ledger. The referee peak is now the drawn one, so a
feature that changes how phases are drawn (017's strip model, 025) moves it and
must list the peaks it moves. A change to per-event derivation must also change
the factory's copy (`__tests__/helpers/scenarios.ts`, and
`__tests__/store/factoryParity.test.ts` as 024's handoff says).

## Merge

To be filled by Task M.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 016 (hand placements obey the rules) is delivered and
merged into main, and its record is specs/016-hand-placement-rules/handoff.md.

Next is roadmap feature 017, the canvas tells the truth:
docs/design/competition-planner-workbench.md §Roadmap row 017, and
docs/design/backlog.md §"The canvas calls events unplaced that the engine
placed" and §"A placed block cannot be selected from the keyboard". 017 gives
the engine and the canvas one strip model so B1 boots 24 / 0, and makes blocks
keyboard-operable buttons. It also removes the overflow block that never draws
the findings edge (016's handoff, Left unfixed). Its drift is measured against
the ledger 016 left: B1-B8 scheduled 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53,
ERRORs 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0, snapshot SHA-256
cd484a89c7c95f9dc1afebbccf705177487683bde7c1fdd99a674b0afeaff481, 82 files /
2278 tests. The referee peaks are the drawn ones now, so a change to how phases
are drawn moves them. If a change touches per-event derivation, list
__tests__/helpers/scenarios.ts and __tests__/store/factoryParity.test.ts among
its editable files and change the factory's copy in the same commit.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch (017-...). Plan 017 yourself: no Spec Kit, choose the planning approach,
and keep the constitution's guardrails (drift ledger, test-first, live smoke,
git ownership). The user merges with merge-with-costs and makes the closing
commit with commit-with-costs. Agents commit only inside the worktree, and
never push, merge or make the closing commit.
```
