# Engine Contract: scheduling around pinned events

The one engine change in this feature. Mechanism and reasoning are in
[research.md D1](../research.md); this file states what a caller may rely on.

## Entry point

```text
scheduleAll(competitions, config, pinned = []): ScheduleAllResult
```

`pinned` is a list of `PinnedPlacement`:

| Field | Meaning |
|---|---|
| `competition_id` | Must name one of `competitions` |
| `day` | `0 ≤ day < config.days_available` |
| `start_time` | An absolute scheduler-axis minute, computed by the caller as `dayStart(day, config) + (clock start − that day's clock start)`. In the app that is `day × 1440 + clock start`. The engine never converts axes |
| `strip_count` | The placement's pool strip budget. Advisory: the engine caps it as it caps any event |

A pin naming a competition not in the list, or a day outside the range, is a
caller error. `runScheduleAll` filters both before the call.

## Guarantees

1. **Fixed.** For every pin, `result.schedule[id].assigned_day === day` and
   `pool_start === start_time`. Never deferred, never retried, never dropped.
2. **Kept off its day.** No event joined to a pinned event by a hard
   (`Infinity`) edge of the constraint graph is assigned the pin's day, unless
   the colouring's existing least-bad-colour fallback fires, in which case the
   existing `UNAVOIDABLE_CROSSOVER_CONFLICT` warning names the pair.
3. **Packed around.** Every strip interval an auto-placed phase claims is
   disjoint from the intervals the pins claimed. The engine chooses which
   strips a pin claims; the result does not report them to the store.
4. **Unclaimed is reported.** A pin whose phase cannot claim strips at its
   time keeps its day and start, claims nothing for that phase, and produces
   one WARN bottleneck with cause `PINNED_UNCLAIMED` naming the event and
   phase. The store's lane packer reports the same collision as an Unplaced
   finding.
5. **Unmoved without pins.** With `pinned` empty, every field of
   `ScheduleAllResult` is identical to the result before this feature on every
   B1–B8 scenario. The drift ledger asserts this.
6. **Bounded.** The pre-claim pass makes exactly one allocation attempt per
   phase per pin. No new loop is unbounded (constitution IV).

## Not guaranteed

- **Sequencing onto a pin.** A pinned team event is committed before its
  unpinned individual counterpart is placed, so the individual is not held
  before it, and likewise for a pinned Vet sibling. The same limitation as
  the unchecked crossover gap on hand placements (014's E3).
- **Crossover between two pins.** Two pins that a hard edge forbids from
  sharing a day both keep their day. No finding reports it in this feature.
- **A narrower claim.** A phase that cannot claim its full strip count at its
  time claims nothing for that phase. The store's lane packer, not the
  engine, is the surface that reports the collision.

## What the caller does with the result

`runScheduleAll` keeps every pinned placement exactly as it was in the store,
takes auto placements from the result for every other event with a pool
start, returns `{ placed, unplaced }`, and stamps `lastAutoRun`.

## Callers

| Caller | Passes pins |
|---|---|
| `src/store/runActions.ts` | yes, from placements with `pinned: true` and an in-range day |
| `src/engine/stripSearch.ts` (via `computeSuggestedStrips`) | yes, the same list, so the suggested minimum is measured around the pins |
| `__tests__/engine/driftLedger.test.ts`, `__tests__/helpers/appPath.ts` | no – two arguments, unchanged |

## Pure engine additions beside it

| Function | Home | Contract |
|---|---|---|
| `estimateEventFootprint(competition, config)` | `src/engine/derive.ts` | `{ strips, poolMinutes, deMinutes }` from a synthetic placement; agrees with `deriveEventSchedule` by construction |
| `resolveRefsPerPool` | `src/engine/pools.ts` | already exported; read by the Strips panel with `nPools = 1` |
