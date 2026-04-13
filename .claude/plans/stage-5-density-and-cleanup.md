# Stage 5: Scheduling Density — Diagnose and Fix Remaining Failures

## Context

DSatur graph coloring (Stages 1-3) improved day assignment significantly. Stage 4 baselines show 5/7 scenarios improved, but three scenarios remain problematic:

| Scenario | Scheduled | Total | Issue |
|----------|-----------|-------|-------|
| B3: Mar 2026 NAC | 5 | 24 | Stall (+1 from old) |
| B5: Jan 2026 SJCC | 3 | 12 | Regression (-1 from old) |
| B7: Oct 2025 NAC | 4 | 18 | Stall (0 from old) |

**Root cause hypothesis:** DSatur's load balancing counts events, not capacity. `LOAD_BALANCE_FULLNESS = 0.5` per event means a 320-fencer D1 event and a 10-fencer Y8 event contribute equally. This over-packs days with large events that exhaust strip capacity intra-day.

**Evidence from capacity math:**
- B7: D1-M-EPEE and JR-M-EPEE each need 46 pools (46 strips). Strip cap is 64 (80 x 0.80). One event consumes 72% of pool capacity. Two such events can't overlap pools.
- B3: Y14-M-SABRE needs 40 pools. Similar saturation.
- B5: JR/CDT hard separation forces 6+6 split across 3 days. DSatur may compress to 2 effective days, over-packing.

The capacity estimation machinery already exists in `capacity.ts` (`estimateCompetitionStripHours`, `weightedStripHours`, `categoryWeight`). It just isn't wired into DSatur's color selection.

---

## Files to Modify

| Action | File |
|--------|------|
| Modify | `src/engine/dayColoring.ts` |
| Modify | `__tests__/engine/dayColoring.test.ts` (if exists) |

---

## Task 1: Diagnostic — Instrument Integration Tests

Before changing the algorithm, confirm the hypothesis by adding structured failure output to the integration test run.

### Add diagnostic logging to `scheduleAll` or integration test helper

After `scheduleAll()` returns, log per-day stats:
- Events assigned per day (from coloring)
- Total estimated strip-hours per day (using `estimateCompetitionStripHours`)
- Available strip-hours per day (`config.strips_total * config.DAY_LENGTH_MINS / 60`)
- Fill ratio per day
- Number of events that failed and their failure cause (from bottlenecks: STRIPS vs REFS vs TIME vs DEADLINE_BREACH)
- `effectiveDays` from the coloring step

**Output format:** console table or structured object, readable in test output.

**Goal:** Confirm that failing scenarios have days with fill ratio > 1.0 (over-packed by coloring). If failures are evenly distributed across days with low fill ratios, the hypothesis is wrong and a different fix is needed.

---

## Task 2: Capacity-Aware Load Balancing in DSatur

### Problem

`colorPenalty()` in `dayColoring.ts` (line 192-197) uses flat per-event counting:

```ts
if (loadBalance) {
  let eventsOnDay = 0
  for (const day of coloring.values()) {
    if (day === c) eventsOnDay++
  }
  total += eventsOnDay * LOAD_BALANCE_FULLNESS
}
```

### Fix

Replace flat event count with capacity-weighted load balancing. Use the existing `estimateCompetitionStripHours` from `capacity.ts` to weight each event by its resource footprint.

**Changes to `dayColoring.ts`:**

1. Import `estimateCompetitionStripHours` from `./capacity.ts`
2. In `assignDaysByColoring`, precompute strip-hours per competition (alongside `packingFootprint`)
3. Pass the strip-hours map and config into `dsaturLoop` and `colorPenalty`
4. In `colorPenalty`, when `loadBalance` is true, replace flat counting with:
   - Sum strip-hours already assigned to proposed day `c`
   - Compute fill ratio: `sumStripHours / dayCapacity` where `dayCapacity = strips_total * DAY_LENGTH_MINS / 60`
   - Apply a capacity penalty curve (reuse `CAPACITY_PENALTY_CURVE` from `constants.ts` or a simpler version)
   - This naturally penalizes placing a 46-strip event on a day that already has 40 strip-hours consumed

**Key design constraint:** The penalty must be strong enough to prevent day over-packing but weak enough that hard-constraint satisfaction still takes priority. Start with a simple linear penalty (`fillRatio * CAPACITY_WEIGHT`) and tune from there.

**Do NOT change Phase 1** (chromatic number discovery). Only Phase 2 (load balancing) should use capacity-aware penalties.

### Tests

- Verify B3, B5, B7 baselines improve (more events scheduled)
- Verify B1, B2, B4, B6 baselines don't regress
- Unit test: given two days where day 0 has a 300-fencer event and day 1 is empty, coloring should prefer day 1 for the next large event (assuming no hard constraint blocks it)

---

## Verification

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1
```

**Success criteria:**
- B3 scheduled count > 5 (was 5)
- B5 scheduled count >= 4 (was 3, old baseline was 4)
- B7 scheduled count > 4 (was 4)
- B1, B2, B4, B6 scheduled counts do not decrease