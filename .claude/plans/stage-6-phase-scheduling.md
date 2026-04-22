# Stage 6 — Phase-Level Scheduling Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.
>
> **Plan style:** per user preference, steps describe *what* the code must do (behavior + test assertions) rather than pre-writing implementation.
>
> **Dependency:** this plan assumes `refs-as-output.md` has landed first. Some of the ref-gating complexity is removed by that plan, simplifying `findAvailableStrips` and `earliestResourceWindow` touch points. If refs-as-output is NOT landed, the file references below still apply but the engineer will encounter additional ref-related surface area during each task.

## Goal

Refactor within-day scheduling from **event-major** (schedule event A's full phase chain → then B's → then C's) to **phase-major** (schedule POOLS for all events → then DE_PRELIMS for all events → then DE_R16 for all events → ...). This prevents the first event on a day from monopolizing strips (general + video) across its entire phase sequence before later events are considered. This is the primary scheduling-density fix identified in `.claude/plans/stage-6-scheduling-density-remaining.md`.

Secondary goal: implement the new video-strips-for-pools rule from METHODOLOGY.md §Video Strip Preservation (morning pool wave allowance + single-event-day allowance).

## Non-goals

- No change to day-assignment coloring (Stage 5 is settled).
- No change to constraint graph, crossover model, or penalty weights.
- No change to DE bracket math, pool math, strip-budget caps, or flighting logic.

## Architecture

**Current inner loop (scheduler.ts:89–125):**

```
for day:
  for event in sequencedOrder:
    scheduleCompetition(event)   ← allocates pools, prelims, R16, finals, bronze, end-to-end
```

**New inner loop:**

```
for day:
  phaseOrder = [POOLS, DE_PRELIMS, DE_R16, DE_FINALS, DE_BRONZE]
  for phase in phaseOrder:
    eventsForPhase = filter events applicable to this phase (e.g. DE_PRELIMS only for bracket >= 64)
    for event in sequencedOrder(eventsForPhase, phase):
      schedulePhase(event, phase, partialResults[event.id])
```

Each phase scheduler is a named function that allocates resources for ONE event's ONE phase, updating global state and the event's `partialResult`.

**Failure handling:** when `schedulePhase(E, P)` fails for event E, E is marked failed-for-day and its per-event transaction log rolls back all phases already committed on this day. Other events on the day are unaffected. Repair loop then retries E on an alternate day from POOLS.

**Why this fixes the density problem:** in the current model, event A's `scheduleCompetition` commits *all* its strip allocations (pools 9–12, prelims 12–2, R16 2–3, finals 3–4) before event B starts. After A, `strip_free_at` reflects A's claims across 14 hours. B must fit around what remains. In the new model, after POOLS phase completes, only pool-time slots (9–12) are committed for all events — DE phases haven't claimed anything yet. When DE_PRELIMS phase runs, all events compete fairly. Video strips, in particular, are claimed round-by-round (R16, then Finals) rather than as an A-then-B monopoly chain.

## Tech Stack

TypeScript + Vite. Vitest tests. No new libraries.

## File Structure

**Engine:**
- Create: `src/engine/phaseSchedulers.ts` — one exported function per phase. Phases: `POOLS`, `DE_PRELIMS`, `DE_R16`, `DE_FINALS_STAGED`, `DE_SINGLE_STAGE`, `DE_BRONZE`.
- Modify: `src/engine/scheduleOne.ts` — `scheduleCompetition` becomes a thin wrapper that calls phase schedulers in sequence (kept for backward-compat during Phase A, removed at end of Phase C).
- Modify: `src/engine/scheduler.ts` — per-day inner loop rewritten phase-major.
- Modify: `src/engine/resources.ts` — `findAvailableStrips` accepts a new optional `poolContext` parameter to gate video strips for pools per METHODOLOGY.md rules.
- Modify: `src/engine/types.ts` — add `EventTxLog` type (rollback journal per event). `PartialScheduleResult` is just `Partial<ScheduleResult>` — no new type needed.

**Tests:**
- Create: `__tests__/engine/phaseSchedulers.test.ts` — unit tests per phase scheduler.
- Modify: `__tests__/engine/scheduler.test.ts` — phase-major behavior tests.
- Modify: `__tests__/engine/resources.test.ts` — video-for-pools tests.
- Modify: `__tests__/engine/integration.test.ts` — record B-scenario deltas.

## User Preferences (from project memory)

- Use `pnpm`, not `npm`.
- Single file: `timeout 120 pnpm --silent vitest run <path> > ./tmp/test.log 2>&1`. Full: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`. Read `./tmp/test.log` only on failure.
- User handles git commits; plan steps do NOT run git. Commit points marked.
- Use Edit/Write tools, not shell heredoc.
- After writing tests, dispatch `test-quality-reviewer` agent.
- `as const` objects, not TypeScript enums.
- No unbounded loops — bounded attempts only.
- ts-morph MCP `tsconfigPath` = `./tsconfig.app.json`.

---

## Task 1: Extract phase scheduler functions (non-functional refactor)

**Purpose:** break `scheduleCompetition` into named phase functions without changing behavior. After this task, all B-scenarios produce bit-identical results.

**Files:**
- Create: `src/engine/phaseSchedulers.ts`
- Modify: `src/engine/scheduleOne.ts`
- Test: `__tests__/engine/phaseSchedulers.test.ts`

**Phase scheduler contract** — each function has this shape:

```
schedulePoolPhase(
  competition: Competition,
  day: number,
  notBefore: number,
  state: GlobalState,
  config: TournamentConfig,
  partialResult: PartialScheduleResult,
  txLog: EventTxLog,
): { poolEnd: number } | { failed: SchedulingError }
```

Rules:
- Each phase function is PURE w.r.t. inputs outside `state`, `partialResult`, `txLog` (which it mutates).
- On success: writes phase timing into `partialResult`, records allocations into `txLog`, returns `{ poolEnd }` (or equivalent next-phase-start value).
- On failure: does NOT mutate `state` or `partialResult` (caller handles rollback via `txLog`).

**Phase list:**
1. `schedulePoolPhase` — handles both flighted and non-flighted pools.
2. `scheduleDePrelimsPhase` — only called when `bracket_size >= 64` and DE mode is STAGED.
3. `scheduleR16Phase` — STAGED DE only. Handles the R16 round on video strips.
4. `scheduleDeFinalsPhase` — STAGED DE only. Finals on video strips.
5. `scheduleSingleStageDePhase` — single-stage DE (non-NAC events). One block, all DE rounds.
6. `scheduleBronzePhase` — team events only.

- [ ] **Step 1:** Read `src/engine/scheduleOne.ts` end-to-end. Identify each phase's allocation code (currently inlined in `scheduleCompetition` + helper functions like `allocateStagedDePhases`).

- [ ] **Step 2:** Create `src/engine/phaseSchedulers.ts` with skeletons for the 6 phase schedulers. Each throws `not implemented` initially.

- [ ] **Step 3:** Write unit tests in `__tests__/engine/phaseSchedulers.test.ts`:
  - For `schedulePoolPhase`: given a fresh state + config + competition (128 fencers, individual), returns `poolEnd` at the expected time; `state.strip_free_at` reflects allocated strips; `partialResult.pool_start` / `pool_end` populated; `txLog.stripChanges` contains entries for each strip modified.
  - Same structure for each other phase. Use small synthetic cases (one 64-bracket event, one 128-bracket team event, etc.).
  - Rollback test: apply `rollbackEvent(state, txLog)` after a phase; state returns to pre-phase.

- [ ] **Step 4:** Run tests → FAIL (not implemented).

- [ ] **Step 5:** Copy each phase's logic from `scheduleOne.ts` into the corresponding phase scheduler. For `schedulePoolPhase`: the flight-A/B allocation + ref allocation + pool-end computation currently in `scheduleCompetition`. For `scheduleDePrelimsPhase`: the DE_PRELIMS block from `scheduleOne.ts:617–654`. And so on.

- [ ] **Step 6:** Modify `allocateStrips` / `allocateRefs` (in `resources.ts`) to also append to the passed `txLog` when one is provided. Backward compat: if no txLog passed (legacy call sites), no journal kept.

- [ ] **Step 7:** Rewrite `scheduleCompetition` in `scheduleOne.ts` to be a thin orchestrator: creates an `EventTxLog`, calls each phase scheduler in sequence, propagates `notBefore` between phases (pools → admin gap → de_prelims → r16 → finals → bronze), returns the finalized `ScheduleResult`. If any phase fails: call `rollbackEvent(state, txLog)` and re-throw.

- [ ] **Step 8:** Run full engine test suite. Expected: ALL tests pass (bit-identical behavior).

  Run: `timeout 180 pnpm --silent vitest run __tests__/engine > ./tmp/test.log 2>&1`

- [ ] **Step 9:** Dispatch `test-quality-reviewer` agent on `__tests__/engine/phaseSchedulers.test.ts`.

← **Commit point (user):** "extract phase schedulers (non-functional refactor)"

---

## Task 2: Per-event transaction log and rollback primitive

**Purpose:** formalize the rollback journal so phase-major failure handling is correct. After Task 1, `txLog` is piggybacking on existing snapshot/restore semantics; this task makes it the primary rollback mechanism.

**Files:**
- Modify: `src/engine/types.ts` (add `EventTxLog`)
- Modify: `src/engine/resources.ts` (add `rollbackEvent` helper, ensure all `allocateStrips` / `allocateRefs` append to txLog)
- Test: extend `__tests__/engine/resources.test.ts`

**`EventTxLog` specification:**

```
type EventTxLog = {
  stripChanges: Array<{ stripIdx: number; oldFreeAt: number }>   // previous values
  refIntervalIdxs: Array<{ day: number; intervalIdx: number }>   // indices into ref_demand_by_day[day].intervals
}
```

Rollback reverses:
- `state.strip_free_at[stripIdx] = oldFreeAt` for each entry in `stripChanges` (reverse order).
- Remove intervals from `ref_demand_by_day[day].intervals` at the tracked indices (reverse order to keep indices stable during splice).

- [ ] **Step 1:** Write failing tests in `__tests__/engine/resources.test.ts`:
  1. Allocate pools for event E with txLog → `state.strip_free_at` updated; `txLog.stripChanges` has N entries with correct `oldFreeAt` values.
  2. Allocate refs for event E → `ref_demand_by_day[day].intervals` grows; `txLog.refIntervalIdxs` tracks those indices.
  3. After both allocations, `rollbackEvent(state, txLog)` restores `strip_free_at` to pre-allocation values and removes the ref intervals.
  4. Interleaved scenario: allocate E's pools, allocate F's pools (different txLog), rollback E only → E's strips restored, F's intact.

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** Implement `rollbackEvent(state, txLog)` in `resources.ts`. Ensure `allocateStrips(state, stripIndices, endTime, txLog?)` captures `oldFreeAt` per strip before mutating. Ensure `allocateRefs(state, day, weapon, count, startTime, endTime, txLog?)` pushes the interval and records the index.

- [ ] **Step 4:** Run → PASS.

- [ ] **Step 5:** Verify no regressions: full engine suite.

  Run: `timeout 180 pnpm --silent vitest run __tests__/engine > ./tmp/test.log 2>&1`

- [ ] **Step 6:** Dispatch `test-quality-reviewer` on the resources test updates.

← **Commit point (user):** "add per-event transaction log and rollback primitive"

---

## Task 3: Flip the per-day scheduler loop to phase-major

**Purpose:** the core behavior change. After this task, events no longer monopolize resources across their entire phase chain.

**Files:**
- Modify: `src/engine/scheduler.ts`
- Modify: `src/engine/scheduleOne.ts` (delete or further thin `scheduleCompetition`)
- Test: `__tests__/engine/scheduler.test.ts`, `__tests__/engine/integration.test.ts`

**New per-day inner loop semantics:**

1. Determine `dayEvents = competitions.filter(c => dayMap.get(c.id) === day)`.
2. `sequencedEvents = sequenceEventsForDay(dayEvents, config)` — same sequencer as today.
3. Initialize per-event state: `partialResults: Map<id, PartialScheduleResult>`, `txLogs: Map<id, EventTxLog>`, `phaseStartTimes: Map<id, { poolStart, deStart, r16Start, finalsStart }>` (tracks per-event `notBefore` across phases).
4. Iterate phases in order: `POOLS`, `DE_PRELIMS`, `DE_R16` / `DE_SINGLE_STAGE`, `DE_FINALS`, `DE_BRONZE`.
5. For each phase P: iterate `sequencedEvents`; for each event E where P applies:
    - If E already failed on this day: skip.
    - Call `schedulePhase(E, P, phaseStartTimes[E.id], state, config, partialResults[E.id], txLogs[E.id])`.
    - On success: update `phaseStartTimes[E.id]` with the next-phase `notBefore`.
    - On failure: mark E as `failedOnDay[d]`, call `rollbackEvent(state, txLogs[E.id])`, add to `failedEvents` list.
6. After all phases complete: for each successful event, finalize `state.schedule[E.id]` from its `partialResult`.
7. Repair loop (unchanged in structure): for each `failedEvents` entry, try the event on alternate days ranked by `softPenaltyEstimate`.

**Phase applicability rules:**
- `DE_PRELIMS` applies iff `bracket_size >= 64` AND event is STAGED DE (NAC events).
- `DE_R16` applies iff event is STAGED DE.
- `DE_FINALS` applies iff event is STAGED DE.
- `DE_SINGLE_STAGE` applies iff event is NOT STAGED (non-NAC events).
- `DE_BRONZE` applies iff event is a team event.

**Note on single-stage events:** the outer phase iteration must handle them alongside staged events. Suggested approach: when iterating `DE_R16`, also handle `DE_SINGLE_STAGE` events in the same outer step (both are "DE start" phases); or treat `DE_R16 / DE_SINGLE_STAGE` as one logical phase and let the phase scheduler dispatch.

- [ ] **Step 1:** Write failing tests in `__tests__/engine/scheduler.test.ts`:
  1. Two-event day (event A 100 fencers, event B 100 fencers, 40 strips, 4 video strips). After scheduling: both events have `pool_start == dayStart + pool-offset` (pools run concurrently, not A-then-B). Confirms phase-major.
  2. Three-event day where current code fails B's DE_R16 (`DEADLINE_BREACH_UNRESOLVABLE`): new code succeeds, all three events' R16 allocations are interleaved (not all owned by event 1).
  3. Failure isolation: if event C fails DE_R16 due to genuine over-capacity, event A and B are NOT rolled back; their schedules are intact. C moves to repair.
  4. Phase applicability: a non-staged event (single-stage DE) coexists with staged events on same day; both get scheduled correctly.

- [ ] **Step 2:** Run → FAIL (because scheduler still event-major).

- [ ] **Step 3:** Rewrite the per-day inner loop in `scheduler.ts:89–125` per the new semantics above. Delete the call to `scheduleCompetition` — replace with phase-major loop. Keep `sequenceEventsForDay` unchanged.

- [ ] **Step 4:** Decide fate of `scheduleCompetition` in `scheduleOne.ts`:
  - Option A: keep as a legacy shim that's no longer called.
  - Option B: delete entirely; update any other callers (grep `scheduleCompetition` — expected: only test files and repair loop).
  - Recommend B. Update repair loop to also use phase-major (a failed event's repair attempt on day D' runs all phases sequentially for that ONE event; same loop structure works with a single-element `sequencedEvents`).

- [ ] **Step 5:** Run scheduler tests → PASS for tests 1–4.

- [ ] **Step 6:** Run full engine suite. Expect many integration tests to change output counts. That's expected.

  Run: `timeout 180 pnpm --silent vitest run __tests__/engine > ./tmp/test.log 2>&1`

- [ ] **Step 7:** For each failing integration test, read failure carefully. Categorize:
  - **Expected win**: B-scenario scheduled more events. Update assertion to new count (or a range).
  - **Expected regression**: rare, but some B-scenarios may lose events if sequencing is now suboptimal. Document in a scratch note.
  - **Genuine bug**: investigate and fix.

- [ ] **Step 8:** Record B-scenario deltas in a table:

  | Scenario | Baseline (pre-Task-3) | Post-Task-3 | Delta | Target |
  |---|---|---|---|---|
  | B1 | 14 | ? | ? | ≥ 15 |
  | B2 | 11 | ? | ? | ≥ 10 |
  | B3 | 7 | ? | ? | ≥ 7 |
  | B4 | 9 | ? | ? | ≥ 9 |
  | B5 | 3 | ? | ? | ≥ 8 |
  | B6 | 17 | ? | ? | ≥ 17 |
  | B7 | 4 | ? | ? | ≥ 10 |

  Save as a comment in the updated integration test or as a scratch note. These numbers inform Task 5 tuning.

← **Commit point (user):** "flip scheduler inner loop to phase-major"

---

## Task 4: Dispatch test-quality-reviewer on scheduler changes

- [ ] **Step 1:** Dispatch `test-quality-reviewer` agent on `__tests__/engine/scheduler.test.ts` and the changes to `__tests__/engine/integration.test.ts`. Review for:
  - Are new tests asserting meaningful properties (not just "something was scheduled")?
  - Do failure-isolation tests actually verify state rollback, not just absence of crash?
  - Do assertions on event counts use reasonable ranges or exact values?

- [ ] **Step 2:** Address feedback before continuing.

← **Commit point (user):** "test review feedback"

---

## Task 5: Implement video-strips-for-pools rule

**Purpose:** implement METHODOLOGY.md §Video Strip Preservation updated rules. Morning pool wave may use video strips; single-event days may use them throughout. This adds capacity on strip-constrained days (particularly helpful for B5).

**Files:**
- Modify: `src/engine/resources.ts` — `findAvailableStrips` signature change.
- Modify: `src/engine/phaseSchedulers.ts` — `schedulePoolPhase` passes the pool context.
- Modify: `src/engine/scheduler.ts` — provides day-level context (event count per day, whether we're in the morning wave).
- Test: `__tests__/engine/resources.test.ts`

**`findAvailableStrips` new signature:**

```
findAvailableStrips(
  state, config, count, atTime, videoRequired,
  poolContext?: {
    isPoolPhase: boolean
    isMorningWave: boolean     // candidate start within [dayStart, dayStart + MORNING_WAVE_WINDOW_MINS]
    isSingleEventDay: boolean
  }
)
```

Rules (when `videoRequired === false`):
- If `!poolContext?.isPoolPhase`: existing behavior (non-video first, video as overflow).
- If `poolContext.isPoolPhase && (poolContext.isMorningWave || poolContext.isSingleEventDay)`: video strips ARE included in the candidate pool (non-video first, video second). Same as current overflow.
- If `poolContext.isPoolPhase && !isMorningWave && !isSingleEventDay`: EXCLUDE video strips entirely. Non-video only. If insufficient non-video strips: `WAIT_UNTIL` based on non-video free time OR `NO_WINDOW` (if never enough).

**Morning wave definition:** `MORNING_WAVE_WINDOW_MINS = 60` (first hour of day). `isMorningWave = (candidate <= dayStart + MORNING_WAVE_WINDOW_MINS)`. Exported constant; test-tuneable.

**Single-event-day:** `isSingleEventDay = (dayEvents.length === 1)`, computed once in the per-day scheduler and passed as static context.

- [ ] **Step 1:** Write failing tests in `__tests__/engine/resources.test.ts`:
  1. Pool at 8:00 AM (morning wave), 10 non-video strips needed, 8 non-video + 4 video free → returns 10 strips with 2 video included.
  2. Pool at 1:00 PM (NOT morning wave), multi-event day, same state → returns 8 non-video only, `WAIT_UNTIL` or `NO_WINDOW` for the 10-count request.
  3. Pool at 1:00 PM, single-event day → returns 10 strips with 2 video (allowed because single-event).
  4. DE_R16 (videoRequired=true), morning wave → only video strips considered (pool context doesn't affect video-required paths).
  5. Non-pool phase at 1:00 PM (DE_PRELIMS, videoRequired=false): existing overflow behavior — video strips used as overflow.

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3:** Implement the rule in `findAvailableStrips`. Add `MORNING_WAVE_WINDOW_MINS` constant to `constants.ts`. Update callers to pass `poolContext` when relevant.

- [ ] **Step 4:** Update `schedulePoolPhase` to build `poolContext` from day-level context (number of events on this day, candidate time vs. day start) and pass it into every `earliestResourceWindow` / `findAvailableStrips` call within the pool phase.

- [ ] **Step 5:** Update `scheduler.ts` per-day loop to compute `dayEvents.length` once and provide it to pool phase scheduler invocations.

- [ ] **Step 6:** Run resources tests → PASS.

- [ ] **Step 7:** Run full engine suite. B-scenarios may improve further (particularly B5/B7 on days with pool-strip pressure).

  Run: `timeout 180 pnpm --silent vitest run __tests__/engine > ./tmp/test.log 2>&1`

- [ ] **Step 8:** Update B-scenario delta table (Task 3 Step 8) with post-Task-5 counts.

- [ ] **Step 9:** Dispatch `test-quality-reviewer` on the new resource tests.

← **Commit point (user):** "implement video-strips-for-pools rule"

---

## Task 6: Phase-specific sequencing (optional, tune based on measurements)

**Purpose:** if Task 5 doesn't reach B-scenario targets, the `sequenceEventsForDay` heuristic may need phase-specific tuning. Today one order is used for all phases. Different phases may benefit from different orderings.

**When to do this task:**
- Skip this task if B1 ≥ 15, B5 ≥ 8, B7 ≥ 10 after Task 5. Go to Task 7.
- Otherwise: identify which phase is the bottleneck (from `DEADLINE_BREACH_UNRESOLVABLE` bottleneck causes in test output) and tune the order for that phase only.

**Candidate phase-specific orderings:**
- `POOLS`: current order (strip-demand desc) — works well.
- `DE_PRELIMS`: largest bracket first (events with bracket >= 64) — same as current.
- `DE_R16`: video-strip-demand descending — events needing more video strips go first, preventing late-event starvation.
- `DE_FINALS`: shortest-phase-first — finals are short; let the quick ones finish and release video strips for others.

- [ ] **Step 1:** If gates met (B1≥15, B5≥8, B7≥10), mark task complete and skip to Task 7.

- [ ] **Step 2:** Otherwise: add a second parameter to `sequenceEventsForDay` — `phase: Phase` — and produce phase-specific orderings per the candidates above.

- [ ] **Step 3:** Update the per-day scheduler to pass phase when calling `sequenceEventsForDay` inside each phase iteration.

- [ ] **Step 4:** Add failing tests for each phase-specific ordering in `__tests__/engine/daySequencing.test.ts`.

- [ ] **Step 5:** Implement, run, iterate until B-scenario gates hit.

- [ ] **Step 6:** If still short after tuning, document unmet gates in a scratch note and halt — the remaining gap is an architectural question (possibly fine-grained bout-level scheduling) out of scope for this plan.

← **Commit point (user):** "phase-specific sequencing (if needed)"

---

## Task 7: Address B1 regression (if any)

**Purpose:** The prior plan noted B1 regressed from 15 → 14 due to Stage 5 day expansion. Phase-major scheduling may recover this; verify.

- [ ] **Step 1:** Read B1 count from the latest delta table. If B1 ≥ 15: task complete, skip to Task 8.

- [ ] **Step 2:** If B1 < 15: diagnose. Likely cause is day expansion spreading DIV1 events too thin, creating contention on day 4. Options:
  - Tighten Stage 5 `CAPACITY_TARGET_FILL` from 0.3 to 0.4 (makes expansion less aggressive).
  - Or add a gate: only expand when multiple events on a single day all need video strips concurrently (genuine pressure), not just when `total_strip_hours > target`.

- [ ] **Step 3:** Write a failing test: B1 scenario (Feb 2026 NAC, 4 days, 24 events) schedules ≥ 15 events.

- [ ] **Step 4:** Implement the chosen tuning in `src/engine/dayColoring.ts`. Run full suite; verify no other B-scenario regresses.

← **Commit point (user):** "recover B1 regression"

---

## Task 8: Final verification and baseline update

- [ ] **Step 1:** Run full test suite.

  Run: `timeout 180 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass.

- [ ] **Step 2:** Compile check.

  Run: `timeout 60 pnpm --silent exec tsc --noEmit -p tsconfig.app.json > ./tmp/test.log 2>&1`

  Expected: 0 errors.

- [ ] **Step 3:** Final B-scenario delta table. Save as a memory note for future sessions:

  | Scenario | Stage-5 baseline | Post-phase-major | Target | Met |
  |---|---|---|---|---|

- [ ] **Step 4:** Delete `src/engine/scheduleOne.ts` if now empty (or reduced to unused stub). Grep for stale imports.

  Run: `grep -rn "scheduleCompetition\|scheduleOne" src/ __tests__/` — expected: no hits or only in comments/legacy.

- [ ] **Step 5:** Update `METHODOLOGY.md` §Scheduling Algorithm Phase 5 (lines 560–568) to reflect the new phase-major structure. Describe the inner phase loop, per-event rollback, and video-strips-for-pools rule cross-reference.

- [ ] **Step 6:** Dispatch `react-code-reviewer` on any UI changes this plan incidentally touched (expected: none — this is an engine-only change).

- [ ] **Step 7:** Smoke-test the UI locally: `pnpm dev`. Walk through a scheduling run. Confirm results render correctly. Confirm ref-requirements output (from prior plan) still works.

← **Commit point (user):** "stage 6 complete — phase-major scheduling"

---

## Risks and Open Questions

- **Sequencing fairness:** today one event "leads" and gets first pick of resources. In phase-major, the leader gets first pool strips, but for DE the leader might be different. This is handled by `sequenceEventsForDay` but may produce surprising timings (e.g., event B starts its pools at 8:00 AM but its DE doesn't start until 3:00 PM because event A won DE contention). Whether this is acceptable depends on tournament operations. Track via Task 3 Step 8's delta table.
- **Bronze + DE_FINALS coupling:** the current `allocateBronzeBout` runs within `allocateStagedDePhases` immediately after finals, sharing the same strip indices. In phase-major this is still fine — `scheduleBronzePhase` reads `partialResult.de_finals_end` and picks up where finals left off. But verify in Task 1 Step 5 that bronze's strip reuse is correctly handled by the rollback journal.
- **Team individual/team ordering:** current code checks `findIndividualCounterpart` and enforces individual-before-team sequencing (`scheduleOne.ts:87–100`). In phase-major, this same check runs within `schedulePoolPhase` — verify the same-day individual has completed its pool phase before the team's pool phase starts. Likely requires the phase iteration to process individuals before teams in `sequenceEventsForDay` (already does — rule 3 in the sequencer).
- **Repair correctness:** if an event fails on day D and repair tries day D+1, day D+1 already has committed phases for OTHER events. The repair call runs all phases for the failed event one-by-one against existing D+1 state. This is fine conceptually but verify via a test in Task 3.
- **Memory/performance:** per-event txLogs add O(strips_allocated_per_event) memory per event per day. For B7 (18 events, 80 strips) this is ~1440 entries total — negligible.

## Out of Scope

- **Fine-grained bout-level scheduling** (e.g., staggering individual R16 bouts across events on video strips within the same 45-minute slot). The phase-major refactor gets per-round interleaving; finer granularity is a follow-on if Task 8's deltas show B5/B7 still short.
- **Phase-level parallelism** (e.g., event A's R16 starts at 12:30, event B's R16 starts at 12:30 on different video strips — this is already what phase-major enables; no further work needed).
- **UI changes** — the ref-requirements UI from the prior plan remains; no new UI from this plan.
