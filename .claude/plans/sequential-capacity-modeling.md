# Sequential Capacity Modeling Experiments

## Context

The capacity scoring model (`dayAssignment.ts:470-495`) treats all events on a day as simultaneous consumers of a strip-hour budget (`totalCapacity = strips_total * DAY_LENGTH_MINS / 60`). But resource allocation (`resources.ts:390-568`) supports sequential slot-based scheduling. This mismatch means capacity scoring over-penalizes days, spreading events across too many days and preventing dense same-day scheduling.

Real tournaments run 6-8 events per day on 40-80 strips by staggering start times. The engine can't replicate this because capacity scoring doesn't model staggering.

Integration test baselines show the scale of the problem:

| Scenario | Events | Scheduled | Errors |
|----------|--------|-----------|--------|
| B1: Feb 2026 NAC | 24 | 2 | 22 |
| B2: Nov 2025 NAC | 24 | 4 | 20 |
| B3: Mar 2026 NAC | 24 | 4 | 20 |
| B4: Jan 2026 SYC | 30 | 4 | 26 |
| B5: Jan 2026 SJCC | 12 | 4 | 8 |
| B6: Sep 2025 ROC | 54 | 3 | 51 |
| B7: Oct 2025 NAC | 18 | 4 | 14 |

---

## Experiment A: Peak-concurrent strip demand metric

Replace strip-hour fill ratio with a peak-concurrent-strip estimate:
- For each candidate day, estimate peak concurrent strip demand by summing per-competition strip demands weighted by estimated time overlap
- Use `estimateStartOnDay()` (already exists at `dayAssignment.ts:550-584`) to get approximate start times
- Compute overlap windows: if event A runs pools 8:00-12:00 using 20 strips and event B runs pools 10:00-14:00 using 15 strips, peak concurrent = 35 strips during 10:00-12:00
- Compare peak concurrent to `strips_total` instead of comparing cumulative strip-hours to total capacity

**Measure:** Run integration tests, compare scheduled-event counts and error counts across B1-B7.

---

## Experiment B: Two-pass day assignment

Current approach: assign day, then allocate resources. Events assigned based on capacity estimates that don't account for actual staggering.

Alternative:
1. First pass: assign days using current capacity scoring (rough bin-packing)
2. Second pass: for each day, simulate sequential resource allocation to check feasibility. If a day is over-packed, move the lowest-priority event to another day
3. Repeat until stable or max iterations reached

**Measure:** Same integration test comparison.

---

## Experiment C: Time-block day model

Split each day into 2-3 time blocks (morning/afternoon/evening). Events are assigned to day + block. Capacity scoring operates per-block. Most invasive change but most closely models reality.

**Measure:** Same integration test comparison.

---

## Recommended order: A → B → C (stop when improvement is sufficient)

**Files:** `src/engine/capacity.ts`, `src/engine/dayAssignment.ts`, `__tests__/engine/integration.test.ts`

## Verification

- Record baseline scheduled/error counts from integration tests before any changes
- After each experiment, compare counts — update integration test assertions if improvements are real
- `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
