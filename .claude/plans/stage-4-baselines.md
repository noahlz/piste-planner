# Stage 4: Integration Baselines

> **For agentic workers:** This stage is primarily diagnostic. Run tests, record results, assess.

**Goal:** Record new B1-B7 integration baselines and assess whether scheduling density improved.

**Parent plan:** [valiant-crafting-locket.md](valiant-crafting-locket.md)
**Prerequisite:** Stage 3 complete, full test suite green

---

## Task 1: Record New Baselines

### Steps

- [ ] **Step 1:** Run full test suite: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
- [ ] **Step 2:** Run integration tests with output: `timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts 2>&1 | grep '→'`
- [ ] **Step 3:** Fill in the results table below.

### Results

| Scenario | Events | Old Sched | Old Err | New Sched | New Err | Delta |
|----------|--------|-----------|---------|-----------|---------|-------|
| B1: Feb 2026 NAC | 24 | 2 | 22 | | | |
| B2: Nov 2025 NAC | 24 | 4 | 20 | | | |
| B3: Mar 2026 NAC | 24 | 4 | 20 | | | |
| B4: Jan 2026 SYC | 30 | 4 | 26 | | | |
| B5: Jan 2026 SJCC | 12 | 4 | 8 | | | |
| B6: Sep 2025 ROC | 54 | 3 | 51 | | | |
| B7: Oct 2025 NAC | 18 | 4 | 14 | | | |

---

## Task 2: Assess and Adjust

- [ ] **Step 1:** If scheduling density improved, update any test assertions that encode specific counts.
- [ ] **Step 2:** If density is unchanged, investigate whether the bottleneck moved to:
  - `earliestResourceWindow()` search limits (`MAX_RESCHEDULE_ATTEMPTS = 3`, giving 16 iterations)
  - Ref availability
  - Strip contention on high-density days
- [ ] **Step 3:** Document findings and next steps below.

### Assessment

_To be filled in after running._

### Next Steps

_To be filled in based on assessment._

---

## Cleanup

- [ ] Remove `__tests__/engine/coloringValidation.test.ts` (Stage 2 validation test) if no longer needed
- [ ] Confirm `dayAssignment.ts` penalty functions are now dead code but not deleted (per source spec)
