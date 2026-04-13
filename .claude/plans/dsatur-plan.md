# Constraint-Graph Day Assignment — Plan Index

## Context

The current scheduling engine assigns days via a greedy penalty function (`totalDayPenalty`) with no backtracking. Integration tests show 2-4 of 24-54 events scheduling successfully while physical capacity is ~16% utilized. The bottleneck is architectural: `estimateStartOnDay()` returns NO_WINDOW because day assignment is decoupled from resource feasibility.

This plan replaces penalty-based day assignment with constraint-graph coloring (DSatur), within-day sequencing by strip demand, and a bounded repair loop. Source spec: `.claude/plans/constraint-graph-day-assignment.md`.

## Stages

Each stage is a separate plan file. Execute one per session, checkpoint after each.

| Stage | Plan File | What | Checkpoint |
|-------|-----------|------|------------|
| 1 | [stage-1-graph-and-modules.md](stage-1-graph-and-modules.md) | Build constraint graph, DSatur coloring, day sequencing (3 new files, no existing code touched) | All new + existing tests pass |
| 2 | [stage-2-coloring-validation.md](stage-2-coloring-validation.md) | Validate coloring against real B1-B7 tournament data before committing to scheduler rewrite | Day assignments look reasonable, hard constraints satisfied |
| 3 | [stage-3-scheduler-rewrite.md](stage-3-scheduler-rewrite.md) | Wire new modules into scheduler: modify scheduleOne signature, restructure scheduler loop, repair loop | Full test suite passes |
| 4 | [stage-4-baselines.md](stage-4-baselines.md) | Record new B1-B7 integration baselines, assess improvement | Scheduling density improved |

## Decision Point

**After Stage 2:** If coloring produces worse or nonsensical day assignments, stop before touching the scheduler. Adjust the algorithm or abandon the approach with zero disruption to existing code.

## Old Baselines (for reference)

| Scenario | Events | Scheduled | Errors |
|----------|--------|-----------|--------|
| B1: Feb 2026 NAC | 24 | 2 | 22 |
| B2: Nov 2025 NAC | 24 | 4 | 20 |
| B3: Mar 2026 NAC | 24 | 4 | 20 |
| B4: Jan 2026 SYC | 30 | 4 | 26 |
| B5: Jan 2026 SJCC | 12 | 4 | 8 |
| B6: Sep 2025 ROC | 54 | 3 | 51 |
| B7: Oct 2025 NAC | 18 | 4 | 14 |
