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
