# TODOs

- Load Real Tournaments into the UI
  - All integration tests tournaments should be available in the UI - "Load tournament"
  - We will have more tournaments from the current and past season. Start with ones from integration tests.
  - i.e. All NACs, SYCs, SJCCs and some mega ROC/RJCC/RYC events

- UI Workflow improvement: touranment setup screen
  - User selects tournament event composition and entries per event on one screen.
  - When the click an event it gets an entries text field next to it.
  - "Auto-populate" button (wand icon) adds event entry suggestions based on tournament type (NAC/ROC/SYC etc) from real data
    - In future versions, we let the user select the Region for ROC/RYC/RJCC and set entries based on real data.
  - "Suggest referees and strips" is on same screen. Populates Strip count and referee count, both fields on same screen.
  - "Advanced" panel (accordion in single-page, pop-up dialog in Wizard) allows user to customize:
    - Referee count: default 2 for NAC, SJCC, SYC. Default 1 for all others
    - Video strips: Required for certain NAC events, default count 8. Optional for all others, user can enable and set count.
    - DE Mode: NAC default staged. "Single stage" for all others.
    - When panel is minimized / hidden the "Advanced" button / link has dim text with the above defaults
  - This is separate from the "Gears" button that lets users fiddle with global weights and penalties.

- Global Settings: All constants should be configuration JSON file with defaults. "Gears" button in upper corner of app, next to Wizard / single page.
  - Allow user to tweak all settings / preferences per events, i.e. weights, earliest start time offset.
  - But NOT hard policies (i.e. no Vet Team and Vet Indv on same day) - they can adjust those through manual drag-n-drop if they really want to.
  - When serializing the tournament config, only the overrides are saved. If not overriden, defaults from constants persist.

---

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
| B4: Jan 2026 SYC (Y8-Y14/Cdt) | 30 | 3 | 27 |
| B5: Jan 2026 SJCC (Cdt/Jr) | 12 | 4 | 8 |
| B6: Sep 2025 ROC (9 categories) | 54 | 3 | 51 |
| B7: Oct 2025 NAC (Div 1/Jr/Cdt) | 18 | 4 | 14 |

*Updated 2026-04-03 after Plan D (capacity-aware day assignment).* Error counts did not improve — the capacity penalty spreads events more evenly across days, but the fundamental bottleneck is strip/ref resource exhaustion within a day. Single large events monopolize all strips, leaving no resource windows for subsequent events. Plan E (per-event strip limits + auto-flighting) targets this directly.
