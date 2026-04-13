# Stage 2: Validate Coloring Against Real Data

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement.

**Goal:** Run DSatur coloring against all 7 integration scenarios (B1-B7) and evaluate the day assignments *before* touching the scheduler. This is the go/no-go decision point.

**Parent plan:** [valiant-crafting-locket.md](valiant-crafting-locket.md)
**Prerequisite:** Stage 1 complete (constraintGraph.ts, dayColoring.ts, daySequencing.ts exist and pass tests)

---

## Task 1: Coloring Validation Test

**Create:** `__tests__/engine/coloringValidation.test.ts`

Write a test file that imports the real B1-B7 tournament configurations from `integration.test.ts` (or rebuilds them using the same `buildCompetitions()` + fencer counts), builds the constraint graph, runs `assignDaysByColoring`, and reports:

### Metrics to capture per scenario

1. **Day distribution** — how many events per day? Is it balanced or lopsided?
2. **Hard constraint violations** — any same-population or GROUP_1_MANDATORY pairs on the same day?
3. **Relaxation count** — how many INDIV_TEAM edges were relaxed?
4. **Soft penalty total** — sum of soft-edge weights for same-day pairs
5. **Rest-day violations** — any REST_DAY_PAIRS on adjacent days?
6. **Within-day sequence** — run `sequenceEventsForDay` for each day, log the order

### Steps

- [ ] **Step 1:** Write the validation test. Use `console.log` or test metadata to output the metrics above. Tests should assert:
  - Zero hard constraint violations (same-population, GROUP_1_MANDATORY) unless relaxation occurred
  - Every competition is assigned a day in range `0..days_available-1`
  - Relaxation count reported (no assertion on count — just visibility)
- [ ] **Step 2:** Run the validation test, capture output
- [ ] **Step 3:** Analyze results. Document findings in this file (fill in the Results section below).

### Key imports

`buildConstraintGraph` from `constraintGraph.ts`, `assignDaysByColoring` from `dayColoring.ts`, `sequenceEventsForDay` from `daySequencing.ts`. Tournament configs from `integration.test.ts` patterns (or rebuild using `buildCompetitions` + `makeConfig`).

---

## Results (fill in after running)

| Scenario | Days | Events/Day | Hard Violations | Relaxations | Soft Penalty |
|----------|------|------------|-----------------|-------------|--------------|
| B1 | | | | | |
| B2 | | | | | |
| B3 | | | | | |
| B4 | | | | | |
| B5 | | | | | |
| B6 | | | | | |
| B7 | | | | | |

### Assessment

_To be filled in after running. Key questions:_
- Are day assignments balanced across available days?
- Are hard constraints respected (or only relaxed where expected)?
- Does the within-day sequence put high-demand events first?
- Compared to the old penalty-based assignments, does this look better, worse, or equivalent?

---

## Decision Point

**Proceed to Stage 3 if:**
- Hard constraints are satisfied (zero violations without relaxation)
- Day distribution is reasonable (no day with 0 events while others are overloaded)
- Relaxation count is low (ideally 0-2 per scenario)

**Stop and reassess if:**
- Hard constraints violated without relaxation
- Day distribution is degenerate (all events crammed into 1-2 days)
- Relaxation count is high (>4 per scenario), suggesting the graph is over-constrained for the available days
- The coloring produces assignments that are obviously worse than what `totalDayPenalty` would pick

**If stopping:** The three new modules remain as dead code with no impact on the existing scheduler. They can be deleted or revised without risk.
