# CSP-Inspired Engine Enhancements

Motivated by Dilkina & Havens (2004), "The U.S. National Football League Scheduling Problem." Three features that improve schedule quality and user control: pinning, nogood learning, and tunable constraint weights.

See: https://www.cs.cornell.edu/~bistra/papers/NFLsched1.pdf

---

## Feature 1: Pinning (Mixed-Initiative Scheduling)

User locks specific competitions to a day/strip/time. Engine re-schedules everything else respecting those pins.

### Tasks

1. Add `pin` field to `Competition` type: `{ day?: number; strip?: number; startTime?: number }`
2. In `scheduleAll`, partition competitions into pinned (placed first, no day-assignment scoring) and unpinned (scheduled normally around pins)
3. Update `GlobalState` resource tracking to reserve pinned resources before scheduling begins
4. Add `constraintScore` bonus for competitions that conflict with pinned ones (schedule them earlier)
5. UI: drag-and-drop a competition onto the grid and toggle a "lock" icon to pin it
6. Validation: surface errors when pins conflict with hard constraints (e.g., two pinned competitions on same strip at same time)

---

## Feature 2: Nogood Learning (Failure Explanation)

When the engine fails to place a competition, record which specific constraint violations caused the failure. Use nogoods to guide constraint relaxation and surface actionable diagnostics to the user.

### Tasks

1. Define `Nogood` type: `{ competitionId: string; day: number; constraints: BottleneckCause[]; level: ConstraintLevel }`
2. In `assignDay`, when a day is rejected, record a nogood entry with the failing constraint(s) instead of silently skipping
3. When all days fail at a given relaxation level, inspect nogoods to relax only the constraints that actually blocked placement (targeted relaxation instead of blanket level escalation)
4. Attach nogoods to `Bottleneck` diagnostics so the UI can show "Event X couldn't be placed on Day 2 because: strip capacity exceeded + saber ref shortage"
5. UI: bottleneck panel shows per-competition failure reasons with specific conflicting constraints named

---

## Feature 3: Tunable Constraint Weights

Expose soft-constraint penalty weights as user-configurable values. Currently hardcoded in `constants.ts`.

### Tasks

1. Define `PenaltyWeights` type with fields for each soft penalty (crossover, proximity, individual-team proximity, saber scarcity, etc.)
2. Add `penaltyWeights` to `TournamentConfig` with current hardcoded values as defaults
3. Thread `penaltyWeights` through `assignDay` and `constraintScore` instead of using constants directly
4. UI: "Advanced Settings" panel with sliders or numeric inputs for each weight, with reset-to-defaults button
5. Add tooltip explanations for each weight (e.g., "Crossover penalty: cost when fencers compete in overlapping events on the same day")

---

## Implementation Order

1. **Tunable Constraints** — smallest scope, no engine architecture changes, unblocks UI experimentation
2. **Pinning** — medium scope, changes scheduling flow but not algorithm
3. **Nogood Learning** — largest scope, changes how relaxation works internally

---

## References for Follow-Up Research

### Directly cited in Dilkina & Havens (2004)

- Havens, W. and Dilkina, B. 2004. "A hybrid schema for systematic local search." 17th Canadian Conference on Artificial Intelligence (AI'2004). *(The companion paper with the actual algorithm details)*
- Minton, S.; Johnston, M.; Phillips, A.; and Laird, P. 1992. "Minimizing conflicts: a heuristic repair method for constraint satisfaction and scheduling problems." Artificial Intelligence 58:161-205.
- Gomes, C.; Selman, B.; and Kautz, H. 1998. "Boosting combinatorial search through randomization." AAAI-98, 431-437.
- Jussien, N. and Lhomme, O. 2002. "Local search with constraint propagation and conflict-based heuristics." Artificial Intelligence 139:21-45.
- Freuder, E. and Wallace, R. 1992. "Partial constraint satisfaction." Artificial Intelligence 58:21-70. *(Foundational work on soft/partial CSP — relevant to our hard/soft constraint model)*
- Glover, F. 1990. "Tabu search: a tutorial." Interfaces 20:74-94.

### Related sports scheduling (not in the paper)

- Trick, M. and Yildiz, H. 2011. "Benders' cuts guided large neighborhood search for the traveling umpire problem." Naval Research Logistics 58(8):771-781. — Uses Benders' decomposition for sports official assignment; relevant to our referee allocation problem.
- Nemhauser, G. and Trick, M. 1998. "Scheduling a Major College Basketball Conference." — Venue/time assignment with resource constraints; closer to our problem than NFL broadcast scheduling.
- Rasmussen, R. and Trick, M. 2008. "Round robin scheduling — a survey." European Journal of Operational Research 188(3):617-636. — Broad overview of sports scheduling techniques.

### Job-shop scheduling (closest to our strips-as-queues model)

- Flexible job-shop scheduling literature — our model of competitions as jobs, strips as machines, and referees as workers maps directly to FJSP. Search for "flexible job-shop scheduling with resource constraints" for directly applicable techniques.
- Pinedo, M.L. "Scheduling: Theory, Algorithms, and Systems." Springer, 6th edition (2022). — Standard textbook covering job-shop, flow-shop, and resource-constrained scheduling.