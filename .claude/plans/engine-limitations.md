## Engine Limitations

### Post-scheduling resource diagnostic missing

When events fail to schedule (ERROR bottlenecks), no actionable message surfaces explaining how many strips or refs were needed. User sees opaque "no valid day found" errors.

**Fix needed:** After scheduling, if errors exist, check whether configured strips/refs meet the minimum required counts and emit targeted messages: "You need at least N strips" / "You need at least X 3-weapon referees."

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

*Updated 2026-04-03 after Plan D (capacity-aware day assignment).* Error counts did not improve — the capacity penalty spreads events more evenly across days, but the fundamental bottleneck is strip/ref resource exhaustion within a day. Single large events monopolize all strips, leaving no resource windows for subsequent events. Plan E (per-event strip limits + auto-flighting) targets this directly.
