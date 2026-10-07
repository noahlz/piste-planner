# 016 Hand placements obey the rules – implementation plan

> **For agentic workers:** the orchestrator writes no code. Each task is a
> subagent dispatch followed by its review wave (superpowers
> subagent-driven-development). Start from [`sessions/S1.md`](./sessions/S1.md).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a hand placement is judged by the auto-scheduler's same-day rules,
day-scoped findings carry their day, and the footer and the scheduler report
one referee peak.

**Architecture:** new pure engine checks over placements feed the store's
existing findings pipeline (`computeDerivedFindings` → `computeAllFindings`).
`Bottleneck` gains an optional `day`, which the row id and the panel use. The
referee demand logic moves from the store into `refs.ts`, and the scheduler
calls it on its own result converted to placements.

**Tech stack:** React + TypeScript + Vite, Zustand, Vitest + React Testing
Library.

**Spec:** [`spec.md`](./spec.md) (approved 2026-10-06), with the METHODOLOGY
amendment `8e6b8d8e73`. Executors read both. The spec is never edited to
match code. A task that finds the spec wrong or silent halts to the owner.

## Global constraints

- Worktree `<wt>` = `/Users/noahlz/projects/piste-planner/.claude/worktrees/016-hand-placement-rules`,
  branch `016-hand-placement-rules`. Agents commit there only, one commit per
  task plus one per review-fix. Never push, merge, rebase or make the closing
  commit.
- Baseline: 81 files / 2148 tests, ledger B1–B8 scheduled
  24 / 24 / 24 / 21 / 12 / 45 / 18 / 53, ERRORs 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0,
  snapshot SHA-256 `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06`
  (`sha256sum __tests__/engine/__snapshots__/driftLedger.test.ts.snap`).
- Tasks A–D leave the snapshot byte-identical. Only Task E moves it, and only
  in `refRequirementsByDay` (spec §5 table). Any other move halts.
- Test-first: write the failing test, confirm the failure reason, implement.
- `src/engine/` stays pure: no store or React imports.
- `as const` objects with derived unions, never enums. Every loop bounded.
- If a task changes per-event derivation, `__tests__/helpers/scenarios.ts` and
  `__tests__/store/factoryParity.test.ts` join its editable files and the
  factory's copy changes in the same commit. No task here is expected to.
- Commands (from `<wt>`, never `cd`): `timeout 300 pnpm --silent test >
  ./tmp/test.log 2>&1`, `timeout 120 pnpm -C <wt> exec vitest run <file>`,
  `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1`,
  `timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1`. Read logs only on
  failure.
- Each task ends green on the full suite, `tsc -b` and lint, with the
  snapshot SHA recorded in its commit message.
- Dispatches may add tests in `__tests__` files outside a task's list when
  they cover that task's behaviour or a review fix. `src/` stays to the list.
  Name each such file in the commit.

## Review focus

The inputs the spec implies that no task's main tests reach, most likely
first. Each is pinned by a test in the owning task.

1. **The days are reduced after events were placed** on the dropped days. The
   rule check skips out-of-range placements and the panel does not crash
   (Task B, Task C).
2. **One pair matches several hard rules** (a same-population pair is also a
   Group 1 pair at a NAC). Exactly one `hard-separation-violated` per pair
   (Task B).
3. **A flighted or staged older event in the regional window.** The window
   reads the event's first pool start (flight A when flighted) (Task B).
4. **A dismissed warning whose day changes.** Dismissing the Day 2 instance of
   a day-scoped warning does not hide the Day 3 instance (Task C).
5. **A run that had to break a hard edge.** Every `hard-separation-violated`
   pair the scheduler reports for a scenario also appears in the app's
   findings after that run (Task C, parity over B1–B8).

---

### Task A: `Bottleneck.day` and day-scoped producers

**Model:** Sonnet. **Reviews:** test-quality-reviewer, spec review.

**Files:**
- Modify: `src/engine/types.ts` (`Bottleneck`), `src/engine/analysis.ts`
  (`day-pools-exceed-strips`, `day-video-demand-exceeds-video-strips`,
  `multiple-flighted-same-day`), `src/engine/concurrentScheduler.ts`
  (`postScheduleDayBreakdown`'s three lines, `lateDayWarnings`,
  `firstLastDayWarnings`, `regionalWindowFindings`, the
  `hard-separation-violated` push).
- Test: `__tests__/engine/analysis.test.ts`, `__tests__/engine/dayHardEnd.test.ts`,
  `__tests__/engine/bottleneckSubjects.test.ts`, and the test that owns the
  first/last day WARN (find it with grep on `FIRST_DAY_LONGER_THAN_MIDDLE`).

**Interfaces:**
- Produces: `Bottleneck.day?: number`, 0-based on the producer's own day index
  (the store's day for `analysis.ts`, which receives store days; the
  scheduler's `assigned_day` for scheduler findings).
- Produces: `day-ends-past-target` message in clock time,
  `Day N ends at HH:MM, <m> min past its target HH:MM: <ids> finish after it`,
  computed from the day's own start (subtract `day × DAY_AXIS_SPACING_MINS`).
  Use the existing clock formatter if the engine has one, else add one pure
  helper next to `dayStart` in `types.ts`.

- [ ] Write failing tests: each listed producer sets `day`. The two 0-based
  messages now print "Day N" 1-based. The late-day message reads clock times
  for a day-3 overrun (the backlog's 4080 / 4020 case reads 20:00 / 19:00).
- [ ] Confirm they fail for the stated reason.
- [ ] Implement. Do not change the `DAY_RESOURCE_SUMMARY` message formats
  (`driftLedger.test.ts`'s "day peaks match" parses them).
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged.
- [ ] Commit: "016 Task A: findings carry their day", with the SHA.

### Task B: the rule check on placements

**Model:** Sonnet (high). **Reviews:** test-quality-reviewer, spec review.

**Files:**
- Create: `src/engine/placementRules.ts`.
- Modify: `src/engine/types.ts` only if a rule id is missing from
  `BottleneckRule` (none is expected: `HARD_SEPARATION_VIOLATED`,
  `REGIONAL_WINDOW_HONOURED`, `REGIONAL_WINDOW_NOT_HONOURED` exist).
- Test: `__tests__/engine/placementRules.test.ts` (new).

**Interfaces:**
- Consumes: `crossoverPenalty(c1, c2, tournamentType)` (`crossover.ts:219`,
  `Infinity` = hard), `GROUP_1_MANDATORY`, `GROUP_1_SOFT_TYPES`,
  `REGIONAL_GROUP_1_WINDOW_MINS` (`constants.ts`), `Bottleneck.day` (Task A).
- Produces: `checkPlacementRules(competitions: Competition[], placed:
  PlacedEvent[], tournamentType: TournamentType, dayStartClock: (day: number)
  => number): Bottleneck[]`, where `PlacedEvent = { competition_id: string;
  day: number; pool_start: number }` on the clock axis (minutes from
  midnight of that day) and `day` is the store's day. The caller filters out
  unplaced and out-of-range events.

Behaviour (spec §1):
- For each unordered same-day pair with `crossoverPenalty === Infinity`: one
  WARN, `rule: hard-separation-violated`, `cause:
  UNAVOIDABLE_CROSSOVER_CONFLICT`, `phase: DAY_ASSIGNMENT`, `competition_id`
  the first sorted id, `subjects` both sorted, `day`, `delay_mins: 0`. Message
  names both ids and says they may never share a day.
- At `GROUP_1_SOFT_TYPES` only, for each same-day pair matching
  `GROUP_1_MANDATORY` with the same gender and weapon: floor =
  `dayStartClock(day) + REGIONAL_GROUP_1_WINDOW_MINS`. Honoured when the older
  side's pool start ≥ floor and the younger's < floor, as
  `regionalWindowFindings` decides. INFO `regional-window-honoured` or WARN
  `regional-window-not-honoured`, `cause: SEQUENCING_CONSTRAINT`, `phase:
  SEQUENCING`, `competition_id` the older id, `subjects` sorted, `day`.
  Messages print clock times.
- The pair loop is O(n²) over at most the selected competitions, a direct
  bound.

- [ ] Write the failing table-driven tests: each hard rule kind (same
  population incl. ind+team, Vet combined against age-banded, the relaxable
  individual/team block, Div 1/Div 1A, Group 1 at NAC), Group 1 at ROC (no
  hard finding, window finding instead, honoured and not), different gender
  or weapon (nothing), different days (nothing), review focus 2 (one finding
  for a multi-rule pair), review focus 3 (the caller passes flight A start as
  `pool_start`; a test documents that contract with a flighted pair).
- [ ] Confirm they fail (module missing).
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged.
- [ ] Commit: "016 Task B: the rule check on placements".

### Task C: the store shows them

**Model:** Opus. **Reviews:** test-quality-reviewer, react-code-reviewer,
spec review.

**Files:**
- Modify: `src/store/derived.ts` (`computeDerivedFindings`,
  `computeAllFindings`'s bottleneck rows), `src/store/store.ts`
  (`dismissFinding`), `src/components/workbench/panels/FindingsPanel.tsx`
  (no dismiss control on a non-dismissable row), `src/engine/concurrentScheduler.ts`
  only to export `firstLastDayWarnings` (or a pure wrapper) without changing
  its behaviour.
- Test: `__tests__/store/derived.test.ts` or the findings tests that own
  `computeAllFindings` (grep `analysis:`), `__tests__/store/store.test.ts`
  (dismissal), `__tests__/components/workbench/panels/FindingsPanel.test.tsx`,
  `__tests__/store/appPathParity.test.ts` (review focus 5).

**Interfaces:**
- Consumes: `checkPlacementRules` (Task B), `Bottleneck.day` (Task A), the
  derived schedule (`selectDerivedSchedule`, results with `pool_start` /
  `flight_a_start`), `firstLastDayWarnings`.
- Produces: `Finding.dismissable: boolean` (false for
  `hard-separation-violated`, and for Blocking and Note rows as today);
  bottleneck row id `analysis:<rule>:<competition_id>:<subjects joined by
  +>:<day or ->`.

Behaviour (spec §2, §3):
- `computeDerivedFindings` appends `checkPlacementRules` over placed,
  in-range events (pool start = flight A start when flighted, else pool
  start, converted to the clock axis of the store's day) and the first/last
  day WARN over the derived results. Mind the axes: placements and
  `dayConfigs` are on the store's day axis; `buildTournamentConfig`'s config
  is on the scheduler axis (`buildConfig.ts:70-81`). Convert once, in one
  place, and test a day-2 case.
- Row `day` and `where` come from `Bottleneck.day` when set, else the
  existing target lookup.
- `dismissFinding` refuses rows with `dismissable: false`. The panel hides
  the control for them.
- The late-day engine finding is not added (R2). The store's
  `late-finish:day:<n>` row is unchanged.

- [ ] Write failing tests: a hand-made hard pair shows one Warning naming
  both events, with no dismiss control, and `dismissFinding` refuses it;
  moving one event to another day clears it; a ROC Group 1 pair on one day
  shows the Note or the Warning; a venue row reads "Day N"; review focus 1
  (reduce `days_available` below a placed day: no crash, no rule finding for
  it); review focus 4 (dismiss a Day 2 instance, the Day 3 instance stays);
  the id stays stable when a sibling finding disappears; the first/last day
  WARN follows a hand move; review focus 5 (for each B1–B8 scenario, every
  scheduler `hard-separation-violated` pair appears in the app's findings
  after the run).
- [ ] Confirm they fail for the stated reasons.
- [ ] Implement.
- [ ] Full suite, `tsc -b`, lint. Snapshot SHA unchanged.
- [ ] Commit: "016 Task C: the Findings panel shows rule breaks and day-scoped findings".

### Task D: two-event findings on both blocks

**Model:** Sonnet. **Reviews:** test-quality-reviewer, react-code-reviewer.

**Files:**
- Modify: `src/components/canvas/Canvas.tsx` (`findingsForBlock`, and the
  gutter flags if they key on one target).
- Test: `__tests__/components/canvas/Canvas.test.tsx`.

Behaviour (spec §4): a finding attaches to every block whose competition is
in its `subjects` (validation errors already do). The owner's phase narrowing
stays for single-subject findings.

- [ ] Failing test: a `hard-separation-violated` finding shows on both
  blocks; `flighting-group-both-video` likewise.
- [ ] Implement, full suite, `tsc -b`, lint, SHA unchanged.
- [ ] Commit: "016 Task D: a two-event finding marks both blocks".

### Task E: one referee number

**Model:** Opus. **Reviews:** drift judges (≤4 items each), test-quality-reviewer,
spec review.

**Files:**
- Modify: `src/engine/refs.ts` (new shared function), `src/store/derived.ts`
  (`buildRefDemandByDay` delegates), `src/engine/concurrentScheduler.ts`
  (replace `computePostScheduleRefDemand` and its inert clamp), and a new
  pure helper for result → placement shared with `src/store/runActions.ts`
  (place it in `src/engine/derive.ts` or a sibling; `runActions.ts` calls it
  instead of its inline conversion).
- Test: `__tests__/engine/refs.test.ts`, `__tests__/store/derived.test.ts`
  (`buildRefDemandByDay`), `__tests__/helpers/appPath.test.ts` (the B1
  `refRequirementsByDay` pin), `__tests__/store/appPathParity.test.ts`,
  `__tests__/engine/concurrentScheduler.test.ts` (`peakRefsOnDay` if it
  moves), `__tests__/engine/__snapshots__/driftLedger.test.ts.snap`.

**Interfaces:**
- Produces: `refDemandFromSchedule(results: ScheduleResult[], config:
  TournamentConfig): Record<number, RefDemandByDay>` (today's
  `buildRefDemandByDay` body; day key `assigned_day`).
- Produces: `placementFromResult(result: ScheduleResult): Placement | null`
  (`runScheduleAll`'s conversion: day, clock start, `pool_strip_count`,
  `source: auto`, `pinned: false`; null when `pool_start` is null).

Behaviour (spec §5): the scheduler builds placements from its schedule,
derives each with `deriveEventSchedule`, calls `refDemandFromSchedule`, then
`computeRefRequirements` as today. The footer number does not change.

- [ ] Write failing tests: a parity test that the store's
  `selectDerivedRefRequirements` after a run equals the engine's
  `ref_requirements_by_day` on every B1–B8 day (red today on the 13 days in
  the spec); `refDemandFromSchedule` unit tests moved from
  `buildRefDemandByDay`'s.
- [ ] Confirm the parity test fails on exactly the spec's 13 days with the
  spec's numbers.
- [ ] Implement. Remove `computePostScheduleRefDemand`.
- [ ] Update the ledger snapshot deliberately (`-u`) and diff it: only
  `refRequirementsByDay` moves, on the 13 days, to the store's numbers. Re-pin
  appPath's B1 numbers to the new values with the cause in a comment.
- [ ] Record whether any B1–B8 flighted event has an odd `refs_needed`.
- [ ] Full suite, `tsc -b`, lint. Record the new SHA.
- [ ] Commit: "016 Task E: one referee number", with the per-day drift table
  and the old and new SHA.

### Task S: live smoke

**Model:** Sonnet, `live-smoke` skill, in a subagent.

**Files:** `scripts/smoke.mjs` (extended in place, never rewritten).

- [ ] Start `pnpm -C <wt> dev --port 5188 --strictPort` and run with
  `SMOKE_BASE=http://localhost:5188/piste-planner/`.
- [ ] Extend the driver: drag two hard-paired events (for example Junior and
  Cadet Men's Foil at a NAC) onto one day and see the Warning with no dismiss
  control and a marker on both blocks; load a ROC template and see the
  regional Note when a Group 1 pair shares a day; the footer referee peak
  for B1's boot is unchanged from before Task E.
- [ ] Locator repair iterates until two consecutive passes.
- [ ] Commit any driver change: "016 Task S: the live smoke checks hand-made
  rule breaks".

### Task H: docs and handoff

**Model:** Sonnet. Documentation only, no tests.

**Files:** `docs/design/backlog.md`, `docs/design/competition-planner-workbench.md`,
`specs/016-hand-placement-rules/handoff.md` (new, in 024's handoff shape).

- [ ] Backlog: §Hand-placed events fixed; §The scorecard's peak-referee row
  corrected (timing, not clamping) and fixed; §Day-level findings: the parts
  016 fixed marked, the phase-repeating scheduler findings still open; new
  §The canvas draws phases without the scheduler's waits (spec wording, with
  the probe's table); the Vet co-day rule if Task B found it unchecked.
- [ ] Roadmap: row 016 to what was delivered; a new row for the canvas
  timing feature.
- [ ] Handoff: baseline, per-task commits, the final ledger (scheduled,
  ERRORs, SHA, file and test counts), decisions made on the owner's behalf
  with their costs, left unfixed, and the next feature's resume prompt.
- [ ] Commit: "016 Task H: the handoff, and the backlog and roadmap brought up
  to date with 016".

### Task M: the merge check

- [ ] `git merge-tree --write-tree main 016-hand-placement-rules`. `main` has
  moved to `64344bd405` (the 2026-10-06 rulings in `backlog.md`), so expect a
  backlog merge. On conflict, resolve in a detached throwaway worktree,
  report the resolution for the owner, and run `tsc -b`, lint and the full
  suite on the merged tree there.
- [ ] Record the result in the handoff's merge section. Commit.

## Review waves

After each task: the listed reviewers in parallel, then one bundled fix
dispatch with every accepted issue, a re-review of the fixed items, and a
review-fix commit. Spec reviewers check the diff against `spec.md`.
Drift judges in Task E each take at most four items (step cap).

## Self-review (done at writing)

- Spec coverage: §1 → B, C; §2 → A, C; §3 → A, C; §4 → D; §5 → E;
  amendment → `8e6b8d8e73`; backlog/roadmap → H; testing → each task, S.
- Interfaces: `Bottleneck.day` (A) used by B, C; `checkPlacementRules` (B)
  used by C; `refDemandFromSchedule`, `placementFromResult` (E) internal to E.
