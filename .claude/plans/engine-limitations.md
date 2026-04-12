## Engine Limitations

### Post-scheduling resource diagnostics — remaining gaps

Per-phase, per-day, and delta messaging were added in 2026-04-12 (commit 02169034). Two gaps remain:

- **Ref estimation skips video-stage DE demand** — `recommendRefCount()` and `postScheduleDayBreakdown` do not account for staged DE video phases; ref demand for NAC events is understated
- **No constraint-relaxation trail** — when a competition fails after exhausting all relaxation levels, the bottleneck list does not report which levels were attempted

---

### Strip/ref resource exhaustion at realistic scale

Strip budget (`stripBudget.ts`), auto-flighting (`flighting.ts`), and capacity-aware day assignment (`dayAssignment.ts`) are all implemented. Despite this, the B1–B7 integration test baselines show the engine cannot fully schedule any realistic tournament. The fundamental bottleneck: a single large event (e.g. 310-fencer Div 1 needing ~45 pools) monopolizes all strips even at the 80% strip cap, leaving no resource windows for other events on the same day.

Flighting halves pool strip demand but 2 flights is the maximum – 3+ flights are not realistic for USA Fencing operations. The likely path forward is ensuring venues configure enough strips for their largest events, and improving the engine's ability to stagger events across time windows within a day.

---

## Integration Test Baseline

Seven integration tests in `__tests__/engine/integration.test.ts` use real USA Fencing tournament data (fencer counts rounded to nearest 10). All pass with current assertions, but the engine cannot fully schedule any at realistic scale.

| Scenario | Events | Scheduled | Errors |
|----------|--------|-----------|--------|
| B1: Feb 2026 NAC (Div 1/Jr/Vet) | 24 | 2 | 22 |
| B2: Nov 2025 NAC (Div 1/Cdt/Y14) | 24 | 4 | 20 |
| B3: Mar 2026 NAC (Y10/Y12/Y14/D2) | 24 | 4 | 20 |
| B4: Jan 2026 SYC (Y8-Y14/Cdt) | 30 | 4 | 26 |
| B5: Jan 2026 SJCC (Cdt/Jr) | 12 | 4 | 8 |
| B6: Sep 2025 ROC (9 categories) | 54 | 3 | 51 |
| B7: Oct 2025 NAC (Div 1/Jr/Cdt) | 18 | 4 | 14 |

*Updated 2026-04-12.* Strip budget, auto-flighting, and capacity-aware day assignment are implemented but did not improve error counts. The bottleneck is single-day strip exhaustion by large events, not day-assignment quality.