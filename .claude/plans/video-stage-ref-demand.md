# Video-Stage DE Ref Demand

## Context

Referee estimation and post-schedule diagnostics ignore DE-phase demand entirely. `recommendRefCount()` only considers pool rounds, and `postScheduleDayBreakdown()` doesn't report video-stage ref contention. This understates ref requirements for NAC tournaments with staged DEs.

---

## Task 1: Add DE ref demand to `recommendRefCount()`

**Problem:** `recommendRefCount()` (`src/engine/stripBudget.ts:47-74`) only considers pool-phase demand. DE phases need 1 ref per strip + pod captains, which can exceed pool demand for large events.

**Change:**
- After computing pool-based ref peaks, compute DE-based ref peaks using the same top-2-per-weapon-class approach
- Reuse `peakDeRefDemand()` from `src/engine/refs.ts:75-103` for per-competition DE demand
- Return `max(poolPeak, dePeak)` per weapon class (pools and DEs don't overlap within a single competition)
- For staged DEs specifically, also factor in video-stage ref demand (R16/finals strips) as a separate concurrent demand since video stages from different competitions can overlap

**Files:** `src/engine/stripBudget.ts`, tests in `__tests__/engine/stripBudget.test.ts`

---

## Task 2: Add DE ref demand to `postScheduleDayBreakdown()`

**Problem:** `postScheduleDayBreakdown()` (`src/engine/scheduler.ts:401-429`) uses `Math.max(poolDemand, deDemand)` per competition but doesn't separately report video-stage ref contention from multiple staged DEs on the same day.

**Change:**
- After the existing per-competition loop, add a second pass that sums video-stage ref demand across all staged-DE competitions on the day
- Emit an additional diagnostic line when video-stage ref demand exceeds available refs (e.g. "Video-stage DE ref demand: N refs across M staged events")

**Files:** `src/engine/scheduler.ts`

---

## Verification

- `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
- Unit tests for updated `recommendRefCount()` covering staged-DE scenarios
