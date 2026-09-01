# Backlog

Work no phase plan has picked up. Items here are not tracked in `specs/` – a
Spec Kit feature directory is created for one only when it is assigned a phase.

> **2026-08-27 update**: The workbench UI design at
> [`competition-planner-workbench.md`](./competition-planner-workbench.md)
> absorbed most of this list – real-tournament presets, the tournament setup
> screen, the FLUID re-pack button, and drag-drop matrix repair are all covered
> by its P1–P5 roadmap.
>
> What remains below is work no phase plan has picked up. The design's "Open
> items carried forward" table lists these same four items with their owner
> phase, and points back here for the detail. **This file is the record, that
> table is the index** – do not restate detail there.

## Day-axis parity

*Assigned to feature 006 on 2026-08-31, done 2026-08-31. Unblocked 004's US3.*

The app path (`applyPreset → buildTournamentConfig → scheduleAll`) scheduled
11 of B1's 24 events while the drift ledger's factory path scheduled 24/24 —
the store's clock-time `dayConfigs` collided on the engine's compacted day
axis. The record, with repro, isolation numbers, and fix options, is
[reassessment-2026-08-31.md §2](./reassessment-2026-08-31.md). The full
feature record, including the app-path parity test that now protects the app
rather than a config it never builds, is
[`specs/006-day-axis-parity/`](../../specs/006-day-axis-parity/); the
store↔engine axis invariants it enforces are
[`contracts/day-axis.md`](../../specs/006-day-axis-parity/contracts/day-axis.md).

**What 006 deliberately did not fix**, so a later session does not have to
rediscover these:

- **Per-day capacity math still uses the `DAY_LENGTH_MINS` constant**, not the
  per-day windows 006 introduced — `dayRemainingCapacity`
  (`src/engine/capacity.ts:211`) and the DSATUR day-assignment loop
  (`src/engine/dayColoring.ts:612`) both compute a day's strip-hour budget as
  `strips_total × DAY_LENGTH_MINS / 60`, a fixed per-day length rather than
  that day's own configured hours. 006's axis fix reconciled where events
  land; it did not touch how much capacity a day is credited with. A
  tournament whose days have unequal lengths (spec.md's own edge case) is
  scheduled correctly today only because no reference tournament yet
  discriminates the two — this is a latent gap, not a verified-safe one.
- **Placement states for partial knowledge** — unplaced /
  day-known-time-unknown / placed / pinned — stay parked at P4, per the
  §Revised sequence table in
  [`competition-planner-workbench.md`](./competition-planner-workbench.md).
- **`findAvailableStripsInWindow`'s `day` argument guard has one residual
  gap.** T015 states the day-inference precondition (`src/engine/resources.ts`
  comments, no behavior change) and `__tests__/engine/resources.test.ts`
  backstops it two ways: a `vi.spyOn` over a real multi-day `scheduleAll` run,
  and a static arity check per call site in `concurrentScheduler.ts`. An
  explicit `undefined` passed in the `day` position keeps the call's arity at
  7 and slips past the static backstop at the STAGED-DE precheck call site
  (`concurrentScheduler.ts:902`), which the spy cannot reach (it only fires
  when a DE node doesn't fit before `dayHardEnd`, which no ordinary scenario
  run triggers). The consequence is bounded — an unreached `day` value feeds
  only the `reason` ternary in `findAvailableStripsInWindow`, so no scheduling
  outcome moves — but a `TIME` shortfall could be relabeled `STRIPS` there,
  manufacturing a spurious `STRIP_CONTENTION` bottleneck
  (`concurrentScheduler.ts:727`) that tells an organizer to add strips when
  the day was the real constraint. Documented in the test file's own comment
  block above the guard's `describe`.

## Team events block their whole tournament

*Found by feature 006 on 2026-08-31 while classifying its parity exceptions.
Not fixed there — 006 was scoped to the day axis. User directive 2026-08-31:
fix after 004's S6.*

Two of the eight reference tournaments, B2 and B8, schedule **nothing** — not
a partial schedule, an empty one. Every tournament containing team events is
affected, so this is a live product defect rather than a calibration gap.

`defaultConfigForId` (`src/store/store.ts:220,229`) derives a competition's
cut from `DEFAULT_CUT_BY_CATEGORY` with no `event_type === TEAM` branch, so a
team event reaches the engine carrying a percentage cut. `cut-on-team`
(`src/engine/validation.ts:158`) is a BINDING error, and
`scheduleAllConcurrent` returns an empty schedule when any BINDING error is
present (`src/engine/concurrentScheduler.ts:186-204`) — so one misconfigured
team event discards the entire tournament's schedule. The drift ledger's own
factory has the branch (`__tests__/helpers/scenarios.ts:35-37`), which is why
the ledger path never saw this.

Measured, not inferred: forcing `cut_mode = DISABLED` on B2's six team events
alone takes it from 0 to 24, the ledger's exact count; B8's five take it from
0 to 53, one *above* the ledger's 52. Evidence and per-scenario detail are in
[`parity-exceptions.md`](../../specs/006-day-axis-parity/parity-exceptions.md);
B2's and B8's rows in `__tests__/store/appPathParity.test.ts` are pinned at 0
with this as their recorded FR-004a cause.

**This is not a per-tournament-type default, and does not belong in 004's
US4.** US4 fills in what a *tournament type* implies — `RefPolicy.AUTO`,
`de_mode` at NAC, video strips — and its task list (T055–T068) has no
`cut_mode` work in it. A Cadet team event needs `DISABLED` whether it is at a
NAC or an ROC, so this is a per-`event_type` default on a different axis.
Filing it under US4 would put it in a table where it does not fit; it wants
its own small feature.

Scope when it is picked up: the `event_type === TEAM` branch, then re-pin
`appPathParity` — B2 to 24, which *removes* an exception since it then matches
the ledger exactly, and B8 to 53, which keeps one for the +1. No engine change,
so the drift ledger is not at risk.

## Rail rebuild

*Assigned to feature 007 on 2026-08-31 (unspecced), after 004 closes.*

The five section components re-homed unmodified into the rail
(`TournamentSetup`, `StripSetup`, `CompetitionMatrix`, `FencerCounts`,
`CompetitionOverrides`) are the surviving wizard/kitchen-sink-era debris:
`CompetitionMatrix` overflows at 320px, day-time selects truncate, and the
top bar and rail both edit tournament type, days, and strips (the
FR-003/FR-004 duplication S2 recorded). User directive 2026-08-31: replace
with purpose-built workbench panels, no preservation effort — tests
re-target to the new panels as they are built, no 005-style triage pass.
Detail in [reassessment-2026-08-31.md §3.5](./reassessment-2026-08-31.md).

## Per-type defaults in the rail's Advanced panel

*Assigned to P3 on 2026-08-29. Specified in
[`specs/004-p3-workbench-shell/`](../../specs/004-p3-workbench-shell/spec.md).
P3 builds the rail, so the Advanced panel is its deliverable rather than a
second pass over it.*

Defaults the Advanced panel should apply when the user picks a tournament type,
shown as dim text on the collapsed panel so they are visible without expanding:

- Referee count: 2 for NAC, SJCC, SYC. 1 for all others.
- Video strips: required for certain NAC events, default count 8. Optional
  elsewhere, user enables and sets the count.
- DE mode: staged for NAC, single-stage for all others.

Separate from the "gears" global-settings surface below. Hard policies (for
example, no Vet Team and Vet Individual on the same day) are not adjustable
here – the user overrides those by placing events manually and accepting the
warning.

## Global settings

*Split on 2026-08-29. The gears control and a first panel are assigned to P3 –
[`specs/004-p3-workbench-shell/`](../../specs/004-p3-workbench-shell/spec.md).
The remainder, described below, stays unassigned and is revisited after P5.*

All engine constants become a configuration file with defaults, reachable from
a gears control in the top bar. Per-event and global weights, penalties, and
earliest-start offsets are all editable. Serialization persists only the
overrides, so unset values continue to track the defaults in `constants.ts`.

**What P3 takes**: the top-bar gears control and a panel over the settings that
already have store and serialization support – the `globalOverrides` trio
(`ADMIN_GAP_MINS`, `FLIGHT_BUFFER_MINS`, `THRESHOLD_MINS`, live in the store and
the share URL since before P3 but reachable from no component) plus the four P1
constants listed below. `PoolDurationSettings` from 002 is the precedent for the
default / override / reset / overrides-only-persistence pattern, and it moves
behind the same gears surface.

**What stays here**: promoting the rest of `constants.ts` – per-event and global
weights, the penalty matrices, category start preferences, earliest-start
offsets – into a user-editable configuration file. That is a feature of its own
size and it needs a spec directory when it is picked up, after P5.

Constants that P1 newly surfaces and that belong in this file:

- `SLOT_MINS` (default 5) – scheduling grid resolution.
- `DE_BOUT_DURATION` per weapon – foil 20, épée 20, sabre 15.
- `YOUTH_VET_BOUT_DELTA` (default -5) – applied to Y10, Y8, and Vet for
  10-touch bouts.
- `DEFAULT_DE_STRIP_FOOTPRINT` (default 16) – strips a single event's DE phase
  claims, the footprint `de_duration_table` is calibrated against.

`video_stage_mode` arrives with P5, not P1.

## Save / load / share browser plumbing

*Specified and cut from
[`specs/005-consolidate-domain-logic/`](../../specs/005-consolidate-domain-logic/spec.md)
on 2026-08-30. Unassigned.*

`SaveLoadShare.tsx` defines its save, load, and share handlers inline: a blob
built and downloaded through a synthetic anchor, a `FileReader` read, a share
URL assembled from `window.location`, a clipboard write, and a 2KB size
threshold. None of it is layout, but all of it is reachable only by rendering
the component, which is why its cases sat in `KitchenSinkPage.test.tsx` and had
to be re-homed rather than pointed at a module.

The serialization underneath is already extracted and already carries 76 tests
in `__tests__/store/serialization.test.ts`. What is left is the browser
plumbing wrapped around it.

Cut from 005 because `SaveLoadShare.tsx` survives 004's T020 deletion – it is
re-homed into the workbench top bar intact – so nothing breaks without the
extraction, and doing it there would have traded a test dependency on one
layout for a dependency on another. Worth picking up when the top bar is
settled and the trade is no longer circular.

## Youth-event pool duration calibration

B4 currently predicts 5–6 hours for Y8/Y10 events that finish in 2–3 hours in
reality. Recalibrate `pool_round_duration_table`, or add a youth-event
multiplier, once there is evidence about whether the gap closes by
densification or genuinely needs duration recalibration.

P1's US2 widens this gap – removing double-stripping raises the duration of any
event whose pool round is a single pool of 8 or more by about 1.67×. Task T037 in
[`specs/001-p1-foundations/tasks.md`](../../specs/001-p1-foundations/tasks.md)
records B4's affected durations before and after, so the recalibration starts
from a measured number rather than a re-derived one.

## Configurable pool round durations

Specified and implemented in
[`specs/002-configurable-pool-durations/`](../../specs/002-configurable-pool-durations/) –
[research.md D4](../../specs/002-configurable-pool-durations/research.md)
records how the table widens so the per-category dimension the youth
calibration (above) may add lands in the same table rather than a second
override system.

## Calibration debt

- `CAPACITY_TARGET_FILL` re-tune: done, in
  [`specs/003-p2-derived-state/`](../../specs/003-p2-derived-state/) –
  [research.md D8](../../specs/003-p2-derived-state/research.md) records the
  measured sweep. 0.3 stands – the sweep was non-discriminating, a structural
  finding rather than a tie. See D8 for the re-tune's precondition.
- Integration-test floors: done, re-baselined in
  [`specs/003-p2-derived-state/`](../../specs/003-p2-derived-state/) –
  [research.md D7](../../specs/003-p2-derived-state/research.md) records the
  measured counts B1–B8 now assert against.
- New candidate: a drift scenario with `days_available` set above the
  chromatic number, so a future `CAPACITY_TARGET_FILL` re-tune has a scenario
  the current B1–B8 set lacks – see research D8's correction for why none of
  today's scenarios can discriminate the constant.
