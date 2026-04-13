# Stage 1: Build Graph and New Modules

## Status: COMPLETE (commit fa83e91)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement. Tasks 1-3 are independent and can be dispatched in parallel.

**Goal:** Create the three new engine modules (constraint graph, DSatur coloring, day sequencing) with full test coverage. No existing code is modified — existing tests must remain green.

**Parent plan:** [valiant-crafting-locket.md](valiant-crafting-locket.md)

---

## Task 1: Build Constraint Graph

**Create:** `src/engine/constraintGraph.ts`, `__tests__/engine/constraintGraph.test.ts`

### Types

- `ConstraintEdge: { targetId: string, weight: number }` — Infinity = hard, finite = soft
- `ConstraintGraph: Map<string, ConstraintEdge[]>` — adjacency list keyed by competition ID

### Function: `buildConstraintGraph(competitions: Competition[]): ConstraintGraph`

- O(n^2) pair iteration (n <= 54)
- Call `crossoverPenalty(c1, c2)` from `crossover.ts` — already handles same-population (Infinity), GROUP_1_MANDATORY (Infinity), CROSSOVER_GRAPH soft edges
- Additionally check `INDIV_TEAM_RELAXABLE_BLOCKS` (constants.ts:539-543): same weapon + gender, one INDIVIDUAL with `indivCategory` and one TEAM with `teamCategory` -> hard edge (Infinity)
- Bidirectional edges, ensure symmetry

### Steps

- [ ] **Step 1:** Write tests for `buildConstraintGraph`. Cases: same-population hard edge, GROUP_1_MANDATORY hard edge, CROSSOVER_GRAPH soft edge, different gender/weapon no edge, INDIV_TEAM hard edge, symmetry, empty input
- [ ] **Step 2:** Implement `buildConstraintGraph`
- [ ] **Step 3:** Run tests, verify pass

### Key imports

`crossoverPenalty` from `crossover.ts`, `INDIV_TEAM_RELAXABLE_BLOCKS` from `constants.ts`, `Competition`/`EventType` from `types.ts`. Tests use `makeCompetition` from `__tests__/helpers/factories.ts`.

---

## Task 2: DSatur Graph Coloring

**Create:** `src/engine/dayColoring.ts`, `__tests__/engine/dayColoring.test.ts`

### Function: `assignDaysByColoring(graph, competitions, config): { dayMap: Map<string, number>, relaxations: Map<string, number> }`

### Algorithm

1. All vertices uncolored, saturation = 0
2. Pick highest-saturation vertex. Ties: (a) hard-edge degree desc, (b) `strips_allocated * categoryWeight(comp)` desc
3. Valid colors = days where no hard-edge (Infinity) neighbor has that color
4. Score valid colors — minimize soft penalty sum. Also:
   - REST_DAY_PAIRS neighbor on adjacent day -> +1.5
   - PROXIMITY_GRAPH neighbor on adjacent day -> -0.4
   - `individualTeamProximityPenalty()` from crossover.ts
5. No valid color -> relax INDIV_TEAM edges to weight 5.0, retry. Still none -> pick least-bad. Record in `relaxations` map (value = 3 for INDIV_TEAM relaxation).
6. Color vertex, update neighbor saturations
7. Repeat until all colored

### Steps

- [ ] **Step 1:** Write tests. Cases: 2 hard conflicts + 2 days, 3 mutual hard + 3 days, 3 mutual hard + 2 days (relaxation), soft preference for different days, tie-breaking by size, rest-day adjacency, ind/team proximity
- [ ] **Step 2:** Implement DSatur. Import `ConstraintEdge`/`ConstraintGraph` types from `constraintGraph.ts`.
- [ ] **Step 3:** Run tests, verify pass

### Key imports

`ConstraintEdge`, `ConstraintGraph` from `constraintGraph.ts`, `categoryWeight` from `capacity.ts`, `REST_DAY_PAIRS`, `INDIV_TEAM_RELAXABLE_BLOCKS` from `constants.ts`, `individualTeamProximityPenalty`, `getProximityWeight` from `crossover.ts`

---

## Task 3: Within-Day Event Sequencing

**Create:** `src/engine/daySequencing.ts`, `__tests__/engine/daySequencing.test.ts`

### Function: `sequenceEventsForDay(events: Competition[], config: TournamentConfig): Competition[]`

### Sort key (composite descending)

1. Y8/Y10 first (first-slot requirement)
2. Mandatory before optional (`!comp.optional`)
3. Individual before team (`event_type === INDIVIDUAL`)
4. Strip demand: `strips_allocated * categoryWeight(comp)` desc
5. Duration: `estimateCompetitionStripHours(comp, config).total_strip_hours` desc

Flighting pairs: if event has `is_priority === true` and `flighting_group_id`, its partner (same group, `is_priority === false`) immediately follows.

### Steps

- [ ] **Step 1:** Write tests. Cases: Y8 before DIV1, mandatory before optional, individual before team, larger demand first, flighting pair ordering, mixed tiebreakers
- [ ] **Step 2:** Implement `sequenceEventsForDay`
- [ ] **Step 3:** Run tests, verify pass

### Key imports

`categoryWeight`, `estimateCompetitionStripHours` from `capacity.ts`, `Competition`, `TournamentConfig` from `types.ts`

---

## Verification

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

All new tests pass. All existing tests unaffected (no existing code modified).

## Checkpoint

Before proceeding to Stage 2, confirm:
- [ ] `constraintGraph.test.ts` passes
- [ ] `dayColoring.test.ts` passes
- [ ] `daySequencing.test.ts` passes
- [ ] Full test suite green
