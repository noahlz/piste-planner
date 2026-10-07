# 016 Hand placements obey the rules – spec

**Roadmap:** [`competition-planner-workbench.md` row 016](../../docs/design/competition-planner-workbench.md).
**Backlog:** §Hand-placed events are never checked against the crossover
constraint graph, §The scorecard's peak-referee row reads higher than the
scheduler's own, §Day-level findings have no structured day (its "024's new
findings add two cases for 016" part).
**Branch:** `016-hand-placement-rules`, worktree
`.claude/worktrees/016-hand-placement-rules`, cut from `main` at `b84be7e291`.

## Goal

An organizer cannot build a schedule by hand that breaks USA Fencing's same-day
rules without the app saying so, and the app judges a hand placement by the
same rules the auto-scheduler enforces. The footer's referee peak and the
scheduler's own figure are one number. The engine findings 024 kept out of the
app reach the Findings panel, each tied to its day.

## Baseline (measured 2026-10-06 at `b84be7e291`)

- 81 files / 2148 tests pass. `tsc -b` and lint are clean.
- Drift ledger B1–B8 scheduled 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53, ERRORs
  0 / 0 / 0 / 9 / 0 / 9 / 0 / 0, snapshot SHA-256
  `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06`.

## Owner rulings (2026-10-06)

| # | Question | Ruling |
|---|---|---|
| R1 | A hand placement breaks a hard same-day rule | WARN, shown as a Warning the organizer cannot dismiss. Auto-schedule stays enabled |
| R2 | Late day | The store's late-finish row stays the app's late-day finding. The engine's `day-ends-past-target` is not added to the panel. Its message prints clock times and it carries a structured day |
| R3 | A finding naming two events | Its marker shows on both blocks |
| R4 | Regional Group 1 window | A Note when a same-day pair keeps the 4-hour split, a Warning when it does not |
| R5 | One referee number | Counted from the schedule as drawn. The canvas/scheduler timing gap is filed as its own backlog item, not fixed here |

## What planning measured

A throwaway probe (deleted) ran B1–B8 through the app path at `b84be7e291`:

- The engine's clamp in `computePostScheduleRefDemand`
  (`stripsForEvent > peak.total`) fired 0 times, and removing it left every
  `refRequirementsByDay` byte-identical. It is inert.
- Store and engine emit the same referee intervals with the same counts. They
  differ only in time. The store derives each phase back to back from the
  placement (`derive.ts`, "minus resource contention"), while the scheduler's
  allocations sit later where a phase waited for strips. Later phases are
  drawn 25–60+ minutes earlier than scheduled.
- Store minus engine, every day that differs (B3 and B5 agree everywhere):

  | Scenario | Day | Engine | Store |
  |---|---:|---:|---:|
  | B1 | 1 / 2 | 210 / 134 | 218 / 140 |
  | B2 | 0 / 3 | 228 / 136 | 244 / 140 |
  | B4 | 1 / 2 | 80 / 80 | 90 / 104 |
  | B6 | 0 / 1 / 2 | 78 / 68 / 64 | 98 / 90 / 112 |
  | B7 | 0 / 2 | 156 / 156 | 164 / 168 |
  | B8 | 0 / 2 | 212 / 136 | 236 / 172 |

- Flight rounding (store `ceil`/`floor` of `refs_needed / 2`, engine
  `max(1, round(refs_needed / 2))` for both flights) changed no count in B1–B8,
  and every engine interval fell in the store's day.

The backlog's explanation (the engine clamps, the store does not) is wrong and
is corrected by this feature.

## Design

### 1. Rule check on placements

A pure engine function evaluates the current placements and returns
`Bottleneck`s. It reads competitions, each placed event's day and derived pool
start, and the tournament config. It holds no state.

- **Hard same-day pairs.** For every unordered pair of placed events on the
  same day where `crossoverPenalty(a, b, tournament_type) === Infinity`, emit
  `rule: hard-separation-violated`, `cause: UNAVOIDABLE_CROSSOVER_CONFLICT`,
  `severity: WARN`, `subjects` both ids sorted, `day` the placement day. The
  rule source is `crossoverPenalty`, the function the auto-scheduler's
  constraint graph uses, so both halves of the app share one rule set. Its
  message names both events by label and says they may never share a day.
- **Regional Group 1 window.** At ROC, RYC and RJCC (`GROUP_1_SOFT_TYPES`),
  for every same-day pair matching `GROUP_1_MANDATORY` with the same gender
  and weapon, compare the older side's pool start against the day's start plus
  `REGIONAL_GROUP_1_WINDOW_MINS`, and the younger side's against the same
  floor, as `regionalWindowFindings` does. Emit `regional-window-honoured`
  (INFO) or `regional-window-not-honoured` (WARN) with both subjects and the
  day. Messages print clock times.
- Unplaced events are not checked. Events whose day is out of range are not
  checked.
- `computeDerivedFindings` (`store/derived.ts`) adds these to the findings it
  already feeds the panel.

The scheduler's own regional-window code stays. Whether it should share the
new pure helper is a plan-level choice, provided the scheduler's findings do
not change.

### 2. Findings carry their day

- `Bottleneck` gains an optional `day: number` (0-based). Every producer whose
  finding belongs to one day fills it: the hard-pair and regional-window
  findings above, `day-pools-exceed-strips`,
  `day-video-demand-exceeds-video-strips`, `multiple-flighted-same-day`, the
  three `DAY_RESOURCE_SUMMARY` lines, `day-ends-past-target`, and the first
  and last day WARN. The message formats of the `DAY_RESOURCE_SUMMARY` lines
  do not change (the ledger's "day peaks match" check parses them).
- The Findings panel's bottleneck row id becomes
  `analysis:<rule>:<competition_id>:<subjects joined>:<day>`, replacing
  `analysis:<cause>:<competition_id>:<ordinal>`. A dismissal no longer passes
  to another finding when the list changes. Existing dismissals reset, which
  is acceptable: nothing has shipped (no back-compat).
- A row's `day` and `where` come from the finding's `day` when present, so a
  Day 2 venue warning reads "Day 2" instead of "Venue".
- Rows for `hard-separation-violated` are Warnings that cannot be dismissed
  (R1). `dismissFinding` refuses them, and the row offers no dismiss control.
- The two day-scoped messages that print a 0-based day
  (`day-video-demand-exceeds-video-strips`, `multiple-flighted-same-day`)
  print "Day N" 1-based, like every other finding.

If two findings ever share rule, owner, subjects and day, the plan adds a
tie-break and a test, and says which producer needed it.

### 3. The 024 findings in the app

- **First and last day WARN.** Recomputed from the derived schedule (the
  placements as drawn) with the store's config, through the same engine
  function the scheduler uses, so a hand move updates it. Shown with its day.
- **Regional window.** Part 1.
- **Late day.** The store's `late-finish:day:<n>` row stays (R2). The engine's
  `day-ends-past-target` message prints clock times from the day's own start
  (`Day 3 ends at 20:00, 60 min past its target 19:00: …`) and carries `day`.
  It is not added to the panel.

### 4. Two-event findings on the canvas

`findingsForBlock` (`Canvas.tsx`) attaches a finding to every block whose
competition is in its `subjects`, not only the owner's (R3). The gutter flags
follow. Existing two-event findings (`flighting-group-both-video`) show on
both blocks as a result.

### 5. One referee number

- A pure function in `src/engine/refs.ts` turns a set of `ScheduleResult`s into
  per-day referee demand intervals: pools by `pool_refs_count`, flights by
  `flight_a_refs` / `flight_b_refs`, DE phases by strips × `DE_REFS`. It is the
  logic `buildRefDemandByDay` has today, moved into the engine.
- `buildRefDemandByDay` (store) calls it on the derived schedule. The footer's
  number does not change.
- The scheduler computes `ref_requirements_by_day` by converting its result to
  placements exactly as `runScheduleAll` does, deriving each event with
  `deriveEventSchedule`, and calling the same function. The footer and the
  scheduler then agree by construction on a fresh run.
  `computePostScheduleRefDemand` and its inert clamp are removed.
- Expected drift: `refRequirementsByDay` rises to the store's numbers on the
  13 days above (B1, B2, B4, B6, B7, B8). Scheduled counts, ERRORs and every
  other digest field stay put, because nothing in the scheduler reads its own
  referee figure. Any other move halts for attribution.
- The "day peaks match" check (`DAY_REF_PEAK_SUMMARY`) is a separate per-event
  sum and is not changed.

### METHODOLOGY amendment the owner makes before part 5

Part 5 contradicts METHODOLOGY as written. The owner amends it first. Draft
wording for approval:

- **§Ref Demand Derivation** (`METHODOLOGY.md:626-628`), replacing the first
  sentence: "Ref demand is derived post-schedule from the schedule as the
  workbench draws it: each scheduled event's day, start and strip budget,
  with its phases laid end to end by the same duration rules the scheduler
  uses. The workbench and the scheduler count the same intervals, so the
  footer's peak and the reported peak are one number. A phase the scheduler
  delayed for strips is counted at its drawn time, so the reported peak can
  sit above the peak of the scheduler's internal timeline (see backlog
  §The canvas draws phases without the scheduler's waits)."
- **Phase 7** (`METHODOLOGY.md:753`): "Ref demand is derived post-schedule
  from the drawn schedule (see [Ref Demand Derivation](#ref-demand-derivation)),
  not maintained incrementally by the loop."

### Backlog and roadmap changes

- §The scorecard's peak-referee row: corrected cause (timing, not clamping),
  marked fixed by 016 with the measured numbers.
- New entry, **§The canvas draws phases without the scheduler's waits**: after
  a run the app keeps day, start and strip count, and re-derives phase times
  without contention, so on a busy day later phases are drawn 25–60+ minutes
  earlier than the scheduler planned. Cost if ignored: an organizer reads DE
  start times that are early, and the referee peak inherits that optimism.
  Fixing it means keeping each phase's times after a run and deciding what a
  hand move does to them. Proposed as its own roadmap feature.
- §Hand-placed events, §Day-level findings: marked fixed where 016 fixes them.
  The phase-repeating scheduler findings (`phase-deferred` and the like) stay
  out of the panel and stay open.
- Roadmap row 016 updated to what was delivered, and the new feature added.

## Testing and verification

- Test-first throughout (constitution II). The rule check and the
  regional-window helper get table-driven engine tests covering each hard rule
  kind (same population, Vet combined vs age-banded, the relaxable
  individual/team blocks, Div 1/Div 1A, Group 1 at a national type), Group 1
  at a regional type (no hard finding, window findings instead), different
  gender or weapon, unplaced and out-of-range events.
- Store tests: a hand-made rule break shows a non-dismissable Warning, moving
  one event off the day clears it, dismissal ids are stable when a sibling
  finding disappears, venue rows show their day.
- Canvas test: a two-subject finding shows on both blocks.
- One drift review, for part 5, against the baseline above
  (`driftLedger.test.ts` header). Parts 1–4 must leave the ledger snapshot
  byte-identical, checked after each.
- `test-quality-reviewer` after test edits, `react-code-reviewer` after React
  edits.
- Live smoke (`scripts/smoke.mjs`): extended in place to drag two hard-paired
  events onto one day and see the Warning without a dismiss control, and to
  see the regional Note on a ROC template. Footer referee peak unchanged.

## Out of scope

- Keeping the scheduler's phase times in the app (the new backlog entry).
- Soft crossover penalties as findings on hand placements.
- Scheduler findings that repeat per phase reaching the panel.
- The Vet co-day rule (age-banded Vet individuals must share a day) as a
  hand-placement finding. It is a must-share rule, not a separation, and is
  recorded in the backlog if the plan finds it unchecked.
- Flight-rounding unification: it moved nothing in B1–B8. Part 5's shared
  function uses the store's rounding, and the plan records whether any
  scenario has an odd `refs_needed` flighted event.
