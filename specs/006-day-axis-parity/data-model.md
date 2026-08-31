# Data Model: Day-Axis Parity

**Feature**: 006-day-axis-parity | **Date**: 2026-08-31

No type gains or loses a field. What changes is the **meaning of the numbers**
in two existing structures, and where the boundary between the two meanings sits.

## The two axes

| | Clock axis | Scheduler axis |
|---|---|---|
| Unit | Minutes from midnight, 0–1439 | Minutes from the tournament's first midnight |
| Day *d* spans | `[day_start_time_d, day_end_time_d)` | `[d*1440 + day_start_time_d, d*1440 + day_end_time_d)` |
| Who authors it | The user, through the day-hours controls | Nobody. It exists only inside a scheduling run. |
| Who reads it | Store, canvas, schedule table, tooltip, shared link, every derived value | `scheduleAll` and everything under it |
| Conversion | — | `clock = scheduler_time − day × 1440` |

Today the store hands the scheduler *clock*-axis windows. That is the defect:
the scheduler treats them as its own axis, all days coincide, and one day's
strip capacity serves the whole tournament ([research.md D1](./research.md)).

## Entities

### DayConfig — `src/engine/types.ts:208`

`{ day_start_time, day_end_time }`, one per day.

- **In the store**: always clock axis. Authored by the user, serialized into the
  shared link, drawn as the canvas's day band. Unchanged by this feature.
- **In a config handed to `scheduleAll`**: scheduler axis.

The same shape carrying two meanings is what made the defect invisible. The
contract that separates them is [`contracts/day-axis.md`](./contracts/day-axis.md).

**Invariants on the scheduler axis** (asserted, not assumed):
1. Windows are pairwise disjoint.
2. Windows are strictly increasing in day index.
3. Window *d* is congruent to the store's day *d* modulo 1440.
4. Every boundary is a multiple of `SLOT_MINS`.

Invariants 1 and 2 are the property whose absence causes the defect: strip
allocations carry no day dimension, so disjointness is the *only* thing keeping
two days off the same strip.

### Placement — the store's schedule state

`{ day, start_time, strip_count, strips, source, pinned }`.

`start_time` is **always clock axis** — before this feature, after it, in the
shared link, and in every rendered view. This does not change. What changes is
that a placement written from a scheduling run has the day offset removed first
(`src/store/runActions.ts:29-36`).

`day` is an index, never a time, and is unaffected.

### ScheduleResult — the engine's per-event output

Every time field (`pool_start`, `pool_end`, `de_start`, the flight and staged-DE
segments, `de_total_end`) is on the axis of the config that produced it.

- Returned by `scheduleAll`: scheduler axis. Converted at the store boundary.
- Returned by `deriveEventSchedule`: clock axis, because it is computed from a
  `Placement`'s clock-axis `start_time` and durations alone, and reads no day
  window ([research.md D4](./research.md)). Unchanged by this feature.

That asymmetry is the reason the canvas and the schedule table need no work: the
values they render come from `deriveEventSchedule`, not from `scheduleAll`.

### Parity record — new

Per reference tournament: the app-path placed-event count, the drift ledger's
scheduled count, and — when they differ — the cause and the feature that closes
it (FR-004a).

- Every entry is asserted. An exception is a *different pinned number*, never an
  unasserted one.
- An entry may differ from the ledger only for a per-competition default the app
  has not yet adopted. A difference traced to the day axis is a failure, not an
  exception.

## What is deliberately not modeled

- **A "day-known, time-unknown" placement.** `runActions` still drops an event
  the scheduler could not place, and it still lands in the unplaced tray. That
  is P4's placement-states work.
- **Day windows that cross midnight.** No control can author one, and the axis
  assumes `day_start_time < day_end_time` within a single day. The invariant
  assertion is where a future violation would surface.
- **Per-day capacity.** Capacity math uses the `DAY_LENGTH_MINS` constant
  (`capacity.ts:211`, `dayColoring.ts:612`) rather than each day's configured
  length. Pre-existing, unchanged here, and worth a backlog entry rather than a
  silent fix inside a drift-sensitive feature.
