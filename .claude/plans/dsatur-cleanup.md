# DSatur Cleanup — Dead Code and Obsolete Tests

## Context

The DSatur graph-coloring pipeline (Stages 1-3) replaced the penalty-based day assignment system. The old code is confirmed dead but was intentionally preserved during the transition. Time to clean house.

---

## Files to Modify / Delete

| Action | File |
|--------|------|
| Modify | `src/engine/dayAssignment.ts` |
| Modify | `__tests__/engine/dayAssignment.test.ts` |
| Delete | `__tests__/engine/coloringValidation.test.ts` |

---

## Task 1: Delete Dead Functions from `dayAssignment.ts`

All are only reachable through `assignDay`, which is no longer called from production code:

| Function | Line | Status |
|----------|------|--------|
| `earlyStartPenalty` | 131 | Dead — called only by `totalDayPenalty` |
| `weaponBalancePenalty` | 200 | Dead — called only by `totalDayPenalty` |
| `crossWeaponSameDemographicPenalty` | 244 | Dead — called only by `totalDayPenalty` |
| `lastDayRefShortagePenalty` | 279 | Dead — called only by `totalDayPenalty` |
| `restDayPenalty` | 319 | Dead — called only by `totalDayPenalty` |
| `totalDayPenalty` | 361 | Dead — called only by `scoreAllDays` |
| `estimateStartOnDay` | 550 | Dead — called only by `scoreAllDays` |
| `scoreAllDays` | 590 | Dead — called only by `assignDay` |
| `recordDiagnosticBottlenecks` | 625 | Dead — called only by `assignDay` |
| `assignDay` | 752 | Dead — replaced by `assignDaysByColoring` |

**Keep these (still live):**
- `constraintScore` (line 82) — used by `scheduler.ts` and `refs.ts`
- `findEarlierSlotSameDay` (line 825) — used by `scheduleOne.ts`
- `SchedulingError` class — used by `scheduler.ts` and `scheduleOne.ts`

Also remove now-unused imports in `dayAssignment.ts`: `estimateCompetitionStripHours`, `dayConsumedCapacity` from `capacity.ts` (verify no remaining references after deletions).

---

## Task 2: Delete Dead Test Blocks from `dayAssignment.test.ts`

| Test `describe`/`it` block | Status |
|----------------------------|--------|
| `describe('constraintScore', ...)` | **Keep** — tests live function |
| `describe('totalDayPenalty', ...)` | Delete |
| `describe('earlyStartPenalty', ...)` | Delete |
| `describe('weaponBalancePenalty', ...)` | Delete |
| `describe('restDayPenalty', ...)` | Delete |
| `describe('assignDay', ...)` | Delete |
| `describe('crossWeaponSameDemographicPenalty', ...)` | Delete |
| `describe('lastDayRefShortagePenalty', ...)` | Delete |
| `describe('capacity penalty in totalDayPenalty', ...)` | Delete |
| `describe('findEarlierSlotSameDay', ...)` | **Keep** — tests live function |

Also clean up imports at top of test file — remove anything that referenced deleted functions.

---

## Task 3: Delete `coloringValidation.test.ts`

Delete `__tests__/engine/coloringValidation.test.ts`. Stage 2 validation test whose coverage is subsumed by integration tests (B1-B7) and `dayColoring.test.ts`.

---

## Verification

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

- All tests pass
- No imports of deleted functions remain (grep for `assignDay`, `totalDayPenalty`, `earlyStartPenalty`, etc.)
- `dayAssignment.ts` contains only `SchedulingError`, `constraintScore`, and `findEarlierSlotSameDay`