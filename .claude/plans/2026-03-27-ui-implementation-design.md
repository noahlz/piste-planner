# Piste Planner — UI Implementation Design

**Date:** 2026-03-27
**Status:** Draft
**References:** Design spec (`.claude/plans/2026-03-25-piste-planner-design.md`), PRD (`.claude/plans/piste-planner-prd.md`)

---

## 1. Overview

Pre-execution engine cleanup, then three UI iterations:

0. **Engine Cleanup** — remove CAPPED/ESTIMATED distinction from engine (fencer counts are always estimates)
1. **Kitchen Sink** — single scrolling page, all inputs visible, raw output, Tailwind defaults
2. **Wizard Refactor** — multi-step wizard with navigation, validation gates, polished schedule output
3. **Theming Pass** — custom color palette, visual polish, deferred features

Store-first build order: Zustand slices and engine wiring before any components.

### Iteration 0: Engine Cleanup

Remove `FencerCountType` (ESTIMATED/CAPPED) from the engine before building UI on top of it.

Affected files:
- `src/engine/types.ts` — remove `FencerCountType` enum, remove `fencer_count_type` from `Competition` interface
- `src/engine/validation.ts` — remove/simplify regional qualifier capping checks that branch on ESTIMATED vs CAPPED
- `src/engine/analysis.ts` — remove/simplify gender equity checks that branch on ESTIMATED vs CAPPED
- `src/engine/constants.ts` — remove `REGIONAL_QUALIFIER_TYPES` if it only exists for capping logic (verify first)
- `__tests__/engine/validation.test.ts` — update tests that assert on CAPPED behavior
- `__tests__/engine/analysis.test.ts` — update tests that assert on CAPPED behavior
- `__tests__/helpers/factories.ts` — remove `fencer_count_type` from test factories

---

## 2. Zustand Store Architecture

Six slices combined into a single store via `create()`.

### tournamentSlice

State: tournament type, days available, per-day configs (start time, end time), total strip count, video strip count, pod captain override.

Actions: setTournamentType, setDays, updateDayConfig, setStrips, setVideoStrips, setPodCaptainOverride.

### competitionSlice

State: map of selected competition IDs → per-competition config (fencer count, ref policy, DE mode, video policy, cut mode/value, single pool override). Global overrides (duration tables, gap settings, advanced constants).

Actions: selectCompetitions (from template or manual), updateCompetition, removeCompetition, setGlobalOverrides, applyTemplate.

Note: no ESTIMATED/CAPPED toggle — fencer counts are always estimates.

### refereeSlice

State: per-day referee availability (foil/epee count, sabre count, allow sabre fill-in). Derived optimal ref counts stored after engine calculation.

Actions: setDayRefs, toggleSabreFillin, setOptimalRefs.

### analysisSlice (transient)

State: output of `initialAnalysis()` + `validateConfig()` — validation errors, strip deficit warnings, flighting suggestions (with user accept/reject state), video demand warnings, cut summaries, gender equity results.

Actions: runAnalysis, acceptFlightingSuggestion, rejectFlightingSuggestion, clearAnalysis.

### scheduleSlice

State: `scheduleAll()` output — ScheduleResult array, Bottleneck array.

Actions: runSchedule, clearSchedule.

### uiSlice (transient)

State: layout mode (kitchen-sink or wizard), current wizard step (0–4, where 4 = schedule output), stale flags (analysisStale, scheduleStale), accordion states.

Actions: setLayoutMode, setStep, markStale, clearStale.

### Stale Tracking

- Mutations in tournamentSlice or competitionSlice → set both analysisStale and scheduleStale
- Mutations in refereeSlice → set only scheduleStale
- "Results outdated" banner renders when scheduleStale is true
- "Regenerate" button clears stale flags and re-runs engine

### Serialization

- tournamentSlice + competitionSlice + refereeSlice + scheduleSlice serialize for save/load
- uiSlice and analysisSlice are transient (re-derived from config)

---

## 3. Engine Integration

### Config Assembly

A helper function `buildTournamentConfig()` reads across store slices and constructs the `TournamentConfig` object the engine expects. This is the only place that maps store shape → engine shape. Lives alongside the store, not in the engine.

### Validate + Analyze Flow

1. `buildTournamentConfig()` assembles config from store state
2. `validateConfig(config)` — returns validation errors
3. If no hard errors, `initialAnalysis(config)` — returns warnings, flighting suggestions, strip deficits
4. Results written to analysisSlice

### Schedule Flow

1. `scheduleAll(config)` — returns ScheduleResult[] + Bottleneck[]
2. Results written to scheduleSlice
3. Clears stale flags

### Flighting Suggestions

Analysis may suggest flighting groups. User accepts/rejects in the UI. Accepted suggestions get written back into competitionSlice (setting flighting group IDs) before scheduling runs.

---

## 4. Iteration 1: Kitchen Sink Page

Single scrolling page. All inputs visible. No wizard navigation, no collapsible sections, no styling beyond Tailwind defaults. Purpose: validate that store → engine → output wiring works end to end.

The kitchen sink layout is not throwaway — it ships as a permanent layout option alongside the wizard. Users toggle between layouts via a control in the app header. Both layouts render the same section components; the difference is only in how they're grouped.

### Layout (top to bottom)

1. **Tournament Setup** — tournament type dropdown, days input, per-day start/end time selectors, strip count, video strip count, pod captain override dropdown

2. **Template Selector** — dropdown or button group to apply a template (populates competitions below)

3. **Competition Selection** — checkbox matrix grouped into sections:
   - 6 weapon×gender groups: Women's Epee, Women's Foil, Women's Sabre, Men's Epee, Men's Foil, Men's Sabre
   - Within each group: rows for each category (Y10, Y12, Y14, Cadet, Junior, Div1, Div1A, Div2, Div3) × event type (Individual, Team)
   - 2 veteran groups (Vet Women, Vet Men) with age group sub-rows (VET40–VET80, VET_COMBINED) × weapon
   - No filter dropdowns — grouping makes it scannable

4. **Fencer Counts** — table of selected competitions with number input per row (no ESTIMATED/CAPPED toggle)

5. **Per-Competition Overrides** — minimal: DE mode and video policy dropdowns per row, visible inline. Dim "(Default)" text next to fields using their default value.

6. **Referee Setup** — per-day rows with foil/epee and sabre ref count inputs, sabre fill-in checkbox per day

7. **Action Buttons** — "Validate" (runs validateConfig + initialAnalysis), "Generate Schedule" (runs scheduleAll)

8. **Validation/Analysis Output** — raw list of errors, warnings, flighting suggestions with accept/reject buttons

9. **Schedule Output** — simple table: competition ID, day, pool start, DE start, end time, strips used, bottlenecks

10. **Save/Load/Share** — save button (downloads .piste.json), file upload input (loads), share button (generates URL hash), copy-to-clipboard button

---

## 5. Save/Load/URL Share

### Save (.piste.json)

- Serialize tournamentSlice + competitionSlice + refereeSlice + scheduleSlice to JSON
- Add `schemaVersion: 1` field
- Browser download via `<a download>` with blob URL

### Load (.piste.json)

- File input accepts `.piste.json`
- Parse JSON, validate schemaVersion, validate field types and value ranges
- Reject unknown fields
- Hydrate store slices, re-run analysis if schedule results present
- Graceful error message on invalid input

### URL Share

- Serializable state → JSON → gzip → base64url (RFC 4648) → `#config=<encoded>`
- On app load: check `window.location.hash`, decode → validate → hydrate store
- If encoded payload exceeds 2KB: show warning, suggest file save instead
- Copy-to-clipboard button for the generated URL

### Schema Validation

- Shared validation function used by both file load and URL decode
- Checks types, value ranges, required fields
- No `eval`, no `innerHTML`

---

## 6. Iteration 2: Wizard Layout

Add the wizard layout as an alternative to kitchen sink. Both layouts render the same section components — the wizard wraps them with step gating and navigation.

### WizardShell

Step indicator (Steps 1–4 + Schedule Output), back/forward buttons, stale banner. Current step tracked in uiSlice. Layout toggle in app header switches between wizard and kitchen sink.

### Steps

- **Step 1: Tournament Setup** — tournament type, days, per-day times, strips, video strips, template selector → competition matrix
- **Step 2: Event Configuration** — fencer counts table, per-competition overrides (DE mode, video policy)
- **Step 3: Referee Setup** — side-by-side optimal vs actual per day, sabre fill-in toggle per day
- **Step 4: Analysis & Flighting** — validation errors block forward progress. Flighting suggestions with accept/reject. Strip deficit and video demand warnings.

### Schedule Output

- USA Fencing-style 6-column grid (weapon × gender), one row per day
- Diagnostics panel below: errors/warnings/info grouped by severity
- Strip layout grid: pods of 4 as grouped rectangles
- No Gantt (deferred)

### Navigation Rules

- Forward blocked if current step has unresolved hard errors (Step 4 validation)
- Back always allowed
- "Results outdated" banner on Schedule Output when stale flags set
- "Regenerate" button re-runs analysis + scheduling

### Landing Page

"New Tournament" / "Load Configuration" — accessible via app logo/title from any step.

---

## 7. Iteration 3: Theming Pass

### Color Palette

- Background: warm off-white/cream
- Cards/panels: white with subtle shadow
- Borders: medium slate-blue
- Accent: light blue for interactive elements
- Warning cells: pastel yellow-orange
- Error cells: pastel pink-red
- Info badges: pastel blue
- Headers: dark slate-blue
- Body text: neutral gray

### Component Polish

- Dim "(Default)" text next to fields using their default value
- Cell background tinting in schedule grid (warnings yellow-orange, errors pink-red)
- Warning/error icons on event entries with tooltips
- Strip layout grid: video strips in accent color, finals strip labeled

### Deferred to Future Iterations

- Gantt accordion (evaluate Frappe Gantt or alternative)
- Bulk actions ("Apply to all [weapon]")
- Full override editor with expandable panels
- Customized badges on competition rows

---

## 8. Testing Strategy

### Store Tests (highest priority)

- Each slice: state mutations work correctly
- Stale tracking: tournament/competition mutations set both flags, referee mutations set only schedule flag
- `buildTournamentConfig()`: correctly assembles engine-compatible config from store state
- Serialization round-trip: save → JSON → load → state matches
- URL encoding round-trip: encode → base64url → decode → state matches
- Schema validation: reject malformed JSON, unknown fields, out-of-range values

### Component Tests (@testing-library/react)

All component tests run against the kitchen sink layout (everything visible, no navigation to manage). Wizard-specific tests only cover the step gating and navigation shell.

**Functional-level coverage (not just smoke):**

- **Render tests:** each section component renders without errors, key elements present
- **User flow tests:** select template → competitions populate → enter fencer counts → validate → generate schedule → results appear in output table
- **Input validation:** out-of-range fencer counts, missing required fields show errors
- **Store integration:** changing inputs updates store state, store changes re-render components
- **Save/load round-trip:** download config, upload it, UI state matches original
- **URL share round-trip:** generate URL, load from hash, UI state matches original
- **Error states:** malformed file upload shows error, corrupted URL hash shows error
- **Wizard-specific:** forward/back navigation, validation gates block forward on Step 4, layout toggle switches between modes

### Coverage Targets

- Store: 70%+
- Components: functional-level (key flows and integration, not exhaustive edge cases)
