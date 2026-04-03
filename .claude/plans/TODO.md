# TODOs


- All constants should be configuration JSON file with defaults.
  - Allow user to tweak all settings / preferences per events, i.e. weights, earliest start time offset.
  - But not hard policies (i.e. no Vet Team and Vet Indv on same day) - they can adjust those through manual drag-n-drop if they really want to.
  - UI will have "Advanced" screen where user can tweak all the values, and if adjusted the changed values are saved with the tournament configuration to be saved into the serialized base64 value when saved/shared.

- Load Real Tournaments into the UI
  - All integration tests tournaments should be available in the UI - "Load tournament"
  - We probably should add more tournaments from the current and past season
  - i.e. All NACs, SYCs, SJCCs and some mega ROC/RJCC/RYC events

---

## Engine Limitations

Issues discovered during integration testing (March 2026). Tracked in Plan D (`2026-03-29-engine-fixes-D-binpack-capacity.md`).

### Day assignment is capacity-naive

`assignDay`/`totalDayPenalty` scores crossover penalties and proximity but does not track remaining strip-hours per day. When many large events (200–350 fencers) have similar penalty profiles, the scheduler piles them onto the same day. DE phases then overrun the 14-hour boundary, causing ERROR bottlenecks.

**Fix in Plan D:** Add capacity-aware scoring using strip-hours and age-category weights.

### Post-scheduling resource diagnostic missing

When events fail to schedule (ERROR bottlenecks), no actionable message surfaces explaining how many strips or refs were needed. User sees opaque "no valid day found" errors.

**Fix needed:** After scheduling, if errors exist, check whether configured strips/refs meet the minimum required counts and emit targeted messages: "You need at least N strips" / "You need at least X 3-weapon referees."

---

## Integration Test Baseline (March 2026)

Seven integration tests in `__tests__/engine/integration.test.ts` use real USA Fencing tournament data (fencer counts rounded to nearest 10). All pass with current assertions, but the engine cannot fully schedule any at realistic scale.

### Current test assertions

- Engine doesn't crash on realistic data
- At least some events schedule
- `scheduled + errors = total` (nothing silently dropped)
- Hard separations respected for events that didn't use level-3 constraint relaxation

### Results per scenario

| Scenario | Source | Events | ~Scheduled | ~Errors |
|----------|--------|--------|------------|---------|
| B1: Feb 2026 NAC (Div 1/Jr/Vet) | Real data | 24 | ~8 | ~16 |
| B2: Nov 2025 NAC (Div 1/Cdt/Y14) | Real data | 24 | ~10 | ~14 |
| B3: Mar 2026 NAC (Y10/Y12/Y14/D2) | Real data | 24 | ~4 | ~20 |
| B4: Jan 2026 SYC (Y8-Y14/Cdt) | Real data | 30 | ~3 | ~27 |
| B5: Jan 2026 SJCC (Cdt/Jr) | Real data | 12 | ~4 | ~8 |
| B6: Sep 2025 ROC (9 categories) | Real data | 54 | ~5 | ~49 |
| B7: Oct 2025 NAC (Div 1/Jr/Cdt) | Real data | 18 | ~7 | ~11 |

### Root causes

1. **Capacity-naive day assignment** — penalty scoring ignores remaining strip-hours (tracked in Plan D)
2. **Staged DE video serialization** — multiple events' DE phases compete for limited video strips, compounding day-boundary overruns

### When to tighten

Once capacity-aware day assignment is implemented (Plan D), update tests to:
- Assert all events scheduled (zero errors)
- Verify hard separations for all events
- Assert specific day assignment patterns (e.g., Div 1 and Junior never share a day)
