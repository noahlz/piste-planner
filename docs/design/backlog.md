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

*Found by feature 006 on 2026-08-31 while classifying its parity exceptions,
assigned to feature 008, done 2026-08-31.*

Two of the eight reference tournaments, B2 and B8, scheduled **nothing** – not
a partial schedule, an empty one. Every tournament containing team events was
affected, so this was a live product defect rather than a calibration gap:
`defaultConfigForId` derived a competition's cut from `DEFAULT_CUT_BY_CATEGORY`
with no `event_type === TEAM` branch, so a team event reached the engine
carrying a percentage cut, tripped the `cut-on-team` BINDING error, and one
BINDING error discarded the entire tournament's schedule. The full record,
including the isolation method and the store-side helper that now derives the
default, is [`specs/008-team-event-cut/`](../../specs/008-team-event-cut/);
B8's residual gap against the drift ledger is
[`b8-residual.md`](../../specs/008-team-event-cut/b8-residual.md).

Measured: B2 went from 0 to 24, the drift ledger's exact count, removing its
FR-004a exception. B8 went from 0 to 53, one above the ledger's 52, so its
exception was rewritten around the +1 rather than deleted. Two of the ten
shipped templates went from an empty board to a real schedule –
`NAC Cadet/Junior` (24 selected, 10 placed) and `Junior Olympics` (18
selected, 9 placed). The other two team-bearing templates, `NAC Div1/Junior`
(24 selected) and `NAC Vet/Div1/Junior` (66 selected), stay at 0 – blocked by
a different, unrelated BINDING rule detailed below, not by the defect this
feature fixes. No `src/engine/` change, and the drift ledger snapshot is
byte-identical to `main`.

**What 008 deliberately did not fix**, so a later session does not have to
rediscover these:

- **`ROC Mega` also placed nothing, and has no team event.** Its cause is a
  strip-hour capacity shortfall reported by `validateConfig` in BINDING mode,
  triggered by `suggestStrips()` under-recommending strips for 42 events – a
  different defect that reaches an empty board by the same "one BINDING error
  discards the whole schedule" architecture. `ROC Mega` staying at 0 after this
  feature is expected and correct, not a regression. Measured in
  [`baseline.md`](../../specs/008-team-event-cut/baseline.md).
- **`NAC Div1/Junior` and `NAC Vet/Div1/Junior` stay at 0, and this feature's
  fix is not implicated.** Isolation found zero `cut-on-team` findings on
  either template – every TEAM competition on both carries `DISABLED`/`100`.
  Both are gated instead by two BINDING errors from a different rule,
  `indiv-team-same-day` (`src/engine/validation.ts:272-310`): `Individual
  D1-M-EPEE-IND + team D1-M-EPEE-TEAM worst-case same-day duration 855 min
  exceeds DAY_LENGTH_MINS 840 min` and `Individual D1-W-EPEE-IND + team
  D1-W-EPEE-TEAM worst-case same-day duration 860 min exceeds
  DAY_LENGTH_MINS 840 min` – 15- and 20-minute overruns on the same two Div1
  épée pairs in both templates (`NAC Vet/Div1/Junior` is a superset
  containing Div1; its 42 Veteran competitions contribute nothing).
  `NAC Cadet/Junior` has zero ERRORs here because its Cadet and Junior épée
  pairs stay under 840. Read from source, not measured: the rule computes a
  hypothetical worst case – individual total + `INDIV_TEAM_MIN_GAP_MINS` +
  team total, assuming both land on the same day – and `days_available`
  appears nowhere in `validateTimingConstraints`, so it fires identically on
  a 1-day and a 5-day tournament even though the scheduler is free to
  separate the pair across days. It reaches an empty board through the same
  "one BINDING error discards the whole schedule" amplifier as `ROC Mega`
  (`src/engine/concurrentScheduler.ts:186-204`). A fix would touch, weakest
  option last: the rule's severity – it is emitted via `policy()`
  (`validation.ts:299-305`), which maps to ERROR under BINDING
  (`validation.ts:25-29`), and demoting it to `notice()` would let the
  scheduler place what it can and separate the pair across days, verified at
  the source; the all-or-nothing gate itself
  (`concurrentScheduler.ts:186-204`) – the finding carries its two
  implicated competitions as `subjects`, so dropping or deferring only those
  would fix the class rather than the instance and would cover `ROC Mega`
  too, though this is reasoning inherited from `baseline.md` and the
  dispatch, since the isolation run never opened `concurrentScheduler.ts` to
  verify the mechanism; or the Div1 épée default fencer counts
  (`D1-M-EPEE-IND` 310, `D1-W-EPEE-IND` 210) against `DAY_LENGTH_MINS` 840 –
  weakest, since it tunes a number to dodge a rule rather than fixing it, and
  the counts are user-editable so a user raising them re-breaks it. The
  diagnosis is verified; the outcome of any fix is untested, since nothing
  was changed and re-measured. Out of `src/engine/`, which this feature's
  hard constraint puts out of scope.
- **`src/engine/catalogue.ts:217`'s comment is wrong about its own count.** It
  claims `NAC Vet/Div1/Junior` selects 36 events; the measured count is 66,
  because Veteran individual events expand to six age groups. Left alone
  because `src/engine/` was outside this feature's hard constraint, not
  because it is right.
- **B8's +1 over the ledger stays open**, attributed by isolation to the
  ledger's `de_mode` and `strips_allocated` acting together – neither alone
  moves the count. It is 004 US4's, along with **B4 and B6**, which remain
  FR-004a exceptions, untouched.
- **`__tests__/helpers/scenarios.ts`'s copy of the team-event branch is
  deliberate, not debt.** Converging it on the store's helper would make the
  app-path parity check true by construction and destroy the instrument that
  found this bug. The reasoning is
  [research.md D2](../../specs/008-team-event-cut/research.md).

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
