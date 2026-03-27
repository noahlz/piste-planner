# UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Piste Planner UI — Zustand store, kitchen sink page, save/load/share, wizard layout, and theming — on top of the completed scheduling engine.

**Architecture:** Store-first approach. Six Zustand slices wired to pure engine functions via a `buildTournamentConfig()` adapter. Two layout modes (kitchen sink and wizard) render the same section components. Save/load via JSON files, share via URL hash encoding.

**Tech Stack:** React 19, Zustand 5, Tailwind CSS 4, Vite 8, Vitest 3.2, @testing-library/react 16

**Design Spec:** `.claude/plans/2026-03-27-ui-implementation-design.md`

---

## File Structure

```
src/
├── engine/                        # (existing — no new files except cleanup)
├── store/
│   ├── store.ts                   # Combined Zustand store (all slices)
│   ├── buildConfig.ts             # buildTournamentConfig() — store → engine adapter
│   └── serialization.ts           # Save/load JSON, URL hash encode/decode, schema validation
├── components/
│   ├── common/
│   │   └── DefaultLabel.tsx       # Dim "(Default)" label for fields using defaults
│   ├── sections/
│   │   ├── TournamentSetup.tsx    # Tournament type, days, times, strips
│   │   ├── TemplateSelector.tsx   # Template dropdown/buttons
│   │   ├── CompetitionMatrix.tsx  # Checkbox matrix grouped by weapon×gender
│   │   ├── FencerCounts.tsx       # Number inputs per selected competition
│   │   ├── CompetitionOverrides.tsx # DE mode, video policy dropdowns per row
│   │   ├── RefereeSetup.tsx       # Per-day ref inputs, sabre fill-in toggles
│   │   ├── ActionButtons.tsx      # Validate + Generate Schedule buttons
│   │   ├── AnalysisOutput.tsx     # Validation errors, warnings, flighting suggestions
│   │   ├── ScheduleOutput.tsx     # Results table
│   │   └── SaveLoadShare.tsx      # Save/load/share controls
│   ├── KitchenSinkPage.tsx        # All sections stacked vertically
│   ├── wizard/
│   │   ├── WizardShell.tsx        # Step indicator, nav buttons, stale banner
│   │   ├── WizardStep1.tsx        # TournamentSetup + TemplateSelector + CompetitionMatrix
│   │   ├── WizardStep2.tsx        # FencerCounts + CompetitionOverrides
│   │   ├── WizardStep3.tsx        # RefereeSetup
│   │   └── WizardStep4.tsx        # AnalysisOutput (validation gate)
│   └── ScheduleView.tsx           # ScheduleOutput + diagnostics + strip layout (shared)
├── App.tsx                        # Layout mode switch, header with toggle
├── main.tsx                       # (existing)
└── index.css                      # (existing — theme additions in Iteration 3)

__tests__/
├── store/
│   ├── store.test.ts              # Slice mutations, stale tracking
│   ├── buildConfig.test.ts        # Config assembly correctness
│   └── serialization.test.ts      # Round-trip save/load, URL encode/decode, schema validation
├── components/
│   ├── KitchenSinkPage.test.tsx   # Functional-level component tests
│   └── WizardShell.test.tsx       # Navigation, step gating, layout toggle
└── helpers/
    └── factories.ts               # (existing — updated)
```

---

## Task 0: Engine Cleanup — Remove CAPPED/ESTIMATED

Remove `FencerCountType` from the engine. Fencer counts are always estimates.

**Files:**
- Modify: `src/engine/types.ts:84-88` (remove FencerCountType enum), `src/engine/types.ts:169` (remove field from Competition)
- Modify: `src/engine/validation.ts:1,80-86` (remove CAPPED check)
- Modify: `src/engine/analysis.ts:1,170-219` (remove CAPPED-dependent logic in Pass 7)
- Modify: `src/engine/constants.ts:218-228` (evaluate REGIONAL_QUALIFIER_TYPES — keep it, used by isRegionalQualifier)
- Modify: `__tests__/helpers/factories.ts:5,85` (remove from imports and factory)
- Modify: `__tests__/engine/validation.test.ts:6,124-143` (remove CAPPED test block)
- Modify: `__tests__/engine/analysis.test.ts:8,285-371` (rewrite gender equity tests without CAPPED)

### Steps

- [ ] **Step 0.1: Remove FencerCountType from types.ts**
  - Delete the `FencerCountType` const object and type (lines 84-88)
  - Remove `fencer_count_type: FencerCountType` from the `Competition` interface (line 169)

- [ ] **Step 0.2: Remove CAPPED check from validation.ts**
  - Remove `FencerCountType` from the import statement (line 1)
  - Delete the CAPPED fencer count validation block (lines 80-86: the "CAPPED fencer count is prohibited at regional qualifiers" check)

- [ ] **Step 0.3: Simplify analysis.ts Pass 7**
  - Remove `FencerCountType` from the import statement (line 1)
  - In Pass 7 (gender equity), the current logic only checks gender equity for CAPPED competitions. With CAPPED removed, gender equity should apply to ALL competitions in the same (category, weapon) group. Replace the `capped` filter on line 171 with just `competitions`. Remove the regional qualifier CAPPED error block (lines 174-185). Keep the gender equity pool-count comparison logic (lines 188-219) but operate on all competitions instead of only capped ones.

- [ ] **Step 0.4: Update test factories**
  - Remove `FencerCountType` from the import in `__tests__/helpers/factories.ts` (line 5)
  - Remove `fencer_count_type: FencerCountType.ESTIMATED` from `makeCompetition` (line 85)

- [ ] **Step 0.5: Update validation tests**
  - Remove `FencerCountType` from the import in `__tests__/engine/validation.test.ts` (line 6)
  - Delete the entire `validateConfig — CAPPED fencer count on regional qualifier` describe block (lines 124-143)

- [ ] **Step 0.6: Rewrite analysis gender equity tests**
  - Remove `FencerCountType` from the import in `__tests__/engine/analysis.test.ts` (line 8)
  - Update the gender equity tests (lines 285-371): remove all `fencer_count_type: FencerCountType.CAPPED` from test data. The tests should still check the same pool-count comparison logic — just without the CAPPED filter. Remove the two REGIONAL_QUALIFIER_CAPPED test cases (lines 341-370) since that concept no longer exists.

- [ ] **Step 0.7: Fix any remaining references**
  - Search for any remaining references to `fencer_count_type`, `FencerCountType`, or `CAPPED` in `src/` and `__tests__/`. The refs.test.ts (line 61) and flighting.test.ts (line 22) have inline `fencer_count_type: 'ESTIMATED'` — these need to be removed from their test competition objects.

- [ ] **Step 0.8: Run tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

- [ ] **Step 0.9: Also remove BottleneckCause.REGIONAL_QUALIFIER_CAPPED**
  - This bottleneck cause only exists for the CAPPED validation. Remove it from `src/engine/types.ts` (line 131). Verify no other code references it (the analysis.ts usage was removed in Step 0.3).

- [ ] **Step 0.10: Run tests again after bottleneck cause removal**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 1: Zustand Store — Tournament and UI Slices

Build the first two store slices and the combined store.

**Files:**
- Create: `src/store/store.ts`
- Create: `__tests__/store/store.test.ts`

### Steps

- [ ] **Step 1.1: Write store tests for tournamentSlice**
  - Test initial state: tournament_type defaults to 'NAC', days_available to 3, dayConfigs is empty array, strips_total to 0, video_strips_total to 0, pod_captain_override to 'AUTO'
  - Test setTournamentType: sets tournament_type and marks analysisStale + scheduleStale
  - Test setDays: sets days_available, initializes dayConfigs array with default start/end times (480/1320), marks stale
  - Test updateDayConfig: updates a specific day's start or end time, marks stale
  - Test setStrips: sets strips_total, marks stale
  - Test setVideoStrips: sets video_strips_total, marks stale
  - Test setPodCaptainOverride: sets pod_captain_override, marks stale

- [ ] **Step 1.2: Write store tests for uiSlice**
  - Test initial state: layoutMode is 'kitchen-sink', wizardStep is 0, analysisStale is false, scheduleStale is false
  - Test setLayoutMode: toggles between 'kitchen-sink' and 'wizard'
  - Test setStep: sets wizardStep
  - Test markStale: sets analysisStale and/or scheduleStale based on arguments
  - Test clearStale: resets both stale flags

- [ ] **Step 1.3: Run tests to verify they fail**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: FAIL — store module does not exist

- [ ] **Step 1.4: Implement store.ts with tournamentSlice and uiSlice**
  - Create the Zustand store using `create()` with the `...` spread pattern for combining slices
  - Implement tournamentSlice state and actions
  - Implement uiSlice state and actions
  - All tournament/competition mutation actions must call markStale internally (both analysisStale and scheduleStale)

- [ ] **Step 1.5: Run tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 2: Zustand Store — Competition Slice

**Files:**
- Modify: `src/store/store.ts`
- Modify: `__tests__/store/store.test.ts`

### Steps

- [ ] **Step 2.1: Write store tests for competitionSlice**
  - Test initial state: selectedCompetitions is an empty map, globalOverrides has default values from engine constants
  - Test selectCompetitions: given an array of catalogue IDs, adds them to the map with default per-competition config (fencer_count: 0, ref_policy: 'AUTO', de_mode from DEFAULT_CUT_BY_CATEGORY, video_policy from DEFAULT_VIDEO_POLICY_BY_CATEGORY, etc.)
  - Test updateCompetition: updates a single competition's config (e.g., fencer_count), marks stale
  - Test removeCompetition: removes a competition from the map, marks stale
  - Test applyTemplate: given a template name, looks up TEMPLATES[name] and calls selectCompetitions with those IDs, marks stale
  - Test setGlobalOverrides: updates global override values (ADMIN_GAP_MINS, etc.), marks stale
  - Test stale tracking: all mutations set both analysisStale and scheduleStale

- [ ] **Step 2.2: Run tests to verify they fail**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: FAIL — new tests reference unimplemented actions

- [ ] **Step 2.3: Implement competitionSlice**
  - State: `selectedCompetitions: Record<string, CompetitionConfig>` where CompetitionConfig holds the per-competition overrides
  - State: `globalOverrides` with defaults sourced from engine constants
  - Actions call markStale on every mutation
  - `applyTemplate` imports TEMPLATES from engine catalogue and `selectCompetitions` with those IDs
  - When selecting competitions, look up the CatalogueEntry to determine defaults (category → default cut mode, video policy, etc.)

- [ ] **Step 2.4: Run tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 3: Zustand Store — Referee, Analysis, and Schedule Slices

**Files:**
- Modify: `src/store/store.ts`
- Modify: `__tests__/store/store.test.ts`

### Steps

- [ ] **Step 3.1: Write store tests for refereeSlice**
  - Test initial state: dayRefs is an empty array, optimalRefs is an empty array
  - Test setDayRefs: sets ref counts for a specific day, marks only scheduleStale (not analysisStale)
  - Test toggleSabreFillin: toggles the allow_sabre_ref_fillin flag for a specific day, marks scheduleStale
  - Test setOptimalRefs: stores calculated optimal ref counts per day
  - Test stale tracking: referee mutations set scheduleStale only, NOT analysisStale

- [ ] **Step 3.2: Write store tests for analysisSlice**
  - Test initial state: validationErrors is empty, warnings is empty, suggestions is empty, flightingSuggestionStates is empty
  - Test setAnalysisResults: stores results from validateConfig + initialAnalysis
  - Test acceptFlightingSuggestion: marks a suggestion as accepted
  - Test rejectFlightingSuggestion: marks a suggestion as rejected
  - Test clearAnalysis: resets all analysis state

- [ ] **Step 3.3: Write store tests for scheduleSlice**
  - Test initial state: scheduleResults is empty, bottlenecks is empty
  - Test setScheduleResults: stores results from scheduleAll
  - Test clearSchedule: resets schedule state

- [ ] **Step 3.4: Run tests to verify they fail**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: FAIL

- [ ] **Step 3.5: Implement all three slices**
  - refereeSlice: mutations mark only scheduleStale (not analysisStale)
  - analysisSlice: transient, not serialized. Flighting suggestion states track accept/reject per suggestion index.
  - scheduleSlice: stores ScheduleAllResult (schedule map + bottlenecks array)

- [ ] **Step 3.6: Run tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 4: Config Assembly — buildTournamentConfig()

Bridge between store shape and engine's TournamentConfig interface.

**Files:**
- Create: `src/store/buildConfig.ts`
- Create: `__tests__/store/buildConfig.test.ts`

### Steps

- [ ] **Step 4.1: Write buildConfig tests**
  - Test: given store state with tournament settings, selected competitions, and referee config, produces a valid TournamentConfig object
  - Test: strips array is generated from strips_total and video_strips_total (first N strips are video-capable)
  - Test: dayConfigs array is built from tournament days and per-day time settings
  - Test: competitions array is built from selectedCompetitions map, merging catalogue entries with per-competition overrides
  - Test: referee_availability is built from refereeSlice dayRefs
  - Test: global overrides (ADMIN_GAP_MINS, duration tables, etc.) come from competitionSlice globalOverrides
  - Test: accepted flighting suggestions are applied to competition objects (setting flighted=true, flighting_group_id, is_priority, strips_allocated)

- [ ] **Step 4.2: Run tests to verify they fail**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: FAIL

- [ ] **Step 4.3: Implement buildTournamentConfig**
  - Reads store state via `useStore.getState()` (or accepts state as parameter for testability)
  - Constructs TournamentConfig from slices
  - Constructs Competition[] from selectedCompetitions map + catalogue lookups
  - Returns `{ config: TournamentConfig, competitions: Competition[] }`

- [ ] **Step 4.4: Run tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 5: Serialization — Save/Load/URL Share

**Files:**
- Create: `src/store/serialization.ts`
- Create: `__tests__/store/serialization.test.ts`

### Steps

- [ ] **Step 5.1: Write serialization tests**
  - Test save: produces JSON with schemaVersion: 1 and all serializable slice data
  - Test load: valid JSON hydrates store slices correctly
  - Test load: rejects missing schemaVersion
  - Test load: rejects unknown fields (strict validation)
  - Test load: rejects out-of-range values (fencer_count < 0, days_available > 4, etc.)
  - Test load: returns descriptive error message on invalid input
  - Test round-trip: save → load → state matches original
  - Test URL encode: produces base64url string prefixed with `#config=`
  - Test URL decode: valid hash hydrates store
  - Test URL round-trip: encode → decode → state matches original
  - Test URL size: warns when encoded payload exceeds 2KB
  - Test malformed URL: corrupted base64 or invalid JSON returns error

- [ ] **Step 5.2: Run tests to verify they fail**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: FAIL

- [ ] **Step 5.3: Implement serialization.ts**
  - `serializeState()`: reads tournamentSlice + competitionSlice + refereeSlice + scheduleSlice, returns JSON string with schemaVersion
  - `deserializeState(json: string)`: validates schema, returns parsed state or error
  - `encodeToUrl(state)`: JSON → gzip (using browser CompressionStream API) → base64url
  - `decodeFromUrl(hash: string)`: base64url → gunzip → JSON → validate → parsed state
  - `validateSchema(data: unknown)`: shared validation for both file and URL, checks types and ranges
  - `downloadAsFile(filename: string)`: creates blob, triggers download via `<a download>`
  - `loadFromHash()`: reads `window.location.hash`, decodes if present

- [ ] **Step 5.4: Run tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 6: Kitchen Sink Page — Tournament Setup Section

First visible UI. Renders tournament configuration controls wired to the store.

**Files:**
- Create: `src/components/sections/TournamentSetup.tsx`
- Create: `src/components/sections/TemplateSelector.tsx`
- Modify: `src/App.tsx`
- Create: `src/components/KitchenSinkPage.tsx`

### Steps

- [ ] **Step 6.1: Implement TournamentSetup component**
  - Tournament type dropdown (NAC, RYC, RJCC, ROC, SYC, SJCC)
  - Days available input (number, 2-4)
  - Per-day start/end time selectors (30-minute increments, one row per day)
  - Strip count input (number)
  - Video strip count input (number)
  - Pod captain override dropdown (AUTO, DISABLED, FORCE_4)
  - All inputs read from and write to the store

- [ ] **Step 6.2: Implement TemplateSelector component**
  - Dropdown or button group listing all template names from TEMPLATES
  - Selecting a template calls store.applyTemplate(name)

- [ ] **Step 6.3: Create KitchenSinkPage**
  - Renders TournamentSetup and TemplateSelector stacked vertically
  - Placeholder sections for remaining components (just headings)

- [ ] **Step 6.4: Update App.tsx**
  - Replace the placeholder h1 with KitchenSinkPage
  - Add a header with app title

- [ ] **Step 6.5: Verify in browser**
  - Run: `pnpm dev`
  - Verify: page renders, dropdowns/inputs work, changing values updates store (check via React DevTools or console)

---

## Task 7: Kitchen Sink Page — Competition Selection + Fencer Counts

**Files:**
- Create: `src/components/sections/CompetitionMatrix.tsx`
- Create: `src/components/sections/FencerCounts.tsx`
- Modify: `src/components/KitchenSinkPage.tsx`

### Steps

- [ ] **Step 7.1: Implement CompetitionMatrix component**
  - Checkbox matrix grouped into 8 sections:
    - 6 weapon×gender groups (Women's Epee, Women's Foil, Women's Sabre, Men's Epee, Men's Foil, Men's Sabre)
    - Within each: rows for categories (Y10, Y12, Y14, Cadet, Junior, Div1, Div1A, Div2, Div3) × event types (Individual, Team)
    - 2 veteran groups (Vet Women, Vet Men) with age group sub-rows × weapon
  - Checkboxes read from and write to store.selectedCompetitions
  - Template selection should pre-check the appropriate boxes

- [ ] **Step 7.2: Implement FencerCounts component**
  - Table showing one row per selected competition
  - Columns: competition ID (or human-readable label), fencer count (number input)
  - Reads from store.selectedCompetitions, writes fencer_count updates via store.updateCompetition

- [ ] **Step 7.3: Add to KitchenSinkPage**
  - Add CompetitionMatrix and FencerCounts below TemplateSelector

- [ ] **Step 7.4: Verify in browser**
  - Select a template → checkboxes populate → fencer count rows appear
  - Enter fencer counts → store updates

---

## Task 8: Kitchen Sink Page — Overrides + Referee Setup

**Files:**
- Create: `src/components/sections/CompetitionOverrides.tsx`
- Create: `src/components/sections/RefereeSetup.tsx`
- Create: `src/components/common/DefaultLabel.tsx`
- Modify: `src/components/KitchenSinkPage.tsx`

### Steps

- [ ] **Step 8.1: Implement DefaultLabel component**
  - Renders dim gray "(Default)" text next to a field when the field's value matches its default
  - Props: `isDefault: boolean`

- [ ] **Step 8.2: Implement CompetitionOverrides component**
  - Table of selected competitions with inline dropdowns for DE mode (SINGLE_BLOCK, STAGED_DE_BLOCKS) and video policy (REQUIRED, BEST_EFFORT, FINALS_ONLY)
  - Show DefaultLabel next to each field when using the category default
  - Reads from store, writes via store.updateCompetition

- [ ] **Step 8.3: Implement RefereeSetup component**
  - One row per tournament day
  - Columns: day label, foil/epee ref count (number input), sabre ref count (number input), sabre fill-in checkbox
  - Reads from store.refereeSlice, writes via store.setDayRefs and store.toggleSabreFillin

- [ ] **Step 8.4: Add to KitchenSinkPage**
  - Add CompetitionOverrides and RefereeSetup after FencerCounts

- [ ] **Step 8.5: Verify in browser**
  - Override dropdowns work, DefaultLabel shows/hides correctly
  - Referee inputs update store

---

## Task 9: Kitchen Sink Page — Action Buttons + Output

**Files:**
- Create: `src/components/sections/ActionButtons.tsx`
- Create: `src/components/sections/AnalysisOutput.tsx`
- Create: `src/components/sections/ScheduleOutput.tsx`
- Modify: `src/components/KitchenSinkPage.tsx`

### Steps

- [ ] **Step 9.1: Implement ActionButtons component**
  - "Validate" button: calls buildTournamentConfig(), then validateConfig() + initialAnalysis(), stores results in analysisSlice
  - "Generate Schedule" button: calls buildTournamentConfig(), then scheduleAll(), stores results in scheduleSlice, clears stale flags
  - Disable "Generate Schedule" if there are hard validation errors

- [ ] **Step 9.2: Implement AnalysisOutput component**
  - Lists validation errors (grouped by severity: ERROR first, then WARN, then INFO)
  - Lists flighting suggestions with Accept/Reject buttons per suggestion
  - Reads from analysisSlice

- [ ] **Step 9.3: Implement ScheduleOutput component**
  - Table with columns: competition ID, day, pool start, pool end, DE start, DE end, strips used, bottleneck count
  - One row per scheduled competition
  - Below the table: list of bottlenecks (competition ID, phase, cause, severity, message)
  - Reads from scheduleSlice

- [ ] **Step 9.4: Add to KitchenSinkPage**
  - Add ActionButtons, AnalysisOutput, and ScheduleOutput after RefereeSetup

- [ ] **Step 9.5: End-to-end verification in browser**
  - Select template → enter fencer counts → set refs → Validate → see analysis output → Generate Schedule → see schedule results
  - This is the critical milestone: full engine integration working through the UI

---

## Task 10: Kitchen Sink Page — Save/Load/Share Controls

**Files:**
- Create: `src/components/sections/SaveLoadShare.tsx`
- Modify: `src/components/KitchenSinkPage.tsx`
- Modify: `src/App.tsx` (URL hash loading on startup)

### Steps

- [ ] **Step 10.1: Implement SaveLoadShare component**
  - "Save" button: calls serializeState(), triggers file download as `.piste.json`
  - File upload input: accepts `.piste.json`, calls deserializeState(), hydrates store on success, shows error message on failure
  - "Share" button: calls encodeToUrl(), displays generated URL with copy-to-clipboard button
  - Shows size warning if URL exceeds 2KB

- [ ] **Step 10.2: Add URL hash loading to App.tsx**
  - On mount, check `window.location.hash` for `#config=` prefix
  - If present, decode and hydrate store
  - Show error message if hash is malformed

- [ ] **Step 10.3: Add to KitchenSinkPage**
  - Add SaveLoadShare at the bottom of the page

- [ ] **Step 10.4: Verify save/load round-trip**
  - Configure a tournament, save to file, reload page, load file → state matches
  - Generate a share URL, open in new tab → state matches

---

## Task 11: Kitchen Sink Component Tests

Functional-level component tests running against the kitchen sink layout.

**Files:**
- Create: `__tests__/components/KitchenSinkPage.test.tsx`

### Steps

- [ ] **Step 11.1: Write render tests**
  - Each section component renders without errors
  - Key elements are present: tournament type dropdown, days input, template selector, competition checkboxes, fencer count inputs, validate button, generate button, save/load/share controls

- [ ] **Step 11.2: Write user flow tests**
  - Select a template → competition checkboxes are checked → fencer count rows appear
  - Enter fencer counts → validate → analysis output appears with expected warnings/errors
  - Generate schedule → schedule output table appears with results
  - The full flow: template → fencer counts → refs → validate → generate → results visible

- [ ] **Step 11.3: Write store integration tests**
  - Changing tournament type dropdown updates store state
  - Changing fencer count input updates store state
  - Stale banner appears after changing config when schedule results exist

- [ ] **Step 11.4: Write save/load tests**
  - Mock file download, verify JSON contains expected structure
  - Simulate file upload with valid JSON, verify store hydration
  - Simulate file upload with invalid JSON, verify error message appears

- [ ] **Step 11.5: Write error state tests**
  - Malformed file upload shows error message
  - Validation errors block Generate Schedule button (or show errors when clicked)

- [ ] **Step 11.6: Run tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 12: Wizard Layout

Add wizard layout as an alternative to kitchen sink. Same section components, wrapped with step navigation.

**Files:**
- Create: `src/components/wizard/WizardShell.tsx`
- Create: `src/components/wizard/WizardStep1.tsx`
- Create: `src/components/wizard/WizardStep2.tsx`
- Create: `src/components/wizard/WizardStep3.tsx`
- Create: `src/components/wizard/WizardStep4.tsx`
- Create: `src/components/ScheduleView.tsx`
- Modify: `src/App.tsx`

### Steps

- [ ] **Step 12.1: Implement WizardShell**
  - Step indicator showing Steps 1-4 + "Schedule" with current step highlighted
  - Back button (always enabled except on Step 1)
  - Forward button (blocked on Step 4 if hard validation errors exist)
  - Stale banner ("Results outdated") when scheduleStale is true
  - Reads wizardStep from uiSlice, writes via setStep

- [ ] **Step 12.2: Implement wizard step components**
  - WizardStep1: renders TournamentSetup + TemplateSelector + CompetitionMatrix
  - WizardStep2: renders FencerCounts + CompetitionOverrides
  - WizardStep3: renders RefereeSetup (auto-calculate optimal refs and display alongside actuals)
  - WizardStep4: auto-runs validate + analyze on mount, renders AnalysisOutput. Forward blocked if hard errors.

- [ ] **Step 12.3: Implement ScheduleView**
  - Renders ScheduleOutput + SaveLoadShare
  - "Regenerate" button: re-runs analysis + scheduling, clears stale flags
  - Shared between wizard and kitchen sink (kitchen sink inlines it at the bottom)

- [ ] **Step 12.4: Update App.tsx with layout toggle**
  - Header includes layout toggle (kitchen sink / wizard)
  - Reads layoutMode from uiSlice
  - Renders KitchenSinkPage or WizardShell based on mode
  - Landing page: "New Tournament" / "Load Configuration" accessible via app title

- [ ] **Step 12.5: Verify wizard flow in browser**
  - Navigate through all 4 steps + schedule output
  - Back/forward works correctly
  - Step 4 blocks forward on validation errors
  - Stale banner appears when config changes

---

## Task 13: Wizard Component Tests

**Files:**
- Create: `__tests__/components/WizardShell.test.tsx`

### Steps

- [ ] **Step 13.1: Write wizard navigation tests**
  - Forward button advances step
  - Back button retreats step
  - Back disabled on Step 1
  - Forward blocked on Step 4 when validation errors exist
  - Forward allowed on Step 4 when no hard errors

- [ ] **Step 13.2: Write layout toggle tests**
  - Layout toggle switches between kitchen sink and wizard
  - State is preserved when switching layouts

- [ ] **Step 13.3: Write stale banner tests**
  - Stale banner appears on schedule output when config has changed
  - Regenerate button clears stale and re-runs engine

- [ ] **Step 13.4: Run all tests**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

---

## Task 14: Theming Pass

Apply the custom visual design from the design spec.

**Files:**
- Modify: `src/index.css`
- Modify: all section components (add Tailwind classes)
- Modify: `src/components/sections/ScheduleOutput.tsx` (cell tinting)

### Steps

- [ ] **Step 14.1: Extend Tailwind theme in index.css**
  - Add all palette colors from design spec as CSS custom properties: background (cream), card (white), border (slate-blue), accent (light blue), warning (pastel yellow-orange), error (pastel pink-red), info (pastel blue), header (dark slate-blue), body text (neutral gray)

- [ ] **Step 14.2: Apply theme to layout shell**
  - App background: warm off-white/cream
  - Cards/panels: white background, subtle shadow, rounded corners
  - Headers: dark slate-blue text
  - Borders: medium slate-blue

- [ ] **Step 14.3: Apply theme to section components**
  - Form inputs: consistent border/focus styling
  - Buttons: accent color for primary actions, neutral for secondary
  - Tables: alternating row backgrounds, header styling

- [ ] **Step 14.4: Add schedule grid cell tinting**
  - Warning cells: pastel yellow-orange background
  - Error cells: pastel pink-red background
  - Clean cells: no tint

- [ ] **Step 14.5: Add warning/error icons**
  - Icon next to event entries in schedule output that have bottlenecks
  - Hover/click shows bottleneck detail as tooltip

- [ ] **Step 14.6: Style strip layout grid**
  - Pods of 4 as grouped rectangles via CSS Grid
  - Video strips in accent color
  - Finals strip labeled

- [ ] **Step 14.7: Visual review in browser**
  - Run: `pnpm dev`
  - Walk through full wizard + kitchen sink flow
  - Verify all theme colors applied consistently

---

## Task 15: Final Verification

**Files:** None (testing and cleanup only)

### Steps

- [ ] **Step 15.1: Run full test suite**
  - Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
  - Expected: all tests pass

- [ ] **Step 15.2: Run test coverage**
  - Run: `timeout 120 pnpm --silent test:coverage > ./tmp/coverage.log 2>&1`
  - Expected: store 70%+, components functional-level

- [ ] **Step 15.3: Run build**
  - Run: `pnpm build`
  - Expected: clean build, no TypeScript errors

- [ ] **Step 15.4: Run lint**
  - Run: `pnpm lint`
  - Expected: no errors

- [ ] **Step 15.5: Update vitest.config.ts coverage exclusions**
  - Add any new non-logic files to the coverage exclude list if needed

- [ ] **Step 15.6: Manual smoke test**
  - Run: `pnpm dev`
  - Full flow in both layouts: kitchen sink and wizard
  - Save → load round-trip
  - URL share round-trip
