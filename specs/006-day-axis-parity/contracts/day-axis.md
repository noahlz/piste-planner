# Contract: The Store ↔ Engine Day Axis

**Feature**: 006-day-axis-parity | **Date**: 2026-08-31

The seam this contract describes is the one that failed. It had no test and no
written rule, and three features shipped across it while the app and the drift
ledger measured different tournaments. What follows is the rule, stated so a
future change either honors it or breaks a named assertion.

## The rule

**Everything outside a scheduling run is clock time. Everything inside one is
scheduler time. `buildConfig.ts` and `runActions.ts` are the only two places
that know both.**

## Obligations

### C1 — The config handed to `scheduleAll` carries scheduler-axis day windows

For a tournament with day hours `(start_d, end_d)` authored in the store, the
config's window for day *d* is `[d*1440 + start_d, d*1440 + end_d)`.

Guarantees the scheduler may rely on:

1. **Disjoint** — no two day windows overlap.
2. **Ordered** — window *d* ends before window *d+1* begins.
3. **Congruent** — window *d* reduces to the store's day *d* modulo 1440.
4. **Slot-aligned** — both boundaries are multiples of `SLOT_MINS`.

C1.1 and C1.2 are load-bearing, not stylistic. `strip_allocations` is a flat
per-strip interval list with no day dimension
(`src/engine/resources.ts:57-64`), so disjoint windows are the *only* mechanism
keeping two days off one strip. Violate C1.1 and the tournament silently loses
capacity — which is precisely the defect this feature fixes.

### C2 — A time leaving a scheduling run is converted before it is stored

A `ScheduleResult` time on day *d* becomes a `Placement.start_time` only after
subtracting `d * 1440`. No scheduler-axis value is written into the store,
serialized into a shared link, or rendered.

### C3 — The engine is never handed a clock-axis window

There is no supported configuration in which a `TournamentConfig` reaching
`scheduleAll` has two days sharing a window. An empty `dayConfigs` — the drift
ledger's own form, which puts day *d* at `[d*840, (d+1)*840)` — also satisfies
C1 and stays valid.

### C4 — Nothing outside the two boundary functions reads a day window from an engine config

Day hours drawn on screen come from the store. `deriveEventSchedule` reads no
day window and must not start
([research.md D4](../research.md)) — it is what keeps the canvas, the schedule
table, the tooltip, and the shared link axis-agnostic.

### C5 — The two paths agree

For each reference tournament, the app path (`applyPreset` →
`buildTournamentConfig` → `scheduleAll`) places the number of events the drift
ledger records, except where FR-004a pins a documented per-default difference.
A difference attributable to the day axis is a contract violation.

## How each obligation is held

| | Held by |
|---|---|
| C1 | Assertions on the emitted windows in the store's config tests, covering uniform hours, per-day hours, and the single-day case. |
| C2 | A round-trip test: a scheduled tournament's placements all fall inside their own day's clock hours. |
| C3 | C1's assertions plus the ledger, which exercises the empty-`dayConfigs` form. |
| C4 | Day bands read the store; a test that fails if the canvas starts reading day hours from the derived config. |
| C5 | The app-path parity check over all eight tournaments (FR-004), and the live smoke run's asserted boot count (FR-008). |

## What breaking this looks like

The failure mode has no exception and no error message. Events simply do not get
placed, the unplaced tray fills, and every downstream number — referee peaks,
strip recommendations, scorecard baselines — is computed over a schedule the
engine did not mean to produce. A green suite is not evidence against it; that
is what the eight-tournament parity check is for.
