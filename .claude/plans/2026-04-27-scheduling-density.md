# Scheduling Density: Make the Engine Actually Place All Events

## Status: largely solved by a model bug fix, not by the original plan

Original baseline (verified 2026-04-27): B1 17/24, B3 8-10/24, B4 10/30, B7 6/18.

After 2026-04-28 work: B1 24/24, B2 24/24, B3 24/24, B4 16/30, B5 12/12, B6 44/54, B7 18/18, B8 51/53. Five of seven scenarios at 100%; B6 at 81%; B4 the genuinely tight one at 53%.

The density problem turned out to be a model bug, not a constraint-relaxation problem. The "next session" focus is no longer relaxation — it's a pod-allocation refactor and a few targeted gap investigations.

## Vision (unchanged)

Today's engine schedules all events in most real-tournament scenarios. Real tournaments fit ~100%. The remaining gap is genuinely tight per-day capacity, not constraint-graph saturation.

## Engine policy decisions (unchanged anchors)

- Use all `days_available` days unconditionally.
- Hard edges are relax-targets, not absolutes (Tier 0–4 ladder still the right framing if relaxation work resumes).
- Feasibility failure surfaces up front, not via missing schedule entries.

## Component 1: ASCII lane visualizer — DONE

`src/tools/asciiLaneRenderer.ts` ships. Wired into all B-scenario integration tests via `maybeDumpAsciiLanes` helper, gated behind `PISTE_VISUALIZE=1`. 15 unit tests in `__tests__/tools/asciiLaneRenderer.test.ts`. Idle slots render as whitespace; phases shown as bracketed bars `[P-EVT...]` `[DEP-...]` `[R16-...]`. Strips grouped by identical allocation pattern. Time axis at 10-min/char resolution; 14-hour day fits inside 120 cols with 80 strips.

Drove every diagnosis in the session — directly surfaced the DE-strip-model bug.

## Component 2: Up-front feasibility validation — DONE

`validateFeasibility()` in `src/engine/validation.ts`. Compares estimated strip-hours to capacity (and video-strip-hours when needed). Emits `RESOURCE_INSUFFICIENT` ERROR with shortfall and suggested days/strips deltas. 1.15× slack avoids false-positives on borderline-tight inputs (B4 sat at 1.114× and is genuinely feasible; the slack lets it through).

8 new tests in `__tests__/engine/validation.test.ts`. B1–B8 all pass; obviously-undersized configs fail clearly.

## DE strip model fix — DONE (was not in the original plan)

The root cause of the density gap. `src/engine/concurrentScheduler.ts` was setting `desired_strip_count = bracketSize/2` for DE phases, capped by `max_de_strip_pct=0.80`. For a 256-bracket event with 80 strips, this gave ONE event 64 strips for DE_PRELIMS — forcing all other events to wait their turn. With 4 events of similar size on a day, DEs serialized over 4–5 hours and the day ran out of time.

Fix: `desired_strip_count = min(bracketSize/2, 4 × DE_POD_SIZE) = 16`, matching the real-world 4-pods-of-4-strips DE convention. Empirical durations in `de_duration_table` already assume this parallelism, so duration scaling is now coherent.

Effect: B7 6/18 → 18/18. All B1–B3 to 100%. B6 29/54 → 44/54. B8 added at 51/53.

## VET ↔ DIV crossover calibration — DONE (was not in the original plan)

`CROSSOVER_GRAPH` had VETERAN ↔ DIV1/DIV1A/DIV2/DIV3 all at 0.8 — implying 80% fencer overlap. In practice ~5–10% of vets enter Div events. Lowered to 0.1. Test in `__tests__/engine/constraintGraph.test.ts` updated.

This was discovered by working through the actual April 2026 NAC schedule (B8) and noticing the engine was treating Vet/Div pairings as near-hard conflicts when reality has them on the same day routinely.

## Component 3: Iterative constraint relaxation — DEFERRED, REFRAMED

The original premise — "hard edges force co-day events apart, relax to fit them together" — turned out to be wrong for the observed failure cases. Visualizer evidence showed days had 600+ idle strip-hours and events failed at runtime (`DEADLINE_CHECK`), not at day-coloring saturation.

The DE strip model fix addressed the actual root cause. Constraint relaxation may still close edge cases (B4 at 16/30, B8 at 51/53, B6 at 44/54) but it's no longer the primary lever. Lower priority for the next session unless investigation of those gaps points back at it.

The relaxation ladder design (Tier 0–4) remains valid as a structure if/when the work resumes. Specifically: lowering VET↔DIV crossover edges from 0.8 to 0.1 in this session was effectively a one-shot calibration that the iterative-relaxation framework was supposed to discover automatically. The framework is still the right destination; it just isn't urgent.

---

# Next session: pod allocation removal + targeted gap investigations

## Component A: Remove pod allocation from the scheduler

**Why now.** The session surfaced that `DE_POD_SIZE` and pod-aligned allocation are operational layout decisions, not scheduling constraints. The current model:

- Forces `allocatePods()` to lump strips in 4-strip blocks during DE phases
- Carries a `Pod` type and a `pod_id` field on `StripAllocation` purely for this layering
- Can't represent heterogeneous pod sizes (the April 2026 venue had 2-strip pods D and M; the engine pretended every pod was 4 strips)
- Makes the strip allocator conflate "where strips are" with "how the algorithm schedules"

**The right model: strips are a fluid pool of indistinguishable units.**

The engine schedules N strips for an event-phase from time T1 to T2. Post-schedule, the engine *recommends* pod groupings (analogous to how it recommends ref staffing today). Operators decide the layout day-of, which is what they do anyway.

**Pool phase stays atomic. DE phase becomes fluid.**

This is a critical distinction grounded in how tournaments actually run:

- **Pool phase (atomic block).** All pools start and end together. The engine allocates N strips for the full pool round duration; strips release as a single unit at pool end. No mid-phase release. This is the existing behavior and stays unchanged.
- **DE phase (fluid).** Organizers move fencers around as strips become available — pods are an organizational efficiency, not a hard structure. The engine should model strip allocation as fluid here: as bouts complete and rounds halve, strips become available to other events that need them.

The "fluid DE" property is what Component B (sub-round modeling) provides. Component A just gets us off the rigid pod-aligned allocator so Component B has somewhere to land.

**Scope.**

1. Delete or rewrite `src/engine/pods.ts` (and remove `Pod` type from `types.ts`).
2. Replace `allocatePods()` calls in `concurrentScheduler.ts` with a unified strip-allocation path. The `use_pods: true` flag on STAGED DE phase nodes goes away — same path as SINGLE_STAGE allocation.
3. Remove `pod_id` from `StripAllocation`. Renderer doesn't use it.
4. Add a post-schedule output: `PodRecommendationByDay[]` (or similar) — for each `(event, phase)`, report peak concurrent strip count and suggested pod count `⌈peak/4⌉`. Mirrors `RefDemandByDay`.
5. Retire `__tests__/engine/pods.test.ts` (15 tests). Replace with tests on the new recommendation output shape.

**Risks.**

- Tests asserting on specific strip indices or `pod_id` values will need to be rebaselined. Most B-scenario tests assert event counts and integrity, so they should hold.
- Strip-selection determinism: the new fluid allocator must pick strips deterministically (first-fit by index). Already what `findAvailableStripsInWindow` does, so probably fine.
- R16 video-strip allocation: still needs N video-capable strips. Already supported by `video_required` flag on the strip-window helper. No new mechanism required.

**Out of scope.**

- Variable pod sizes in the recommendation. Default to pods-of-4 for now; heterogeneous output ("3 pods of 4, 1 pod of 2") is a future polish.
- Changing the pool-phase allocation model. Pools stay atomic.
- Changing the DE duration model. Empirical durations in `de_duration_table` still assume ~16-strip DE concurrency; that doesn't change here. (Component B does a finer breakdown.)

**Acceptance.**

- All 712 existing tests pass after rebaseline.
- B-scenario schedule counts hold or improve relative to current numbers (B1–B3, B5, B7 at 100%; B4 ≥16; B6 ≥44; B8 ≥51).
- New output: `pod_recommendations_by_day` exposes per-(event, phase) strip-peak and suggested pod count.
- `Pod` type and `pod_id` field removed from `types.ts`.
- Pool phase still allocates as one block (one `StripAllocation` per strip per pool phase); only DE phases use the new fluid path.

## Component B: Sub-round strip release for DE phases

**Why this is meaningful.** Currently a DE phase reserves its peak strip count (16 for the 4-pod model) for the full phase duration. As the bracket halves round-by-round, fewer strips are actually needed but the engine doesn't release the surplus. Other events that could use the freed strips wait until the whole phase ends. On dense days (B6 at 44/54, B8 at 51/53), this artificial holding of strips blocks later events that would otherwise fit.

**The mechanic.** Replace each DE phase node's single `(desired_strip_count, duration_at_full)` with a sequence of sub-rounds, each with its own `(strip_count, duration)`:

For DE_PRELIMS on bracket=256 (foil/epee, ~20 min/bout):
```
sub_rounds: [
  { strip_count: 16, duration: 80 },  // R128 → R64: 64 bouts ÷ 16 strips = 4 batches × 20 min
  { strip_count: 8,  duration: 40 },  // R64 → R32: 32 bouts ÷ 8 strips = 4 batches × 10 min
                                      // 8 strips released at start of R64
]
```

For DE_R16 on a 4-strip pod (R32 → R16 → QF → SF):
```
sub_rounds: [
  { strip_count: 4, duration: 20 },  // R32: 16 bouts ÷ 4 = 4 batches × 5 min (saber) / 20 min (foil)
  { strip_count: 4, duration: 15 },  // R16
  { strip_count: 4, duration: 10 },  // QF
  { strip_count: 2, duration: 10 },  // SF (2 strips released)
]
```

The aggregate sub-round duration must equal today's `de_duration_table[weapon][bracket]` so the existing calibration isn't disturbed. Initial implementation derives sub-round durations from `DE_BOUT_DURATION` and bouts-per-round, then renormalizes to match the table aggregate.

**Why pools stay atomic.** "All pools start and end as a single unit (approximately)." Real tournaments wave-start pool rounds together so all fencers experience the round consistently. The last pool finishing 5 minutes early doesn't materially free strips for other events because the next phase (DE) needs the same strips on the same event. This is fundamentally different from DE: DE rounds halve in size and naturally release strips that other events can usefully claim.

**Allocator change.**

Currently `allocatePods()` writes one `StripAllocation` per strip per phase, covering the full phase duration. With sub-round modeling, DE phases write *one allocation per strip per sub-round* — finer-grained intervals on the same per-strip lists. The `findAvailableStripsInWindow` logic doesn't change; finer intervals just give it more places to find fits.

Pool phases keep one allocation per strip for the full pool duration.

**Scope.**

1. Add `sub_rounds: Array<{ strip_count: number; duration: number }>` to phase nodes for DE phases (DE_PRELIMS, DE_R16, DE_SINGLE).
2. Compute sub-round durations from `DE_BOUT_DURATION` × bouts-per-round, then normalize to match `de_duration_table` aggregate.
3. In the allocator, for DE phases: walk sub-rounds, claim peak strips at phase start, release surplus strips at sub-round boundaries by setting `end_time` per strip according to which sub-round needed it.
4. Pool phase allocation unchanged.
5. Visualizer: existing renderer should work without changes since it walks per-strip allocation lists; finer intervals will produce narrower bracket bars at the right times.
6. Tests: extend `__tests__/engine/integration.test.ts` to verify sub-round release frees strips for later events. Add unit tests for the sub-round duration computation.

**Risks and caveats.**

- **Director-continuity is operationally real but mathematically optional.** Real tournaments often keep all 16 strips visually assigned to an event for organizational tidiness, even when 8 are mathematically idle. The model represents what's mathematically possible, not what operators do today. Same framing as the wave-stagger discussion: model produces the optimum; operators add slack.
- **More `StripAllocation` entries.** B7 day 1 currently ~150 entries; sub-round model probably ~3× that. Memory and rendering grow linearly. Visualizer at 10-min/char resolution still fits in 120 cols.
- **Empirical-duration drift.** Sub-round durations computed from bouts may not perfectly match the table aggregate. Renormalization handles this, but if sub-round shapes drift far from reality we may need to recalibrate `DE_BOUT_DURATION` separately. Likely fine for v1.
- **Interaction with R16 video.** R16 phase sub-rounds include the SF sub-round at 2 strips, which means 2 video strips become free mid-phase. Other events' R16 phases could potentially claim those. Need to verify the allocator handles partial video releases correctly.

**Out of scope.**

- Bout-level scheduling. Too granular and brittle.
- Per-fencer bout sequencing. The model says "round R128 takes 80 min on 16 strips"; it doesn't track which fencer is on which strip when.
- Pool sub-round modeling. Pools are atomic per the user's clarification.

**Acceptance.**

- All tests pass after rebaseline.
- B-scenario schedule counts hold or improve. Specifically: B6 → 47+/54 (closing 3+ events), B8 → 53/53 (closing the 2 remaining women's epee misses) if the DE-strip release actually unblocks them. If it doesn't, the gap is on a different axis and Component C investigates.
- Visualizer shows narrower DE bars in late sub-rounds (visible evidence that strips released).
- Aggregate DE phase duration unchanged from current `de_duration_table` values.

## Component C: Investigate remaining gaps

Run these only if the gaps still seem worth closing after pod removal lands.

### B4 — 16/30 (real tournament fits 30 in 3 days × 40 strips × 4 video)

Visualizer evidence will show whether the gap is:
- Constraint-graph driven (events forced to under-saturated days), or
- Genuine runtime fit (40 strips × 14h = 560 strip-hours/day; 30 events × ~50 strip-hours = 1500 / 3 days = 500 — tight by the model but feasible by reality).

If runtime fit: probably needs a lower-overhead pool model (real Y8/Y10 events finish in 2–3 hours, not 5–6 hours). Calibrate the `pool_round_duration_table` for youth events specifically.

### B6 — 44/54 (real tournament fits 54 in 3 days × 48 strips × 4 video)

54 events on 3 days is extreme density. Real ROCs schedule 5+ events per pod-of-strips per day. The engine's day-coloring may be too conservative. Visualizer first; then either day-coloring relaxation or duration calibration.

### B8 — 51/53 (real tournament fit all 53)

Two unscheduled women's epee events (`VET-W-EPEE-IND-VCMB` and `JR-W-EPEE-IND`). Visualizer should show whether they collide with same-population edges or fail at runtime. If runtime: 2-event misses on a 53-event tournament is fine for a v1.

## What this plan deliberately does NOT do

- Wave model / staggered start times. Decided this session: the engine should produce theoretical-optimum starts; operational stagger is the operator's choice.
- Refs as input constraint. Refs stay as output.
- Duration table recalibration for non-youth events. The DE model fix made existing durations coherent; broader calibration is its own project.
- A graphical visualizer (separate `schedule-visualizer.md` plan covers SVG).
- Changes to `MAX_EXPANDED_DAYS` or `CAPACITY_TARGET_FILL` (already removed in flight).

---

# Methodology updates from this session

These are engine-wide decisions reached during diagnosis and discussion. They're documented here so future plans inherit the same model assumptions. Some are already shipped on this branch; others land with Components A and B.

## Calibration values

- **DE strip footprint is 16 strips per event regardless of bracket size.** Real-world DE convention is 4 pods × 4 strips. The empirical durations in `de_duration_table` are calibrated against this concurrency, not against `bracketSize/2` parallelism. Encoded as `desired_strip_count = min(bracketSize/2, 4 × DE_POD_SIZE)` in the runtime allocator. Already shipped (commit `bde95bc`).
- **Veteran ↔ Division crossover weight = 0.1.** Vets and Div fencers share ~5–10% of the population, not 80%. Edges VETERAN ↔ DIV1, DIV1A, DIV2, DIV3 all set to 0.1 in `CROSSOVER_GRAPH`. Already shipped.
- **Feasibility validation slack = 1.15×.** The strip-hour estimator is approximate; tight-but-real configs (e.g. B4 at 1.114× of capacity) shouldn't false-fail. Slack is a single tuning parameter on `validateFeasibility`. Already shipped.

## Modeling rules

- **Pool phase is atomic, DE phase is fluid.** Pool rounds start and end as a single block — all strips assigned for the full pool duration, released together at pool end. DE phases are sub-round-decomposed: as the bracket halves, surplus strips return to the pool for other events to use. Lands with Component B.
- **Pods are operational, not algorithmic.** The engine schedules N strips for a phase; operators arrange those strips into pods (uniform, heterogeneous, whatever the venue dictates). Pod count is a post-schedule recommendation output, mirroring how ref demand is reported. Lands with Component A.
- **Same-population key includes `vet_age_group`.** V40 ≠ V50 ≠ VCMB. Each is a distinct population for hard-conflict purposes. Already in `validation.ts` and `crossover.ts`.
- **VET_COMBINED ↔ age-banded Vet is a hard same-day block.** Vet fencers typically enter both their age band AND VCMB, so the two events must be on different days. Already encoded as `isVetCombinedAgeBandedBlock` in `crossover.ts`.
- **Junior ↔ Veteran has zero crossover.** Junior is U-20, Vet is 40+. No human can be both. `CROSSOVER_GRAPH` correctly has no edge here. Documented for clarity.
- **Start times snap to `SLOT_MINS` (default 30 min).** Phase starts land on 8:00, 8:30, 9:00, … never 8:23. `SLOT_MINS` is configurable per-tournament. Already in `snapToSlot()`.
- **Strip availability is tracked at minute resolution.** Underneath the slot-snapped start times, `StripAllocation.start_time` and `end_time` are minute-precise. The slot snap only affects when the *next phase* may begin, not when the *current phase* ended.

## Engine boundaries (what the engine does NOT model)

- **Operational stagger.** Real tournaments stagger event starts for operator/check-in/staffing reasons unrelated to strip availability. The engine produces theoretical-optimum (earliest available) starts; the operator adds slack. The B8 schedule in particular is mostly capacity-aware densification by humans — a strip-aware engine reproduces the same big-events-early, small-events-backfill shape automatically.
- **Refs as a binding scheduling input.** Refs are calculated post-schedule. The engine does not ration concurrent pool starts by ref count. If 5 events can fit by strip availability, the engine starts 5; the operator decides whether they have 5 refs available.
- **Heterogeneous pod sizes.** The April 2026 venue had 2-strip pods D and M. The engine reports total strip count (e.g., 68); it does not model which strips are physically grouped how. Pod recommendation output assumes uniform pods of 4; the operator adapts to actual venue layout.
- **Para fencing events.** Para has its own video discipline and is operationally a parallel track. The engine doesn't model Para separately; Para events should be excluded from the input. (Encoded as a convention in B8's test data, not in the engine.)
- **Bout-level scheduling.** Sub-round modeling (Component B) is the finest granularity the engine cares about. Individual bouts and per-fencer strip assignments are operator decisions.
- **Director assignment, equipment setup, fencer check-in, hospitality.** None of these are scheduling inputs. The engine assumes infinite director and check-in capacity at start time; if real-world capacity binds, the operator widens the wave manually.
- **Tournament-day weather, room temperature, lunch breaks.** Out of scope.

## Methodology principles (philosophical anchors)

- **The engine's output is the theoretical optimum.** Operational slack (stagger, ref shortages, lunch, bootstrap throughput) is added by humans on top of the engine's recommendation.
- **The engine's value proposition is compression.** A schedule that finishes at 4 PM rather than 8 PM is a real win for fencers, refs, parents, hotels, hospitality. If the engine surfaces "you can finish 4 hours earlier than the as-run schedule," that's concrete advocacy data.
- **Outputs over inputs for operational concerns.** Refs, pods, ref demand, pod recommendations — all post-schedule outputs. The engine schedules; humans staff.
- **Visualizer first.** Every scheduling-density problem in this session was diagnosed by looking at the ASCII lane output. Future debugging starts with `PISTE_VISUALIZE=1` on the relevant B-scenario, not with code reading.
- **Real-tournament data is the calibration target.** Tests B1–B8 derive from actual fencingtimelive event listings. When the engine's output diverges from a real tournament, the engine is wrong (or the input is). Don't tune to abstract benchmarks.

---

## Implementation order for the next session

1. **Component A: pod allocation removal.** Self-contained refactor. Pool stays atomic; DE moves to the fluid path. ~1 session.
2. **Component B: sub-round DE strip release.** Builds on Component A's fluid allocator. Adds the strip-release-at-round-boundary mechanic. ~1 session.
3. **Component C: gap investigations.** Run only if gaps remain after A+B land.
   - C-1: B4 (currently 16/30) — diagnose with visualizer; likely needs youth-event duration recalibration.
   - C-2: B6 (currently 44/54) — most likely closes substantially with sub-round release; verify.
   - C-3: B8 (currently 51/53) — verify the 2 remaining misses are no longer DEADLINE_BREACH after Component B.
