# Plan E: Per-Event Strip Limits & Resource Recommendations

## Problem

The engine has no per-event cap on strip usage. A 380-fencer event with 54 pools can monopolize all strips during its pool phase, preventing concurrent events from starting. The current flighting trigger (200+ fencers, restricted to Cadet/Junior/DIV1) is an arbitrary threshold that doesn't reflect actual resource constraints.

Users also lack guidance on how many strips and referees they need — they guess, configure, and then discover bottlenecks after scheduling.

## Design

### Strip Budget Model

Two global settings on `TournamentConfig` (user-editable, stored with tournament config):

- `max_pool_strip_pct`: fraction of `strips_total` any single event may use for pools. Default **0.80**.
- `max_de_strip_pct`: fraction of `strips_total` any single event may use for DEs. Default **0.80**.

Effective caps computed as:
- `pool_strip_cap = floor(strips_total × max_pool_strip_pct)`
- `de_strip_cap = floor(strips_total × max_de_strip_pct)`

Per-event overrides: each `Competition` gets nullable `max_pool_strip_pct_override` and `max_de_strip_pct_override` fields (fractions, same units as the global setting). When set, they replace the global percentage for that event. Examples: set to `1.0` to let JME use all strips, or `0.5` to constrain a specific event to half.

### Strip Count Recommendation

`recommendStripCount(competitions, maxPoolStripPct)`:
- Find the competition with the most pools (`maxPools`).
- Return `ceil(maxPools / maxPoolStripPct)`.
- Example: largest event has 54 pools, 80% cap → recommend `ceil(54 / 0.8) = 68` strips.

Presented to the user as: "You need at least 68 strips so your largest event (JME, 54 pools) uses at most 80% of available strips."

User adjusts strip count. Engine re-computes caps and flags or unflags flighting candidates.

### Referee Recommendation

User answers two operational questions first:
1. **Refs per pool**: 1 or 2?
2. **Pod captains for DEs**: yes or no?

These determine resource requirements — they don't affect scheduling speed, only bottleneck detection.

`recommendRefCount(competitions, refsPerPool)`:
- For each weapon class, sum the two largest events' pool counts as the peak demand estimate:
  - `peakSaberPools` = sum of top-2 sabre events' `n_pools`
  - `peakFoilEpeePools` = sum of top-2 foil/epee events' `n_pools`
- 3-weapon refs cover sabre demand first: `threeWeaponRefs = ceil(peakSaberPools × refsPerPool)`
- Remaining foil/epee demand: `foilEpeeRefs = max(0, ceil(peakFoilEpeePools × refsPerPool) - threeWeaponRefs)`
- Output: `{ three_weapon: threeWeaponRefs, foil_epee: foilEpeeRefs }`

Rationale for "top-2": two events of the same weapon class commonly overlap on a day. Summing all events is unrealistic (they're spread across days); using only the largest misses concurrent demand.

### Flighting Trigger (Replaces Current Model)

**Remove**: `FLIGHTING_ELIGIBLE_CATEGORIES` and `FLIGHTING_MIN_FENCERS` from `constants.ts`.

**New trigger**: an event is a flighting candidate when `n_pools > pool_strip_cap`. Any category, any fencer count. The math self-regulates — small events on large venues never exceed the cap.

When triggered, suggest splitting into two flights, each fitting within the cap. Flight strip allocations use existing `FlightingGroup` mechanics (`strips_for_priority`, `strips_for_flighted`).

Users can:
- Accept the flighting suggestion (default)
- Reject it and override the event's strip cap to 100% (event uses all strips, runs slower but unflight)
- Adjust flight splits manually

### Scheduler Integration

`estimatePoolDuration` and `earliestResourceWindow` in `scheduleOne.ts` currently use `config.strips_total` for pool parallelism. Change to use the per-event effective cap:

```
effectivePct = competition.max_pool_strip_pct_override ?? config.max_pool_strip_pct
effectiveCap = floor(config.strips_total × effectivePct)

parallelism = min(n_pools, effectiveCap, staffableStrips)
```

DE strip validation: `de_round_of_16_strips` and `de_finals_strips` are already per-event fields. Add validation that they don't exceed `de_strip_cap` (warn, don't hard-block — user may have overridden).

## Files Changed

| File | Change |
|------|--------|
| `src/engine/types.ts` | Add `max_pool_strip_pct`, `max_de_strip_pct` to `TournamentConfig`. Add `max_pool_strip_pct_override`, `max_de_strip_pct_override` to `Competition`. |
| `src/engine/stripBudget.ts` (new) | `computeStripCap()`, `recommendStripCount()`, `recommendRefCount()`, `flagFlightingCandidates()` |
| `src/engine/constants.ts` | Remove `FLIGHTING_ELIGIBLE_CATEGORIES`, `FLIGHTING_MIN_FENCERS` |
| `src/engine/analysis.ts` | Replace category/fencer-count flighting logic with strip-budget trigger |
| `src/engine/scheduleOne.ts` | Pool parallelism respects per-event strip cap |
| `src/engine/pools.ts` | `estimatePoolDuration` accepts effective strip cap instead of `strips_total` |
| `src/engine/validation.ts` | Validate DE strip fields against `de_strip_cap` |
| `src/store/buildConfig.ts` | Wire new config fields from store |
| `__tests__/engine/stripBudget.test.ts` (new) | Tests for recommendation and cap functions |
| `__tests__/engine/analysis.test.ts` | Update flighting suggestion tests |
| `__tests__/engine/scheduleOne.test.ts` | Tests for capped pool parallelism |
| `METHODOLOGY.md` | Document strip budget model, updated flighting trigger, recommendation logic |

## What Doesn't Change

- Day assignment / capacity penalties (Plan D) — unaffected
- Crossover, proximity, separation penalties — unaffected
- DE staged block mechanics — unaffected (DE strip fields are per-event already)
- Referee allocation during scheduling — unaffected (recommendation is advisory only)
