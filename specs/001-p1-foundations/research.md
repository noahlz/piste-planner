# Research: P1 Foundations

Phase 0 decisions and their reasoning. Settled 2026-08-27.

## D1: DE referee demand is one referee per strip, everywhere

**Decision**: Every DE phase requires one referee per allocated strip. Pod
captains are not modelled.

**The state being replaced**. The engine produces three referee figures by three
different rules:

1. **Single-stage DE** counts `strips × DE_REFS`, so one per strip.
2. **Staged DE** emits one interval of `count = 1` per pod of 4 strips. It does
   not *add* to per-strip demand, it *replaces* it – the per-strip loop skips
   every allocation carrying a `pod_id`. The referees actually running staged DE
   bouts were never counted.
3. **The day-summary line** (`DAY_RESOURCE_SUMMARY`, "Day N refs: peak demand X")
   counts one per strip *plus* pod captains.

So the app already prints two referee numbers for the same staged event that
disagree by roughly 4×.

**Rationale**: Rule 2's "one head referee per pod" is pod-captain-shaped
accounting standing in for bout coverage. A bout needs a referee, and if the
allocator claims 16 strips it is because bouts run on 16 strips.

**Consequence**: Staged-DE referee demand rises roughly 4× against what the app
prints today, and the NAC scenarios are almost entirely staged. This is a
correction, not a regression. It lands as its own commit with the referee-report
expectations updated, called out rather than folded silently into the refactor.

Once pod captains are gone, the day-summary path reduces to `DE_REFS × strips`
and all three paths converge on the same rule.

**Alternatives rejected**: Keeping a grouping constant such as
`DE_REF_STRIP_GROUP = 4` and adding it to per-strip demand. Rejected because it
re-introduces the same pod-captain accounting under a new name, and no
Appendix A constant should imply a grouping factor exists.

## D2: The drift ledger is the guard rail, and it comes first

**Decision**: Before any behavior change, snapshot a normalized per-scenario
digest over B1–B8. Every later task re-runs it and reviews the diff before
accepting.

**Rationale**: The engine's output is a schedule, not a boolean. Seven sequential
behavior-affecting changes can drift the scenarios well past the ±1 event the
original phase-1 plan predicted, and drift compounds invisibly when it is only
inspected in aggregate at the end.

**What the digest holds**: scheduled event count and ERROR bottleneck count, the
full per-day referee requirements, the day-summary peak recomputed from
`peakPoolRefDemand` and `peakDeRefDemand` the same way the scheduler does, the
referee and strip recommendations, and a per-event map of assigned day, phase
start and end times, and pool strip count.

Recompute the day-summary peak rather than parsing it out of the message string,
and snapshot no bottleneck message text – those carry times that churn for
uninteresting reasons.

The referee block covers three separate outputs on purpose. The per-day
requirements report is what the pod-allocation removal changes. The day-summary
peak and the referee recommendation are what the pod-captain removal changes –
without them in the digest, that task moves user-visible numbers with nothing to
review.

**Drift gate**: A task halts if any B1–B8 scenario schedules fewer events after
it than before it. Resume only once the cause is identified and both counts are
written into that task's commit message. Start-time shifts, day reassignments, and
referee changes are expected churn and halt nothing. The gate exists solely to
stop the one failure mode that compounds silently.

## D3: The DE strip footprint stays 16

**Decision**: `DEFAULT_DE_PODS = 4` and `DE_POD_SIZE = 4` collapse into
`DEFAULT_DE_STRIP_FOOTPRINT = 16`.

**Rationale**: The two constants exist only to produce the number 16, and the
empirical `de_duration_table` is calibrated against a 16-strip footprint.
Changing the footprint would require recalibrating the table, which is a separate
piece of work with its own evidence requirements.

## D4: `perBoutDuration` ships without a P1 consumer

**Decision**: Add `perBoutDuration(weapon, category, vet_age_group)` now, called
only by its tests.

**Rationale**: This feature changes `DE_BOUT_DURATION.SABRE` from 10 to 15 and
adds `YOUTH_VET_BOUT_DELTA`. Introducing the helper alongside them pins those
constant changes under test. A pure function has no serialization, no store
field, and no UI binding, so carrying it costs one file – unlike the
`video_stage_mode` config field this feature explicitly defers, which would have
to be threaded through `TournamentConfig`, `buildConfig`, and both serialization
directions before anything read it.

The veteran arm keys off `vet_age_group` rather than `category` so `VET_COMBINED`
is covered and the helper does not depend on how a veteran event happens to set
its category.

## D5: `teamDeStripHours` is left alone

**Decision**: The capacity collapse touches only the individual-event estimators.

**Rationale**: `teamDeStripHours` was never selected by the
`de_capacity_estimation` flag – team events always used it – so folding it into
the table-driven model is a separate behavioral change with its own drift.

## D6: The 5-minute grid lands last

**Decision**: `SLOT_MINS` 30 → 5 is the final behavior change, after the pod,
capacity, and duration work.

**Rationale**: It is the single change most likely to move every scenario, so it
must be reviewable alone against a ledger the earlier tasks have already
stabilized. Expected churn is *favorable* – deferred phases resume at the true
earliest free moment rather than rounding up to the next half hour, so start
times should move earlier and scheduled counts hold or rise. A scenario that
schedules fewer events on a finer grid is a genuine finding.

## Risks

- **Capacity collapse drift**. Moving SINGLE_STAGE capacity from the bout-based
  scaled model to the flat table formula is the least behavior-preserving change
  here, and it feeds day-assignment penalties on exactly the scenarios (B4, B6)
  that are already density-tight.
- **The referee correction is user-visible**. Staged-DE demand rises roughly 4×
  on every NAC scenario. `RefRequirementsReport` and its tests move with it.
- **Compounding drift**. Mitigated by the per-task ledger review and the drift
  gate rather than by hoping the total stays small. P2 re-baselines the
  integration floors regardless, since B1's floor of 14 is already stale against
  an actual 24.
- **`grep -rni "pod"` false positives**. Words like "podium" would trip the
  acceptance sweep. There are none today – confirm rather than assume.
