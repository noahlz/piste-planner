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

### Post-scheduling resource diagnostic missing

When events fail to schedule (ERROR bottlenecks), no actionable message surfaces explaining how many strips or refs were needed. User sees opaque "no valid day found" errors.

**Fix needed:** After scheduling, if errors exist, check whether configured strips/refs meet the minimum required counts and emit targeted messages: "You need at least N strips" / "You need at least X 3-weapon referees."

---

## Integration Test Baseline (March 2026)

Seven integration tests in `__tests__/engine/integration.test.ts` use real USA Fencing tournament data (fencer counts rounded to nearest 10). All pass with current assertions, but the engine cannot fully schedule any at realistic scale.

| Scenario | Source | Events | ~Scheduled | ~Errors |
|----------|--------|--------|------------|---------|
| B1: Feb 2026 NAC (Div 1/Jr/Vet) | Real data | 24 | ~8 | ~16 |
| B2: Nov 2025 NAC (Div 1/Cdt/Y14) | Real data | 24 | ~10 | ~14 |
| B3: Mar 2026 NAC (Y10/Y12/Y14/D2) | Real data | 24 | ~4 | ~20 |
| B4: Jan 2026 SYC (Y8-Y14/Cdt) | Real data | 30 | ~3 | ~27 |
| B5: Jan 2026 SJCC (Cdt/Jr) | Real data | 12 | ~4 | ~8 |
| B6: Sep 2025 ROC (9 categories) | Real data | 54 | ~5 | ~49 |
| B7: Oct 2025 NAC (Div 1/Jr/Cdt) | Real data | 18 | ~7 | ~11 |

**Update after Plan D:** Re-run integration suite and update this table. Expect fewer errors due to capacity-aware day assignment. If errors drop to zero, tighten assertions (hard separations for all events, specific day assignment patterns).
