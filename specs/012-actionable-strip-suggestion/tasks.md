# Tasks: The suggested strip count is one a venue can supply

**Feature**: `012-actionable-strip-suggestion`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md) D1–D8, [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)
**Predecessor**: [`specs/011-feasibility-and-strip-suggestion/handoff.md`](../011-feasibility-and-strip-suggestion/handoff.md) §7 finding 2

## Format: `[ID] [P?] [Story] Description`

- **[P]** – runnable in parallel with other `[P]` tasks in the same phase.
- **[US1] / [US2] / [US3]** – the user story the task serves.
- **(subagent commits)** – a checkpoint. The subagent commits to
  `012-actionable-strip-suggestion` before returning. Unmarked tasks do not
  commit.
- **(Opus)** – dispatch on Opus: a wrong call here stays green.
- **(drift)** – runs the drift ledger before and after, per standing rule 3.

## Standing rules for every phase

1. **The worktree is the workspace.** All work happens in
   `/Users/noahlz/projects/piste-planner-012-actionable-strip-suggestion` on
   branch `012-actionable-strip-suggestion`, cut from `main` at `670c4da36e`.
   No push, no merge, no rebase, no amend, no branch deletion, no commit to
   `main` ([research.md D8](./research.md)).
2. **Test-first.** Every implementation task has a red test before it that has
   been run and seen to fail for the stated reason. "Failed for the stated
   reason" means the failure message names what the task predicted, not merely
   that something was red.
3. **The drift gate.** Every task marked *(drift)* runs
   `__tests__/engine/driftLedger.test.ts` immediately before its edit and again
   after. Its commit message carries the eight scheduled counts before and
   after, the snapshot fields that moved by name and scenario, one sentence per
   moved field naming the line that produced it, and an explicit "nothing moved"
   when nothing did. **A scheduled count below its floor halts the task.** Never
   edit a floor down. Never run `vitest -u` to make a snapshot diff disappear
   before it has been read.
4. **One story per commit range.** US1, US3 and US2 do not interleave.
5. **Days are 4.** Every measurement in this feature is taken at
   `days_available = 4`, the count `boot.ts:41` gives the app. Do not compare
   any number here against `011/baseline.md` §5, which is days=3.
6. **Three numbers never reach a user** (FR-005, FR-017, FR-015): the
   concurrency ceiling, the strip-hours floor, and any strip count inside the
   post-schedule finding. A task that puts one in a message, a tooltip, or a
   label has failed.
7. **The search never runs inside `scheduleAll`.** `src/engine/stripSearch.ts`
   is imported by nothing under `src/engine/` ([research.md D1](./research.md)).
8. **Reviews.** Dispatch `test-quality-reviewer` after any task that adds or
   edits tests. Dispatch `react-code-reviewer` after T013, the only task
   touching a React component.
9. **Commands** (from the worktree root):
   `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`,
   `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`,
   `timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1`,
   `timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1`. Read logs only on
   failure.
10. **Measurements win.** Where a measurement disagrees with a number in this
    file, in `spec.md`, or in `data-model.md`, the measurement is right and the
    disagreement is recorded in the commit message. Do not adjust a fixture to
    reach a predicted number.

## One decision made while writing this file

**The strip list is built by one rule, and that rule moves into the engine.**
`scheduleAll` takes `config.strips: Strip[]`, not a count. The app derives that
list in `buildStrips` (`src/store/buildConfig.ts:114`, private): `strips_total`
entries, the first `video_strips_total` of them video-capable. The search has to
build a strip list per candidate, and if it built one by its own rule the count
it returns could place every event in the engine and fail in the app. So T004
exports `buildStrips` from `src/engine/stripBudget.ts` and `buildConfig.ts`
imports it. Per candidate the search holds every other config field and
substitutes only `strips_total` and the list `buildStrips` derives from it, so
the candidate config is exactly what `buildTournamentConfig` would produce at
that count. T008 checks this from the app's own path.

---

## Phase 1: Setup and baseline

- [X] **T001** Create the workspace. From the main checkout run
  `git worktree add /Users/noahlz/projects/piste-planner-012-actionable-strip-suggestion -b 012-actionable-strip-suggestion 670c4da36e`,
  then `pnpm install` in the worktree. Carry two things from the main checkout's
  working tree onto the branch, since both are uncommitted there: the whole
  `specs/012-actionable-strip-suggestion/` directory (copy it), and the 188-line
  addition to `docs/design/backlog.md` (`git diff docs/design/backlog.md` in the
  main checkout, applied in the worktree). Leave the main checkout's copies in
  place – they are the user's and T016's merge instructions name them. Record
  `pnpm test` file and test counts, `tsc -b` and `lint` status as the branch's
  starting numbers. Commit the artifacts and the backlog change as the branch's
  first commit *(subagent commits)*

- [X] **T002** **(Opus)** Build the measurement harness and write
  `specs/012-actionable-strip-suggestion/baseline.md`. The method is
  `011/baseline.md` §The method with **one change**: `setDays(4)` after the
  store reset (plan.md §The measurement instrument). The probe is a temporary
  `*.test.ts` under `tmp/`, reads `src/` and never writes it, and is deleted
  once its numbers are recorded. Record, per template, all ten: events; the
  current suggestion (`suggestStripCount`, which becomes the ceiling); the floor
  (`validateFeasibility`'s aggregate strip-hours ÷ (4 × `DAY_LENGTH_MINS`/60),
  rounded up – compute it inline in the probe, since the named function does
  not exist yet); placed at the current suggestion; the smallest count that
  places every event, found by scanning upward from the floor in the probe;
  placed at that count minus one; placed at 80/12; and wall time per
  `scheduleAll` at the smallest working count. Also record the eight B1–B8
  scheduled counts and the eight `stripRecommendation` values as they stand in
  `__tests__/engine/__snapshots__/driftLedger.test.ts.snap` – these are T011's
  "before". **Expected: spec §Context's table reproduces cell for cell**
  (197/144/147/268/23/37/158/78/54/135 suggested; 76/48/49/96/15/16/48/32/24/49
  smallest working). A disagreement is recorded, not corrected. Confirm the
  0.6–12ms per-run cost the design rests on; if a run is materially slower,
  say so in `baseline.md` §0 *(subagent commits)*

---

## Phase 2: Foundational – one home for two facts

**Purpose**: the aggregate strip-hours and the strip list each get a single
definition before anything reads them a second time.

- [X] **T003** Write the red tests. In `__tests__/engine/capacity.test.ts`: a
  named aggregate function sums `estimateCompetitionStripHours(...).total_strip_hours`
  over the list, skips a competition whose `fencer_count` is below
  `config.MIN_FENCERS` or above `config.MAX_FENCERS` (the filter is part of the
  fact – [research.md D2](./research.md)), returns 0 on an empty list, and
  agrees to the strip-hour with the number `validateFeasibility`'s message
  reports for the same board. In `__tests__/engine/stripBudget.test.ts`: an
  exported `buildStrips(total, videoCount)` returns `total` strips ids
  `strip-1..strip-N` with the first `videoCount` video-capable, and
  `buildTournamentConfig(state)` yields a `config.strips` deep-equal to
  `buildStrips(state.strips_total, resolved video count)`. Run both; confirm
  each fails because the export is missing, not for any other reason

- [X] **T004** **(drift)** Make T003 green. Extract the summation at
  `validation.ts:355-362` into the named function in `src/engine/capacity.ts`
  beside `estimateCompetitionStripHours`, and have `validateFeasibility` call it –
  the message text, rule ids and severity at `validation.ts:374-380` are
  unchanged and `__tests__/engine/validation.test.ts` passes without edits. Move
  `buildStrips` from `src/store/buildConfig.ts:114` to an export in
  `src/engine/stripBudget.ts` and import it in `buildConfig.ts`.
  `__tests__/helpers/factories.ts`'s `makeStrips` is a test helper and stays.
  Ledger expected to show nothing moved *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green.

---

## Phase 3: US1 – the suggested count is one a venue can supply (P1) 🎯 MVP

**Story goal**: **Suggest** writes the smallest strip count that places every
event, found by scanning upward from the strip-hours floor to the concurrency
ceiling ([research.md D3](./research.md)).

**Independent test**: on all ten templates at days=4, the suggested count places
every event and one strip fewer does not (SC-001, SC-002), no count exceeds the
old rule's and the six that exceeded 100 are less than half (SC-003), and none
exceeds 100 (SC-004).

- [ ] **T005** [US1] Write the red tests in a new
  `__tests__/engine/stripSearch.test.ts`. The module under test exposes three
  things: the range (`floor` and `ceiling`) for a board, a **bounded sequence**
  of candidate evaluations over that range that reports each candidate and
  whether it placed every event, and a synchronous convenience that drives the
  sequence to its end and returns the count or `null`. Cases, each on a fixture
  built with `__tests__/helpers/factories.ts`:
  - **Minimality from both sides**, on a fixture where the floor and the answer
    differ by construction (`[M]` in T002 that the floor places fewer than every
    event): the returned count places every event **and** the count minus one
    does not. A scan that returns its own starting point cannot pass this.
  - **The one-run path**: a fixture whose floor already places every event
    evaluates exactly one candidate and returns the floor.
  - **Absence, not the bound**: a board no strip count can place (an event that
    fails on a deadline or structural conflict at every count) exhausts the
    range and returns `null`, never the ceiling.
  - **Floor above ceiling throws**, with a message naming both numbers – fed a
    backwards range directly, since the two functions that produce it should
    never disagree this way.
  - **No sizeable competition returns `null`** (011 FR-010): every event has
    ≤1 fencer.
  - **Never above the old rule**: the returned count is ≤ `suggestStripCount`
    for the same board (FR-007).
  - **Placed means what the app means**: a competition counts as placed only
    with a non-null `pool_start` (`runActions.ts:31`).
  - **Determinism**: two calls on the same input return the same count.
  Run; confirm every case fails because `src/engine/stripSearch.ts` does not
  exist

- [ ] **T006** [US1] **(Opus)** **(drift)** Implement `src/engine/stripSearch.ts`
  as a **leaf** module ([research.md D1](./research.md)): it imports
  `scheduleAll` (`scheduler.ts`), the aggregate and `buildStrips`, and
  `suggestStripCount`; nothing under `src/engine/` imports it. Floor is the
  aggregate over the board ÷ (`days_available` × `DAY_LENGTH_MINS`/60), rounded
  up, at least 1 (FR-003). Ceiling is `suggestStripCount(competitions,
  days_available, max_pool_strip_pct)`; a `null` ceiling is a `null` answer
  before any scan. Iteration count is `ceiling − floor + 1`, computed before
  entry; floor above ceiling throws (constitution IV, FR-004). Each candidate's
  config is the caller's config with only `strips_total` and `strips`
  (`buildStrips(candidate, config.video_strips_total)`) replaced – every other
  field held, so the search evaluates exactly the config the app would build at
  that count. No React import, no store read, no timer: the yielding is the
  store's ([research.md D5](./research.md)). T005 goes green. Ledger expected to
  show nothing moved – nothing reads the search yet *(subagent commits)*

- [ ] **T007** [US1] Rewire the **Suggest** action. First the red tests in
  `__tests__/store/store.test.ts` `describe('suggestStrips')`: the action
  returns a promise; when it resolves `strips_total` holds the search's own
  answer for `buildTournamentConfig(state)` (replace the 13-strip pin at
  `store.test.ts:112-127`, which asserts the ceiling); the two `null` cases at
  `:129-148` still leave the field untouched; and `strips_total` is written
  **once**, at the end – subscribe to the store during the search and assert no
  intermediate candidate ever reaches it (FR-010). Then implement: `suggestStrips`
  becomes `() => Promise<void>` in the `StoreState` interface at `store.ts:63`
  and drives the bounded sequence from T006, awaiting a macrotask between
  candidates so the browser can paint. Update the import at `store.ts:15`.
  Reword the tooltip at `StripSetup.tsx:31-32`, which today describes the
  ceiling ("every pool of the busiest day at once"), to describe the smallest
  count that places every event – no number, no mention of the floor or the
  ceiling (standing rule 6) *(subagent commits)*

- [ ] **T008** [US1] Re-run the T002 harness through the **app's own path** –
  `suggestStrips()` awaited, then `buildTournamentConfig` and `scheduleAll` –
  and append the after-US1 table to `baseline.md`: suggested before → after,
  placed at suggested, placed at suggested − 1, placed at 80/12, and wall time
  for the whole press on the largest template. **SC-001 to SC-004 and SC-007's
  two-second bound are judged here.** A template whose app-path count differs
  from T002's engine-path smallest working count means the candidate config and
  `buildTournamentConfig` disagree, and halts the task until the field that
  differs is named *(subagent commits)*

**Checkpoint**: US1 is independently shippable. `tsc -b`, `lint` and the full
suite green before Phase 4.

---

## Phase 4: US3 – when the plan does not fit, the app names what to change (P2)

**Story goal**: the post-schedule finding reports four ordered levers and no
strip count; the only strip-count rule left in the product is the search.

**Independent test**: a board that does not fit yields one INFO naming days,
flighting, entry caps, strips in that order with no number in it; a board that
fits yields none; scheduling performs one scheduler run.

US3 runs before US2 because it touches the engine and the ledger, where a late
change is expensive, while US2 is confined to one action and one component
(plan.md §Phase sequence).

- [ ] **T009** [US3] Write the red tests. Rewrite the T005 block at
  `__tests__/engine/concurrentScheduler.test.ts:979-1059`, keeping its fixture
  and its first three assertions (the WARN-only gate, the non-empty board, no
  RESOURCE_EXHAUSTION ERROR): the `RESOURCE_RECOMMENDATION` INFO is still
  emitted; its message names **add days**, **flighting**, **cap entries**, and
  **add strips** with those four in that order (assert on the index of each
  phrase, not on the whole string); and the message contains **no digit at
  all** – the shortfall figures live in the feasibility WARN (FR-013) and this
  finding reports no count of its own (FR-015). Add a second case: a board that
  fits (`smallConfig` at a generous strip count) emits no
  `RESOURCE_RECOMMENDATION`. Run; confirm the first fails on the
  `/^Strips: need 59, have 8 —/` text and the second on whichever assertion the
  current gate trips

- [ ] **T010** [US3] Reword `postScheduleDiagnostics` at
  `concurrentScheduler.ts:1461-1476` ([research.md D6](./research.md)): drop the
  `recommendStripCount` call and the `recommended > strips_total` condition; the
  INFO fires on `hasResourceExhaustion` alone and its message names the four
  levers in order with strips last and why (renting more of the facility). Cap
  entries is prose only – the app has no such field (FR-014). Remove
  `recommendStripCount` from the import at `concurrentScheduler.ts:68`. T009
  green. The ledger digest carries no INFO text, so nothing is expected to
  move; run it anyway and say so in the commit *(subagent commits)*

- [ ] **T011** [US3] **(Opus)** **(drift)** Remove the rule and re-point the
  ledger, in one commit so `tsc -b` is never red between them:
  - Delete `recommendStripCount` (`stripBudget.ts:37-58`) and the import of
    `analysis.ts` at `stripBudget.ts:8-13` – the two-module import cycle 011's
    `handoff.md` §7.5 recorded closes with it; note that in the commit. Delete
    its four cases at `__tests__/engine/stripBudget.test.ts:41-110` and the
    import at `:4`.
  - Re-point `driftLedger.test.ts:210` from `recommendStripCount(...)` to the
    T006 synchronous search over `(competitions, config)`, and its import at
    `:25`. Keep the field name `stripRecommendation`: the ledger keeps watching
    the number users see ([research.md D7](./research.md)).
  - Reword the `suggestStripCount` docblock at `analysis.ts:17-41`: it is the
    search's ceiling now, not the suggestion, and reaches no user surface.
  - Run the ledger. **All eight `stripRecommendation` values move**, from the
    ceiling to the searched count; the commit message lists each scenario's
    before → after and one sentence per scenario on why it moved. **No
    scheduled count may move** – one that does means something unexamined
    reads the recommendation and halts the task. Read the snapshot diff
    scenario by scenario before accepting it. Record the ledger test's added
    wall time (`[M]` ~2s expected) *(subagent commits)*

- [ ] **T012** [US3] Verify the split by grep, from the orchestrator, no commit:
  `recommendStripCount` appears nowhere under `src/` or `__tests__/`;
  `suggestStripCount` is imported only by `stripSearch.ts` and
  `analysis.test.ts`; `stripSearch` is imported by nothing under `src/engine/`;
  and no string under `src/components/` or in `postScheduleDiagnostics` names
  the busiest day, the ceiling, or the floor (FR-005, FR-016, FR-017, SC-005a).
  Record the four grep results in T016's handoff

**Checkpoint**: `tsc -b`, `lint` and the full suite green before Phase 5.

---

## Phase 5: US2 – the organizer sees the app working rather than frozen (P2)

**Story goal**: an indicator that names what the app is doing appears only when
a search outlasts a fixed reveal delay, and clears when the count is written.

**Independent test**: a search longer than the delay shows and then clears the
indicator; a search shorter than it never shows it; the strip field never shows
a candidate.

- [ ] **T013** [US2] One dispatch, test then implementation. Create
  `__tests__/components/sections/StripSetup.test.tsx` on the pattern of
  `CompetitionOverrides.test.tsx` (store reset in `beforeEach`, RTL render),
  with fake timers and `suggestStrips` replaced on the store by a promise the
  test controls: (1) a search that resolves after the reveal delay renders an
  indicator whose text names the search (not "loading" or a bare spinner –
  FR-009) and removes it once the promise resolves; (2) a search that resolves
  before the delay never renders it; (3) the **Suggest** button is disabled
  while a search runs, and the strip field's value is unchanged until the
  promise resolves (FR-010). Run; confirm all three fail for want of the
  indicator. Then implement in `src/components/sections/StripSetup.tsx`:
  component-local pending state, a reveal timer at a named constant in the
  100–300ms range (record the value and why in the commit), cleared on unmount,
  and a `role="status"` element for the indicator. Dispatch
  `react-code-reviewer` after *(subagent commits)*

**Checkpoint**: `tsc -b`, `lint` and the full suite green before Phase 6.

---

## Phase 6: Verified live, and close-out

- [ ] **T014** **(dispatched – locator repair iterates, plan.md §Constitution
  Check VI)** Repair `scripts/smoke.mjs` **in place**, never rewritten. Three
  existing steps press **Suggest** and read the field with no wait or a 100ms
  one – `ROC Div1A/Vet` at `:348`, `NAC Youth` at `:763`, `NAC Cadet/Junior` at
  `:818` – and now race an asynchronous action: replace each wait with a poll on
  the strip field changing or the `role="status"` indicator being absent, and
  re-measure the counts their comments record (197 and 144 are the old rule).
  Add the SC-008 step: load `NAC Vet/Div1/Junior` – the largest template, not
  yet in the driver – press **Suggest**, read the field (expected `[M]` 85 per
  `baseline.md` §1 – the spec's 96 was the monotone threshold, §1a – measured
  not assumed), **Auto-schedule all**, and assert 66 rows. Run the
  driver twice; report SMOKE PASS/FAIL for both, every Suggest count read, and
  the console error count, which must be 0 *(subagent commits)*

- [ ] **T015** Run the full gate on the finished branch twice: `tsc -b`, `lint`,
  `pnpm test`. Account for the test-count delta against T001's starting numbers –
  tests added minus tests deleted must close exactly, with none skipped and no
  assertion weakened. Record both runs' numbers here

- [ ] **T016** Write `specs/012-actionable-strip-suggestion/handoff.md`: the
  ten-template table before / after (T002 and T008 side by side); the eight
  `stripRecommendation` values before and after with each movement explained,
  and the eight scheduled counts unchanged; one row per task with the drift it
  moved; the T012 grep record; the verification record from T014 and T015; the
  merge instructions; and a paste-ready resume prompt. Merge instructions must
  name the two things in the main checkout's working tree that will block
  `git merge --no-ff --no-commit`: the untracked `specs/012-actionable-strip-suggestion/`
  (the branch's copies are newer) and the modified `docs/design/backlog.md`
  (the branch carries the same 188 lines plus this feature's close-out entries).
  Mark `spec.md` Delivered. Update `docs/design/backlog.md`: close 011's finding
  2, add the removal of the `stripBudget.ts` → `analysis.ts` cycle, and record
  what this feature did not fix (the `DEADLINE_BREACH` shortfall strips cannot
  buy, entry caps unmodelled, hand placements unchecked against the crossover
  graph). Then stop – the merge commit is the user's *(subagent commits)*

---

## Dependencies

```
T001 → T002 → T003 → T004
                       ↓
        [US1: T005 → T006 → T007 → T008]
                       ↓
        [US3: T009 → T010 → T011 → T012]
                       ↓
        [US2: T013]
                       ↓
              T014 → T015 → T016
```

Strictly sequential. Every drift-bearing task must be the only change in its
diff, and the three stories share `store.ts`, `stripBudget.ts` and the ledger,
so none is parallel with another. Within a story, a red-test task and the
implementation task that follows it may be **one dispatch** when together they
are four steps or fewer (T003+T004, T009+T010); T005 and T006 stay separate
because T006 is Opus and T005 is not.

## Model split

| Task | Model | Why |
|---|---|---|
| T002, T006, T011 | Opus | The harness, the search, and the ledger review are the three places a wrong call stays green |
| T001, T003, T004, T005, T007, T008, T009, T010, T013, T015, T016 | Sonnet | The decisions are in this file; the work is carrying them out |
| T014 | either | Dispatched regardless, because locator repair iterates |
| T012 | orchestrator | Read-only grep |

## What halts a task

- A B1–B8 scheduled count below its floor, or one that moves at all in T011.
- The ledger moving in T004, T006 or T010, which nothing in those tasks reads.
- A template placing fewer events after a task than before it, at any strip
  count.
- A T008 app-path count that differs from T002's engine-path count.
- A search reachable from `scheduleAll` – `stripSearch` imported anywhere under
  `src/engine/`.
- The floor, the ceiling, or any strip count in the post-schedule finding, a
  tooltip, or a label.
- A red test that fails for a reason other than the one its task predicted.

## MVP scope

Phase 1 through Phase 3 (T001–T008). US1 alone restores the button's
credibility: the count it writes is one a venue can supply. US3 and US2 each
ship independently on top of it.
