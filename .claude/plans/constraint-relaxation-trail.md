# Constraint-Relaxation Trail

## Context

When a competition fails after exhausting all constraint relaxation levels, the bottleneck list does not report which levels were attempted or why each failed. `assignDay()` only records the final successful level. This makes it impossible to distinguish "barely relaxed" from "needed drastic relaxation" and provides no diagnostic trail when scheduling fails entirely.

---

## Task: Record relaxation trail in `assignDay()`

**Problem:** `assignDay()` (`src/engine/dayAssignment.ts:752-793`) iterates levels 0-3 but only records a single `CONSTRAINT_RELAXED` bottleneck for the final successful level.

**Change:**
- Before the `throw` at line 789, build a trail message listing each level attempted and the reason it failed (e.g. "Level 0: 0 valid days (all Infinity), Level 1: 0 valid days, Level 2: 0 valid days, Level 3: 0 valid days")
- Include the trail in the `SchedulingError` message
- Record a `CONSTRAINT_RELAXED` bottleneck with severity INFO for each intermediate level that was tried and failed (not just the final successful level)
- Add `relaxation_trail` to the bottleneck message for the final error so it appears in post-schedule diagnostics

**Files:** `src/engine/dayAssignment.ts`, tests in `__tests__/engine/dayAssignment.test.ts`

---

## Verification

- `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
- Unit tests: force all levels to fail and assert trail appears in error message and bottlenecks
- Unit tests: partial relaxation (e.g. level 0 fails, level 1 succeeds) records intermediate INFO bottleneck
