# Stage 3: Wire Into Scheduler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement. Tasks must run sequentially (Task 1 before Task 2).

**Goal:** Modify `scheduleOne` and `scheduler` to use constraint-graph coloring instead of penalty-based day assignment.

**Parent plan:** [valiant-crafting-locket.md](valiant-crafting-locket.md)
**Prerequisite:** Stage 2 complete with go decision

---

## Task 1: Modify scheduleCompetition Signature

**Modify:** `src/engine/scheduleOne.ts`, `__tests__/engine/scheduleOne.test.ts`

### Changes

- New signature: `scheduleCompetition(competition, day, state, config, allCompetitions)` — add `day: number` as 2nd param
- Remove `assignDay()` call (~line 84). Use `day` parameter directly.
- Remove import of `assignDay` from `dayAssignment.ts`. Keep `findEarlierSlotSameDay`, `SchedulingError`.
- Set `constraint_relaxation_level: 0` in result (~line 174). Scheduler will override from coloring metadata.
- Do NOT modify `scheduler.ts` yet (Task 2 handles that)

### Steps

- [ ] **Step 1:** Update function signature, remove `assignDay` call, remove `constraintLevel` variable
- [ ] **Step 2:** Update all `scheduleOne.test.ts` calls to pass a `day` argument
- [ ] **Step 3:** Run `scheduleOne.test.ts`, verify pass. (scheduler.test.ts may break — that's expected, Task 2 fixes it)

---

## Task 2: Restructure Scheduler Loop

**Modify:** `src/engine/scheduler.ts`, `__tests__/engine/scheduler.test.ts`

### New `scheduleAll` flow

Replace single-pass loop (lines 76-108) with 5-phase pipeline:

**Phase 1:** `const graph = buildConstraintGraph(competitions)`

**Phase 2:** `const { dayMap, relaxations, effectiveDays } = assignDaysByColoring(graph, competitions, config)`

**Phase 3:** For each day 0..effectiveDays-1 (the coloring may use fewer days than `config.days_available`):
- Collect events for this day from dayMap
- `sequenceEventsForDay(dayEvents, config)`
- For each: `scheduleCompetition(event, day, state, config, competitions)`. Catch `SchedulingError` -> add to failedEvents.
- If `relaxations.has(event.id)`, set `result.constraint_relaxation_level` from relaxations map and emit `CONSTRAINT_RELAXED` bottleneck.

**Phase 4:** Repair loop for failed events:
- Get hard-edge neighbors from graph
- Valid alt days = days with no hard-edge neighbor assigned (check `state.schedule`)
- Sort by soft penalty (lowest first)
- Try each alt day. Bound: `days_available - 1` attempts per event.
- On all failures: record ERROR bottleneck.

**Phase 5:** Post-schedule diagnostics (unchanged — keep `postScheduleDiagnostics`, `postScheduleDayBreakdown`, `postScheduleWarnings`)

### Import changes

- Remove: `constraintScore` from `dayAssignment.ts`
- Remove: `sortWithPairs()` call (keep function exported for backward compat)
- Add: `buildConstraintGraph`, `ConstraintGraph` from `constraintGraph.ts`
- Add: `assignDaysByColoring` from `dayColoring.ts`
- Add: `sequenceEventsForDay` from `daySequencing.ts`

### Constraint relaxation compatibility

Integration tests check `constraint_relaxation_level > 0` implies a `CONSTRAINT_RELAXED` bottleneck. The coloring step's `relaxations` map must flow through:
- If `relaxations.get(event.id) === 3`, set `result.constraint_relaxation_level = 3` and push a `CONSTRAINT_RELAXED` bottleneck with severity INFO.

### Steps

- [ ] **Step 1:** Rewrite `scheduleAll` with phases 1-5. Update imports.
- [ ] **Step 2:** Implement repair loop (phase 4).
- [ ] **Step 3:** Update `scheduler.test.ts`. Existing tests should pass. Add repair loop test if feasible.
- [ ] **Step 4:** Run full test suite, fix failures.

---

## Verification

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

All tests pass. Critical checks:
- [ ] `scheduleOne.test.ts` passes with new signature
- [ ] `scheduler.test.ts` passes with new pipeline
- [ ] `integration.test.ts` passes (scheduled + errors = total, hard separations hold)
- [ ] Full test suite green
