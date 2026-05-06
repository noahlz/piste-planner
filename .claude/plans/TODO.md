# TODOs

> **2026-05-06 update**: The Strip-Time Matrix Allocation Model has been
> planned as a four-phase rollout. See `2026-05-06-phase1-foundations.md`
> through `2026-05-06-phase4-matrix-editor.md`. The items below are
> cross-referenced where they're affected by that work; the Pod Captains
> toggle has been removed entirely and is no longer a configurable
> setting.

- Load Real Tournaments into the UI
  - All integration tests tournaments should be available in the UI - "Load tournament"
  - We will have more tournaments from the current and past season. Start with ones from integration tests.
  - i.e. All NACs, SYCs, SJCCs and some mega ROC/RJCC/RYC events

- UI Workflow improvement: tournament setup screen
  - User selects tournament event composition and entries per event on one screen.
  - When the click an event it gets an entries text field next to it.
  - "Auto-populate" button (wand icon) adds event entry suggestions based on tournament type (NAC/ROC/SYC etc) from real data
    - In future versions, we let the user select the Region for ROC/RYC/RJCC and set entries based on real data.
  - "Suggest referees and strips" is on same screen. Populates Strip count and referee count, both fields on same screen.
  - "Advanced" panel (accordion in single-page, pop-up dialog in Wizard) allows user to customize:
    - Referee count: default 2 for NAC, SJCC, SYC. Default 1 for all others
    - Video strips: Required for certain NAC events, default count 8. Optional for all others, user can enable and set count.
    - DE Mode: NAC default staged. "Single stage" for all others.
    - **Video Stage Mode** (new — lands with Phase 2): STRICT (default — operational reality, sync-start barrier) or FLUID (greedy what-if, bouts placed on any free video strip). Cross-ref: `2026-05-06-phase2-bout-level-allocator.md`.
    - When panel is minimized / hidden the "Advanced" button / link has dim text with the above defaults
  - **Pod Captains toggle removed** — pods are no longer modeled by the engine; operational pod arrangement is a tournament-day decision.
  - This is separate from the "Gears" button that lets users fiddle with global weights and penalties.

- "Re-pack tightly (FLUID)" button on the schedule view (lands with Phase 2/3)
  - One-click runs `scheduleAll` with `video_stage_mode='FLUID'`, populates the second schedule on the store, renders side-by-side STRICT vs FLUID matrices.
  - Summary banner: events scheduled (S/F), tournament end-time delta, peak strip-usage delta.
  - Cross-ref: `2026-05-06-phase3-matrix-viewer.md`.

- Drag-drop matrix repair (lands with Phase 4, milestone-based)
  - Move/resize allocations on a 5-min grid; split DE blocks into per-bout rectangles; pool atomicity guard.
  - Engine-side validation (no overlap, video-strip constraint, parent-bout precedence, day boundary).
  - Cross-ref: `2026-05-06-phase4-matrix-editor.md`.

- Youth-event pool duration calibration (B4 follow-up)
  - B4 currently 16/30; real Y8/Y10 events finish in 2–3 hours, not the 5–6 hours the engine predicts.
  - Calibrate `pool_round_duration_table` (or add a youth-event multiplier) once Phase 2 ships and FLUID-mode results show whether B4 closes by densification or genuinely needs duration recalibration.

- Global Settings: All constants should be configuration JSON file with defaults. "Gears" button in upper corner of app, next to Wizard / single page.
  - Allow user to tweak all settings / preferences per events, i.e. weights, earliest start time offset.
  - **New constants surfaced after Phase 1** (cross-ref `2026-05-06-phase1-foundations.md`):
    - `SLOT_MINS` (default 5) — scheduling grid resolution.
    - `DE_BOUT_DURATION` per weapon: Foil 20, Epee 20, Sabre 15.
    - `YOUTH_VET_BOUT_DELTA` (default -5) — applied to Y10/Y8/Vet for 10-touch bouts.
    - `video_stage_mode` (default STRICT) — tournament-level toggle.
  - But NOT hard policies (i.e. no Vet Team and Vet Indv on same day) - they can adjust those through manual drag-n-drop if they really want to.
  - When serializing the tournament config, only the overrides are saved. If not overriden, defaults from constants persist.
