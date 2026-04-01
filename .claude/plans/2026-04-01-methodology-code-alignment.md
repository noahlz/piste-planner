# Engine–Methodology Alignment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align METHODOLOGY.md documentation with engine code (and vice versa) so the spec is a reliable source of truth.

**Relationship to Plan D:** Independent. No blocking dependency in either direction. Plan D (capacity-aware day assignment) can proceed before or after this work.

**Scope note:** Piste Planner does not support Summer Nationals (10-day events). Remove any Summer Nationals references from code and docs.

---

### Task 1: Fix METHODOLOGY.md documentation errors (doc → match code)

**What & Why:** Sections of METHODOLOGY.md that describe behavior not matching the actual implementation. In these cases the code is correct; update the doc.

**Files:** `METHODOLOGY.md`

- [ ] **Step 1: GROUP_1_MANDATORY — document DIV1/DIV1A hard block**
  `DIV1/DIV1A` is a hard mandatory separation (these divisions have near-total fencer overlap). Document in Hard Constraints → Overlapping-Population Separation. Remove the Summer Nationals comment from code.

- [ ] **Step 2: Pod captains variable ratio**
  Update "1 pod captain per 8 strips" to document the actual behavior: 1 per 4 strips for brackets ≤32 and R16 phases; 1 per 8 strips for larger brackets and other phases. Document the `FORCE_4` override option.

- [ ] **Step 3: Analysis passes — document flighting video conflict pass**
  Update Phase 2 description: add the flighting-group video conflict check pass. Note that the analysis function is called from the UI layer, not from `scheduleAll()` directly.

- [ ] **Step 4: File attribution corrections**
  - Team event validation: change `(see analysis.ts)` → `(see validation.ts)`
  - Refs per pool: note that logic is in `pools.ts:resolveRefsPerPool`, not `refs.ts`

- [ ] **Step 5: Document all undocumented constants**
  Add to Appendix A or relevant prose sections:
  - `FLIGHT_BUFFER_MINS = 15` — buffer between flighted flights
  - `THRESHOLD_MINS = 10` / `EARLY_START_THRESHOLD = 10` — bottleneck detection threshold for resource scanning delay
  - `SAME_TIME_WINDOW_MINS = 30` — the 30-minute window for same-time crossover penalty
  - `DEFAULT_DE_DURATION_TABLE` — DE durations by bracket size and weapon (entirely absent from docs)
  - `DE_REFS = 1` — one referee per DE bout
  - Double-duty referee logic in `pools.ts` (one ref covers two strips when `refsPerPool=1` and excess refs available)
  - `RefPolicy.AUTO = 1.0` as middle value in constraint scoring (doc only mentions TWO=2.0 and ONE=0.5)

- [ ] **Step 6: earlyStartPenalty Pattern C scope**
  After code fix (Task 2 Step 8), update doc to clarify the consecutive-day ind+team early-start penalty (2.0) requires same weapon+gender+category match.

- [ ] **Step 7: Gender equity — add footnote**
  Add a footnote to METHODOLOGY: "Gender equity pool-count validation (proportional strip allocation by gender during pool rounds) to be added in a future version."

- [ ] **Step 8: Phase 2 clarification**
  Update METHODOLOGY to clarify that `initialAnalysis()` is called from the UI layer before scheduling, not from `scheduleAll()` directly. It is a pre-scheduling check, not part of the engine pipeline.

---

### Task 2: Fix code to match METHODOLOGY.md (code → match doc)

**What & Why:** Documented behaviors that are missing, wrong, or inverted in the engine. These are real bugs or missing features.

**Files:** Various engine files

- [ ] **Step 1: Y8 early-scheduling penalty**
  `dayAssignment.ts`: add `Category.Y8` alongside `Category.Y10` in the early-slot penalty check. METHODOLOGY says "Y8/Y10 Early Scheduling → 0.3" but code only checks Y10.

- [ ] **Step 2: Last-day ref shortage NAC/ROC tiers**
  `dayAssignment.ts` `lastDayRefShortagePenalty()`: add tournament-type awareness. Current code: `>100 → 0.5`, `>50 → 0.2`. Should be: NAC `>300 → 0.5`, ROC `>100 → 0.3`, medium `50-100 → 0.2`. Requires passing `tournament_type` to the function.

- [ ] **Step 3: Weapon balance proportional to fencer count**
  `dayAssignment.ts` `weaponBalancePenalty()`: currently returns flat 0.5. METHODOLOGY says "proportional to competition size." Scale by fencer count (e.g., `0.5 * fencer_count / 200` capped at some max).

- [ ] **Step 4: Flighting eligibility enforcement**
  `flighting.ts`: `FLIGHTING_MIN_FENCERS = 200` is defined in `constants.ts` but never imported or checked. Add the 200+ fencer gate to `suggestFlightingGroups`. Also implement the "within 40 entrants" rule for multiple-flighting.

- [ ] **Step 5: Ref validation global check**
  `validation.ts`: add the missing global check `foil_epee_refs + three_weapon_refs >= strips_total` (summed across the relevant day). Currently only per-competition, per-weapon checks exist.

- [ ] **Step 6: Auto-suggest refs should use refs_per_pool**
  `refs.ts` `calculateOptimalRefs()`: `peakPoolRefDemand` returns `n_pools` (1 ref/pool) regardless of `refs_per_pool` config. Should multiply by `refs_per_pool` when configured as TWO.

- [ ] **Step 7: Cut formula is inverted**
  `pools.ts`: `cutValue` represents the % to CUT (e.g., 20 = cut 20%, keep 80%). Current code: `Math.round((fencerCount * cutValue) / 100)` promotes the cut fraction instead of the kept fraction. Fix to: `Math.round(fencerCount * (1 - cutValue / 100))`.

- [ ] **Step 8: earlyStartPenalty Pattern C — add weapon match**
  `dayAssignment.ts` `earlyStartPenalty()`: Pattern C (consecutive-day ind+team early start, 2.0 penalty) currently matches on category+gender only. Add weapon match requirement — cross-weapon pairs should not trigger this penalty.

- [ ] **Step 9: Double-stripping — use 0.6 multiplier**
  `pools.ts`: change double-stripping reduction from `÷2` (50%) to `× 0.6` (40% reduction). Double-stripping isn't a clean 2× speedup due to fencer rest and bout-switching friction.

- [ ] **Step 10: Post-schedule warning — add 10% threshold**
  `scheduler.ts` `postScheduleWarnings()`: currently triggers on any excess over middle-day average. Add a 10% threshold — only warn when first/last day exceeds average by 10%+.

- [ ] **Step 11: Fencer count defaults — upgrade to weapon×gender tables**
  `constants.ts`: replace `NAC_FENCER_DEFAULTS` and `REGIONAL_FENCER_DEFAULTS` (single number per category) with the detailed weapon×gender tables from METHODOLOGY Appendix A.

- [ ] **Step 12: Build strip count suggestion function**
  `analysis.ts`: implement `suggestStripCount()` — find the competition with the most pools (peak strip demand) and return that as the suggested strip count baseline. METHODOLOGY documents this as existing but it was never built.

- [ ] **Step 13: GROUP_1 — move DIV1/DIV2 and DIV1/DIV3 to soft separation**
  `constants.ts`: remove `[DIV1, DIV2]` and `[DIV1, DIV3]` from `GROUP_1_MANDATORY`. Add to `SOFT_SEPARATION_PAIRS` with a penalty and 4-hour separation requirement (similar to ind/team gap logic). Remove Summer Nationals comment.

- [ ] **Step 14: Rename DeMode.SINGLE_BLOCK → DeMode.SINGLE_STAGE**
  Rename across all files. The methodology term "Single Stage DE" is clearer than "Single Block."

- [ ] **Step 15: Rename referee fields: saber_refs → three_weapon_refs**
  Rename `saber_refs` → `three_weapon_refs` and update all references across the codebase. The current name is confusing — these refs can officiate all three weapons, not just saber.

- [ ] **Step 16: Remove gender equity analysis pass**
  `analysis.ts`: remove Pass 7 (gender equity pool count validation). Add back in a future version. See Task 1 Step 7 for the footnote.

- [ ] **Step 17: Write tests for each code fix**
  Each step above should have corresponding test cases added or updated.

- [ ] **Step 18: Run full test suite**
  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  Fix any regressions.

---

### Execution notes

- Task 1 and Task 2 can be interleaved — some doc updates depend on code fixes (e.g., Step 6 depends on Step 8).
- Steps 14 and 15 (renames) are broad refactors — do these early to avoid merge conflicts with other changes.
- User handles commits.
