# TODOs

> **2026-08-27 update**: The workbench UI design at
> [`2026-08-27-workbench-ui-design.md`](./2026-08-27-workbench-ui-design.md)
> absorbed most of this list – real-tournament presets, the tournament setup
> screen, the FLUID re-pack button, and drag-drop matrix repair are all covered
> by its P1–P5 roadmap.
>
> What remains below is work no phase plan has picked up. The design's "Open
> items carried forward" table lists these same four items with their owner
> phase, and points back here for the detail. **This file is the record, that
> table is the index** – do not restate detail there.

## Per-type defaults in the rail's Advanced panel

*No owner phase. Lands in the rail P3 builds – assign it before P3 is planned.*

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

*No owner phase. P1 creates four of the constants below, so this needs a phase or
an explicit "after P5".*

All engine constants become a configuration file with defaults, reachable from
a gears control in the top bar. Per-event and global weights, penalties, and
earliest-start offsets are all editable. Serialization persists only the
overrides, so unset values continue to track the defaults in `constants.ts`.

Constants that P1 newly surfaces and that belong in this file:

- `SLOT_MINS` (default 5) – scheduling grid resolution.
- `DE_BOUT_DURATION` per weapon – foil 20, épée 20, sabre 15.
- `YOUTH_VET_BOUT_DELTA` (default -5) – applied to Y10, Y8, and Vet for
  10-touch bouts.
- `DEFAULT_DE_STRIP_FOOTPRINT` (default 16) – strips a single event's DE phase
  claims, the footprint `de_duration_table` is calibrated against.

`video_stage_mode` arrives with P5, not P1.

## Youth-event pool duration calibration

B4 currently predicts 5–6 hours for Y8/Y10 events that finish in 2–3 hours in
reality. Recalibrate `pool_round_duration_table`, or add a youth-event
multiplier, once there is evidence about whether the gap closes by
densification or genuinely needs duration recalibration.

P1's Task 6 widens this gap – removing double-stripping raises the duration of
any event whose pool round is a single pool of 8 or more by about 1.67×. That
task records B4's affected durations before and after, so the recalibration
starts from a measured number rather than a re-derived one.

## Calibration debt

- `CAPACITY_TARGET_FILL = 0.3` in `dayColoring.ts` was tuned for the serial
  scheduler that Phase D deleted. The "compensate for serial-scheduler
  underutilization" rationale no longer applies. Re-tune upward against the
  concurrent-scheduler B1–B7 baselines.
- Integration-test floors are stale. B1 asserts at least 14 scheduled events
  while actually scheduling 24 of 24, which makes the assertion nearly vacuous.
  Re-baseline B1–B8 (tracked as part of P2).
