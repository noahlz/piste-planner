# Scheduling Density: Make the Engine Actually Place All Events

## Vision

Today's engine schedules ~30–60% of events in dense real-tournament scenarios. Real tournaments fit ~100% of the same events on the same resources. This plan closes that gap.

Two thrusts:

1. **Iterative constraint relaxation.** When events fail to schedule on their assigned day, progressively relax hard edges in the constraint graph and re-run, until every event is placed or we exhaust the relaxation ladder.
2. **ASCII lane visualizer.** A terminal-friendly per-day timeline that shows which strips are occupied by which event-phase at each time. Drives diagnosis: when an event fails, the lane chart shows exactly where the day ran out of strip-time.

A supporting third thrust:

3. **Up-front feasibility validation.** Before scheduling, sum estimated strip-hours and compare to `days × strips × hours/day`. If insufficient, emit a clear `"need ~N more days OR ~M more strips"` ERROR and stop. Catches obviously-impossible inputs before the engine spends effort.

## Engine policy decisions (anchor for the plan)

- **Use all `days_available` days unconditionally.** The engine's job is to distribute events across the user's day budget, not compact onto fewer days. The user (or visualizer) decides whether the result can be compacted manually.
- **Hard edges are relax-targets, not absolutes.** Today's `INDIV_TEAM_RELAXABLE_BLOCKS` already contemplates relaxation. We extend the principle: any hard edge that, if kept, would prevent scheduling can be downgraded to a soft penalty under iterative relaxation. The relaxation level is recorded on the schedule output and emitted as a `CONSTRAINT_RELAXED` bottleneck so the user sees what the engine had to bend.
- **Feasibility failure surfaces up front, not via missing schedule entries.** If total work > total capacity, the engine reports it before day-coloring runs.

## Current state diagnosis (verified 2026-04-27)

For B1–B7 against integration test inputs:

| Scenario | Total | Scheduled | Failure phase |
|---|---|---|---|
| B1 Feb 2026 NAC (4d/80s/8v, 24 evt) | 24 | 17 | DE_PRELIMS deadline |
| B3 Mar 2026 NAC (4d/80s/8v, 24 evt) | 24 | 8–10 | DE_PRELIMS deadline |
| B4 Jan 2026 SYC (3d/40s/4v, 30 evt) | 30 | 10 | pools + DE_PRELIMS deadline |
| B7 Oct 2025 NAC (4d/80s/8v, 18 evt) | 18 | 6 | DE_PRELIMS deadline |

Failure pattern: `DEADLINE_BREACH_UNRESOLVABLE at DE_PRELIMS`. Day-assignment colors events across days, runtime scheduler can't fit pools→DE_PRELIMS→R16 within the day window for many of them, retries fail.

Resource sweeps already done:

- `CAPACITY_TARGET_FILL` 0.3 → 0.9: zero effect on counts (4-day cap binds first).
- Video strips 8 → 12: zero effect on counts (DE_PRELIMS doesn't use video).

So resources aren't the binding constraint for B1/B3/B7. The two suspects are (a) hard edges in the constraint graph forcing events that *could* share a day onto separate days, and (b) per-event runtime cost (pool duration + DE blocks + tail) being too large for a single 14-hour day.

## Component 1: ASCII lane visualizer

Build first — diagnosis tool for everything that follows.

### Output shape

Per day, one screen of fixed-width text:

```
DAY 1  (08:00–22:00)   strips: 80   video: 8   scheduled: 5/6
        08:00 09:00 10:00 11:00 12:00 13:00 14:00 15:00 16:00 17:00 18:00 19:00 20:00
S01–S04 [P-Y14MEPEE.....][DEP-Y14MEPEE..][R16-Y14MEPEE]
S05–S30 [P-Y14MEPEE......................................]
S31–S60 [P-D2MFOIL.......][DEP-D2MFOIL...]
S61–S64 [...................................][R16-D2MFOIL]
V01–V08 (idle until)..................................[R16-Y14MEPEE]

UNSCHEDULED (1):
  CDT-W-EPEE-IND  — DEADLINE_BREACH at DE_PRELIMS (attempt 2/2)
```

Strips are grouped into ranges of contiguous identically-occupied strips for the time window. One line per strip-group. Time axis aligned across all rows. Phase abbreviations: `P=POOL`, `DEP=DE_PRELIMS`, `R16=DE_R16`, `DE=DE` (single-stage).

Failed events appear in an "UNSCHEDULED" footer with reason + which phase ran out of room.

### What it must read

The visualizer is a pure function over schedule output:

- `schedule: Record<string, ScheduleResult>` — phase timestamps per event
- `strip_allocations: StripAllocation[][]` — per-strip interval lists (Phase A landed this in the engine state)
- `bottlenecks: Bottleneck[]` — ERROR severity rows tell us why events failed
- `config`, `competitions` — for labels and day boundaries

### Where it lives

`src/tools/asciiLaneRenderer.ts` (analogous to the SVG renderer in the existing visualizer plan). Pure function; no file I/O. Integration tests can call it and `console.log` the output for one scenario at a time, gated behind an env flag so CI stays quiet.

### Out of scope

- Pod-level coloring (dim future enhancement)
- Multi-day side-by-side rendering (each day stands alone)
- Interactive features

### Acceptance

- Renders B1–B7 outputs in a terminal at 120-column width without overflow
- Each day shows time axis + strip-group rows + failed-events footer
- Phase boundaries align with `pool_end`, `de_prelims_end`, etc. from `ScheduleResult`
- Idle strips appear as blank rows or are collapsed into a "S?–S? idle" placeholder
- Eyeballing B7 reveals which phase competes for time on each day

## Component 2: Iterative constraint relaxation

After Component 1 makes failures legible.

### Mental model

Today's day-coloring runs once with relaxations available only for `INDIV_TEAM_RELAXABLE_BLOCKS`. We extend it to a *retry loop*:

1. Run scheduler with the current constraint graph.
2. If every event scheduled, done.
3. Otherwise, find the highest-priority relaxable hard edge among unscheduled events' neighborhoods, downgrade it to a soft edge (or remove it), and re-run.
4. Stop when (a) all events scheduled, or (b) no relaxable edges remain.

Each relaxation is recorded; the schedule reports back which edges were relaxed and at what level, surfaced to the user via existing `CONSTRAINT_RELAXED` bottlenecks.

### The relaxation ladder

Hard edges fall into tiers by how willing we are to bend them. Tier numbers indicate the order in which edges become relaxable:

- **Tier 0 — never relax.** Veteran Co-Day rule (F2b): all Vet age-banded ind events of same gender+weapon must share a day. Bending this is a tournament-design violation.
- **Tier 1 — relax first.** Soft preferences already encoded as hard edges (e.g. proximity preferences accidentally hardened). These are the cheapest wins.
- **Tier 2.** `INDIV_TEAM_RELAXABLE_BLOCKS` (already in code). Drop the indv-before-team ordering for a same-(gender,weapon) pair.
- **Tier 3.** Same-Population Conflicts that aren't truly same-fencer (e.g. category proximity edges). The user's intent test: if a fencer can plausibly be in both events, keep the edge; if it's a "scheduling preference" hardened to hard, relax.
- **Tier 4 — last resort.** Same-fencer same-day conflicts (e.g. JUNIOR + CADET same gender + weapon, where overlapping fencers are likely). Relaxing this means the scheduler will produce a day where the same fencer is "supposed to" be in two places. The user must see this clearly and decide whether to override.

The exact tier assignment for each edge type is the design work in this component. Source of truth: methodology doc + `crossover.ts` (CROSSOVER_GRAPH, GROUP_1_MANDATORY) + `dayColoring.ts` (REST_DAY_PAIRS, individualTeamOrderingPenalty inputs) + `constraintGraph.ts` builders.

### Loop guardrails

- **Bounded iteration.** Hard cap on retry count (e.g. tier-count + a few). No infinite loops. (Engine memory: "no unbounded loops".)
- **Relaxations are recorded permanently.** Every edge that gets downgraded emits a `CONSTRAINT_RELAXED` bottleneck with severity = WARN (or ERROR for Tier 3+). The schedule's `constraint_relaxation_level` reflects the highest tier that fired.
- **Monotonic relaxation.** Each iteration *adds* relaxations, never removes them. The retry can only become more permissive.
- **Stop criterion.** Either (a) all events scheduled, or (b) the next relaxation would breach Tier 0, in which case the engine reports the remaining unscheduled events as `DEADLINE_BREACH_UNRESOLVABLE` with the highest tier reached.

### Open design questions

- **Granularity of relaxation.** Per-edge or per-tier? Per-edge gives finer control but more retries. Per-tier is simpler but coarser.
- **Which events drive selection?** Only unscheduled events' edges, or the whole graph? Restricting to unscheduled events focuses the relaxation but may miss edges that block via transitive coloring constraints.
- **Interaction with day-assignment vs runtime.** Does relaxation re-run the entire `scheduleAll`, or just re-color and try the runtime placement? Re-running the whole pipeline is simplest but slower; targeted re-coloring is faster but more error-prone.

These get answered during execution, informed by the visualizer's evidence.

### Acceptance

- B1/B3/B4/B7 reach their real-world scheduled counts (or the engine emits a clear `RESOURCE_INSUFFICIENT` ERROR explaining what's actually missing).
- Every relaxed event has a matching `CONSTRAINT_RELAXED` bottleneck at the correct tier.
- Hard-constraint integrity tests still pass for events that *didn't* require relaxation.
- Bounded loop: max iteration count provably terminates.

## Component 3: Up-front feasibility validation

Smallest of the three.

### What it does

Before day-coloring runs, compute:

- `total_strip_hours_needed` = sum over events of `estimateCompetitionStripHours(c, config).total_strip_hours` (the function already exists).
- `total_strip_hours_available` = `days_available × strips_total × DAY_LENGTH_MINS / 60`.
- `total_video_strip_hours_needed` = sum of strip-hours for phases that require video strips.
- `total_video_strip_hours_available` = `days × video_strips_total × hours/day`.

If needed > available in either dimension, emit a fatal validation ERROR and return immediately without scheduling.

### Diagnostic message shape

```
RESOURCE_INSUFFICIENT (ERROR)
  Total work: 5400 strip-hours over 18 events
  Total capacity: 4480 strip-hours (4 days × 80 strips × 14h)
  Shortfall: 920 strip-hours (~21%)
  Suggest: add 1 day OR add 17 strips
```

The "suggest" line picks the smaller delta in the dimension the user is more likely to control (typically days).

### Acceptance

- B1–B7 inputs all pass validation (real tournaments are feasible by definition).
- An obviously-undersized config (e.g. 1 day for B7) fails validation with a clear message.
- Validation runs in O(events) — no expensive work.

## Implementation order

1. **ASCII lane visualizer** — small, self-contained, gives evidence for every following step.
2. **Up-front feasibility validation** — small, well-scoped. Writing it forces us to be precise about what "feasible" means; that precision feeds the relaxation design.
3. **Iterative constraint relaxation** — biggest piece. Designed and executed informed by what (1) reveals.
4. **(Stretch)** Re-tune downstream calibration knobs (`LOAD_BALANCE_FULLNESS`, per-event strip caps) only if the relaxation ladder doesn't close the gap.

## What this plan deliberately does not do

- Does **not** rebuild the methodology rules. Same-day-per-event, no-pool-skipping, pool→DE phase order, video discipline all stay.
- Does **not** change the duration tables. If the runtime cost per event turns out to be the binding constraint, that's a separate calibration plan.
- Does **not** add a graphical visualizer. The existing `schedule-visualizer.md` plan covers SVG; this plan adds ASCII for fast terminal use.
- Does **not** change `MAX_EXPANDED_DAYS` or `CAPACITY_TARGET_FILL` semantics — both are slated for removal as a side-effect of "use all days_available unconditionally," already in flight in the working tree.

## Out-of-tree state to address before starting

The working tree currently has uncommitted changes from earlier exploration in this conversation:

- `dayColoring.ts` — removed expansion logic, dropped two constants
- `dayColoring.test.ts` — three tests updated to match new behavior, one test failing (`rest-day pairs prefer non-adjacent days`)
- `_diagnostic.test.ts` — temporary file, delete

Two options:

1. Revert all (`git checkout -- .` and remove the diagnostic file). Start the plan from `main` HEAD.
2. Keep the dayColoring changes as the plan's baseline. Investigate the rest-day test regression as the first task; treat the "use all days" policy as the new policy that the rest of the plan builds on.

User decision before execution begins.
