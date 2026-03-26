# Piste Planner — Technical & UX Design Specification

**Date:** 2026-03-25
**Status:** Draft
**PRD Reference:** `docs/plans/piste-planner-prd.md` (v6.0)

---

## 1. Overview

A single-page browser-only web application for planning USA Fencing regional and national tournament schedules. No backend — all computation runs client-side. Users configure tournaments through a guided wizard, the scheduling engine estimates timelines and flags conflicts, and the output is presented in a format matching USA Fencing published day schedules.

### Guiding Principles

- The PRD (v6.0) is the starting reference for the scheduling engine, not gospel. Adjust when implementation reveals issues.
- YAGNI — build what's needed, defer what isn't.
- Engine logic is pure TypeScript with zero UI dependencies, fully testable in isolation.

---

## 2. Tech Stack

| Layer | Choice | Docs | Notes |
|---|---|---|---|
| Build | **Vite** | [vite.dev](https://vite.dev) | Fast HMR, zero-config TypeScript. Vite is the modern successor to webpack/CRA — it serves source files over native ES modules during dev for near-instant startup, and bundles with Rollup for production. |
| UI | **React 19** | [react.dev](https://react.dev) | The industry-standard component library. We use functional components with hooks throughout — no class components. |
| State | **Zustand** | [github.com/pmndrs/zustand](https://github.com/pmndrs/zustand) | Minimal global state library (~3KB). Think of it as a lightweight alternative to Redux — you define a store with slices of state and actions, then any component can subscribe to just the part it needs. No boilerplate, no context providers. |
| Styling | **Tailwind CSS** | [tailwindcss.com/docs](https://tailwindcss.com/docs) | Utility-first CSS framework. Instead of writing separate CSS files, you apply small utility classes directly in JSX (e.g. `className="bg-white border rounded p-4"`). We configure a custom color palette for the paper/fencing theme. |
| Package manager | **pnpm** | [pnpm.io](https://pnpm.io) | Faster and more disk-efficient than npm/yarn. Uses a content-addressable store so packages are never duplicated across projects. |
| Unit tests | **Vitest** | [vitest.dev](https://vitest.dev) | Testing framework built on Vite — same config, same transforms, much faster than Jest for TypeScript projects. Uses a Jest-compatible API (`describe`, `it`, `expect`) so the syntax is familiar. |
| Component tests | **@testing-library/react** | [testing-library.com/docs/react-testing-library/intro](https://testing-library.com/docs/react-testing-library/intro/) | The standard for testing React components. Renders components into a virtual DOM and provides queries based on what users see (text, roles, labels) rather than implementation details like class names or component internals. |
| Coverage | **Vitest + v8** | [vitest.dev/guide/coverage](https://vitest.dev/guide/coverage) | Built-in `--coverage` with v8 provider. Reports line/branch/function coverage per file. |
| Linting | **ESLint 9** (flat config) | [eslint.org](https://eslint.org) | Static analysis tool that catches common bugs and enforces code style. We use `typescript-eslint` for TypeScript rules and `eslint-plugin-react-hooks` to enforce React hooks rules. |
| Formatting | **Prettier** | [prettier.io](https://prettier.io) | Opinionated code formatter. Runs automatically on save/commit to keep all code consistently formatted. Runs on `.ts`, `.tsx`, `.json`, `.css`. |
| Gantt visualization | **Frappe Gantt** | [github.com/frappe/gantt](https://github.com/frappe/gantt) | Lightweight open-source JS Gantt library (MIT). Zero dependencies, clean aesthetic. Evaluate vs React Modern Gantt during implementation; read-only use only. |
| Strip layout | **Custom CSS Grid** | [MDN CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout) | Too simple to justify a dependency — just styled rectangles in groups of 4. |

### Test Execution

```bash
pnpm exec vitest run --reporter=tap-flat --silent > test.log 2>&1
```

- TAP (flat) output for structured results
- `--silent` suppresses console.log noise
- Redirect to `test.log` — read only on failure

### Claude Hooks

`.claude/hooks/` post-edit hook runs:
```bash
pnpm exec prettier --write <changed-files>
pnpm exec eslint --fix <changed-files>
```

---

## 3. Project Structure

```
piste-planner/
├── src/
│   ├── app/                    # App shell, wizard controller
│   ├── components/
│   │   ├── wizard/             # Wizard step screens
│   │   ├── schedule/           # Schedule output views
│   │   └── common/             # Shared UI (buttons, badges, inputs)
│   ├── engine/                 # Pure TS scheduling engine (no React imports)
│   │   ├── types.ts            # All PRD enums + data types
│   │   ├── constants.ts        # PRD Section 17 constants, duration tables
│   │   ├── catalogue.ts        # 78 fixed competitions, template definitions
│   │   ├── crossover.ts        # build_penalty_matrix(), crossover_penalty()
│   │   ├── pools.ts            # Pool sizing, construction, cut logic (Section 7)
│   │   ├── de.ts               # DE duration estimation, bracket sizing (Section 10)
│   │   ├── refs.ts             # calculate_optimal_refs(), pod captain sizing (Section 8)
│   │   ├── flighting.ts        # Flighting group logic, strip sharing (Section 9)
│   │   ├── resources.ts        # Strip/ref allocation, GLOBAL_STATE tracking (Section 11)
│   │   ├── dayAssignment.ts    # Day assignment algorithm (Section 12)
│   │   ├── scheduleOne.ts      # Schedule single competition (Section 13)
│   │   ├── scheduler.ts        # schedule_all() master orchestrator (Section 14)
│   │   ├── validation.ts       # Pre-flight validation, hard error checks (Section 15)
│   │   └── analysis.ts         # initial_analysis() — deficits, flighting, equity (Section 9)
│   ├── store/                  # Zustand store slices
│   │   ├── tournamentSlice.ts  # Tournament type, days, day windows, strips
│   │   ├── competitionSlice.ts # Selected competitions, fencer counts, overrides
│   │   ├── refereeSlice.ts     # Optimal vs actual refs per day, fill-in decisions
│   │   ├── analysisSlice.ts    # Analysis results, flighting suggestions, validation errors
│   │   ├── scheduleSlice.ts    # Computed schedule results, bottlenecks
│   │   └── uiSlice.ts          # Current wizard step, stale indicator, accordion states
│   ├── templates/              # Tournament preset configurations
│   ├── theme/                  # Tailwind config + custom palette
│   └── utils/                  # JSON save/load, URL encoding, helpers
├── __tests__/
│   ├── engine/                 # Unit tests mirroring src/engine/
│   ├── components/             # Component tests mirroring src/components/
│   ├── store/                  # Store tests
│   └── utils/                  # Utility tests
├── public/
├── index.html
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── package.json
```

Each engine file maps to 1–2 PRD sections for traceability.

---

## 4. Application Flow

### Wizard Screens

| Screen | PRD Phase | Content |
|---|---|---|
| **Landing** | — | "New Tournament" / "Load Configuration" |
| **Step 1: Tournament Setup** | 1a–1d | Tournament type, days, per-day start/end times, strip count + video count, template selection → competition checklist |
| **Step 2: Event Configuration** | 1e–1g | Fencer counts (inline editable table), per-competition overrides (defaults hidden, customized badges visible, bulk actions), global config overrides (duration tables, gaps) |
| **Step 3: Referee Setup** | 1.5a–1.5f | Optimal refs calculated and displayed. Side-by-side optimal vs actual per day, split by foil/epee and sabre. Sabre fill-in suggestions when actual < optimal. |
| **Step 4: Analysis & Flighting** | 1h–1k | Pre-validation errors (block progress). Initial analysis: strip deficit warnings, flighting suggestions (auto with manual override), video demand warnings, cut summary, gender equity validation. User accepts/modifies/confirms. |
| **Schedule Output** | 2a–2d | USA Fencing-style grid, Gantt accordion per day, diagnostics panel, strip layout grid. Actions: Save, Share, Start New. |

### Navigation

- Back/forward buttons on all wizard steps.
- "Results outdated" banner on Schedule Output when upstream config has changed.
- "Regenerate" button to re-run analysis/scheduling.
- Landing page always accessible via app logo/title.

### Per-Day Time Windows

- `day_start_time`: default 8:00 AM, configurable per day in 30-minute increments.
- `day_end_time`: default 10:00 PM, configurable per day in 30-minute increments.
- `latest_start_time`: calculated automatically as `day_end_time - 6 hours`. Not user-configurable — hard constraint.

---

## 5. Competition Selection

### Templates

Preset tournament configurations based on common NAC/ROC/RYC/RJCC formats. User selects a template or starts blank, then modifies freely.

| Template | Days | Events |
|---|---|---|
| NAC Youth | 3 | Y10, Y12, Y14, Cadet — all weapons, both genders, individual |
| NAC Cadet/Junior | 3 | Cadet + Junior — all weapons, both genders, individual + team |
| NAC Div1/Junior | 3 | Div1 + Junior — all weapons, both genders, individual + team |
| NAC Vet/Div1/Junior | 3–4 | Veteran (all age groups + combined) + Div1 + Junior — all weapons, both genders, individual + team |
| ROC Div1A/Vet | 2 | Div1A + Veteran (age groups, no combined) — all weapons, both genders, individual only |
| ROC Div1A/Div2/Vet | 2 | Div1A + Div2 + Veteran (age groups, no combined) — all weapons, both genders, individual only |
| ROC Mega | 2–3 | Y10, Y12, Y14, Cadet, Junior, Div1A, Div2 — all weapons, both genders, individual only (no Div1, no Vet Combined, no Y8, no Div3) |
| RYC Weekend | 2 | Y10–Y14 — all weapons, both genders |
| RJCC Weekend | 2 | Cadet + Junior — all weapons, both genders |
| Blank | — | Empty |

### Competition Checklist

- Filterable table with checkboxes.
- Filter dropdowns: gender, weapon, category, event type.
- Template pre-populates selections; user adds/removes freely.

### Fencer Counts

- Inline editable table — one row per selected competition.
- Number input + ESTIMATED/CAPPED toggle per row.
- Templates may pre-populate suggested counts.

---

## 6. Per-Competition Configuration

### Defaults & Overrides

PRD defines sensible defaults per category (Sections 18, 19). Most organizers won't change most events.

- Each event row shows a "defaults" badge when using PRD defaults.
- Events with overrides show a "customized" badge listing changed fields (e.g., "DE: Staged, Video: Required").
- Filter/toggle: "Show all / Show customized only."
- "Customize" button per row expands inline editor.
- Bulk actions: "Apply to all [weapon]" or "Apply to all [category]."

### Configuration Scope

**Tournament-global settings** (set once):

| Setting | Default | Notes |
|---|---|---|
| `tournament_type` | NAC | Determines if capping is allowed |
| `days_available` | — | 2–4 days |
| `day_start_time` | 8:00 AM | Per-day override available |
| `day_end_time` | 10:00 PM | Per-day override available |
| Strip count | — | Total strips (multiples of 4) |
| Video strip count | — | First N strips are video (A-pod first, then B-pod) |
| `pod_captain_override` | AUTO | AUTO / DISABLED / FORCE_4 |
| `ADMIN_GAP_MINS` | 15 | Pool → DE gap |
| `FLIGHT_BUFFER_MINS` | 15 | Flight A → B gap |
| `pool_round_duration_table` | Per weapon | Epee:120, Foil:90, Sabre:60 |
| `de_duration_table` | Per weapon × bracket size | See PRD Section 2.5 |

**Per-competition settings** (override individually):

| Setting | Default | Notes |
|---|---|---|
| `fencer_count` | — | Required input |
| `fencer_count_type` | ESTIMATED | ESTIMATED or CAPPED |
| `ref_policy` | AUTO | ONE / TWO / AUTO |
| `de_mode` | SINGLE_BLOCK | SINGLE_BLOCK or STAGED_DE_BLOCKS |
| `de_video_policy` | Per category | REQUIRED (Div1/Junior/Cadet), BEST_EFFORT (others) |
| `de_finals_strip_id` | NULL | Specific strip for gold bout |
| `de_finals_strip_requirement` | — | HARD / IF_AVAILABLE (only if finals strip set) |
| `de_round_of_16_strips` | 4 | STAGED only |
| `de_round_of_16_requirement` | — | HARD / IF_AVAILABLE (STAGED only) |
| `de_finals_strips` | 1 | STAGED only |
| `de_finals_requirement` | — | HARD / IF_AVAILABLE (STAGED only) |
| `cut_mode` | Per category | See PRD Section 18 |
| `cut_value` | 20% or 100% | Depends on category |
| `use_single_pool_override` | FALSE | Only valid when fencer_count ≤ 10 |

**Per-day settings** (referee phase):

| Setting | Default |
|---|---|
| `foil_epee_refs` | Calculated optimal |
| `sabre_refs` | Calculated optimal |
| `allow_sabre_ref_fillin` | FALSE (engine suggests when needed) |

---

## 7. State Management

### Zustand Store Slices

```
store/
├── tournamentSlice.ts    # Tournament type, days, day windows, strips
├── competitionSlice.ts   # Selected competitions, fencer counts, per-event overrides
├── refereeSlice.ts       # Optimal vs actual refs per day, fill-in decisions
├── analysisSlice.ts      # Analysis results, flighting suggestions, validation errors
├── scheduleSlice.ts      # Computed schedule results, bottlenecks
└── uiSlice.ts            # Current wizard step, stale indicator, accordion states
```

### Stale Tracking

- Mutations in `tournamentSlice` or `competitionSlice` → set `analysisSlice.isStale = true` and `scheduleSlice.isStale = true`.
- Mutations in `refereeSlice` → set `scheduleSlice.isStale = true` only.
- "Results outdated" banner renders when `scheduleSlice.isStale === true`.
- "Regenerate" button clears stale flags and re-runs engine.

### Serialization

- `tournamentSlice` + `competitionSlice` + `refereeSlice` + `scheduleSlice` serialize to JSON for save/load.
- `uiSlice` and `analysisSlice` are transient (analysis re-derives from config).
- Engine functions are called from wizard steps; results written into `analysisSlice` / `scheduleSlice`. Engine never touches the store directly.

---

## 8. Schedule Output Views

### Primary View — USA Fencing-Style Grid

- 6 columns: Women's Epee, Women's Foil, Women's Saber, Men's Epee, Men's Foil, Men's Saber.
- One row per day (day name + date in left header).
- Cells contain: category name + start time, stacked when multiple events per cell.
- Flighted events marked with asterisk (*) and footnote.
- Warning/error icons per event entry — click/hover for detail tooltip.
- Cell background tinting: pastel yellow-orange for warnings, pastel pink-red for errors, no tint for clean.

### Gantt Accordion (Per Day)

- Expandable below each day row (collapsed by default).
- Horizontal timeline from day start to day end.
- Bars per event showing pool phase and DE phase as distinct segments.
- Strip count and ref count on hover.
- Library: Frappe Gantt or React Modern Gantt (evaluate during implementation).

### Diagnostics Panel

- Collapsible panel below the full schedule grid.
- Issues grouped by severity: Errors → Warnings → Info.
- Each issue: affected event, human-readable cause, detail message, delay minutes.
- Click an issue to highlight the corresponding cell in the schedule grid.

### Strip Layout Grid

- Compact visualization below diagnostics.
- Pods of 4 as grouped rectangles rendered with CSS Grid.
- Video strips in accent color, finals strip labeled.
- Summary line: total count and video count.

---

## 9. Save, Load & Share

### Save/Load (JSON File)

- File extension: `.piste.json`
- Contains: tournament config, competition selections + overrides, referee availability, computed schedule results + bottlenecks.
- Schema version field: `"schemaVersion": 1` for forward compatibility.
- On load: validate schema version, hydrate store, render schedule if results present, otherwise start at last incomplete wizard step.
- Browser native: `<a download>` for save, `<input type="file">` for load.

### Share (URL Hash)

- Config serialized → JSON → gzip → base64url (RFC 4648) → `#config=<encoded>`.
- On app load: check for hash, decode → validate schema → hydrate store → render schedule.
- If encoded config exceeds 2KB: show message "Configuration too large for URL sharing — use Save instead."
- XSS safety: hash fragment never sent to server. Decoded JSON validated against schema before hydrating. No `eval`, no `innerHTML`, no arbitrary code execution.

### Schema Validation (Both File and URL)

- Validate against expected types and value ranges.
- Reject unknown fields.
- Graceful error message on invalid input.

---

## 10. Visual Design

### Theme

| Element | Color | Notes |
|---|---|---|
| Background | Warm off-white/cream | Paper feel |
| Cards/panels | White | Subtle shadow |
| Borders | Medium slate-blue (#3B5998 range) | Evocative but distinct from USA Fencing brand |
| Accent | Light blue (#4FA8D1 range) | Interactive elements |
| Warning cells | Pastel yellow-orange (#FEF3C7 range) | Schedule grid warnings |
| Error cells | Pastel pink-red (#FEE2E2 range) | Schedule grid errors |
| Info badges | Pastel blue (#DBEAFE range) | Customized/status badges |
| Headers | Dark slate-blue | Readable, professional |
| Body text | Neutral gray | Clean readability |

### Key Components

| Component | Purpose |
|---|---|
| `WizardShell` | Back/forward nav, step indicator, stale banner |
| `TemplateSelector` | Template cards + "Start blank" option |
| `CompetitionChecklist` | Filterable table with checkboxes, grouped by category |
| `FencerCountTable` | Inline editable table, ESTIMATED/CAPPED toggle per row |
| `OverrideEditor` | Expandable panel per event, customized badges, bulk actions |
| `AnalysisPanel` | Validation errors, flighting suggestions, warnings |
| `RefereeSetup` | Side-by-side optimal vs actual, per-day rows, fill-in prompts |
| `ScheduleGrid` | USA Fencing-style 6-column schedule table |
| `GanttAccordion` | Expandable per-day timeline under schedule grid |
| `DiagnosticsPanel` | Collapsible issue list grouped by severity |
| `StripLayoutGrid` | Compact pod visualization, video strips highlighted |
| `ShareDialog` | URL generation, copy button, length warning |

---

## 11. Testing Strategy

### Test-Driven Development (TDD)

Engine modules are built test-first. For each engine function, write a failing test that captures the PRD's expected behavior before writing the implementation. This is especially important given the PRD may have gaps or ambiguities — a failing test makes the expected behavior explicit and surfaces spec issues early.

TDD applies to: `pools.ts`, `de.ts`, `refs.ts`, `crossover.ts`, `dayAssignment.ts`, `scheduler.ts`, `validation.ts`, `analysis.ts`.

TDD is optional for: `catalogue.ts`, `constants.ts` (data, not logic), store slices, and UI components.

### Engine Tests (Highest Priority — Test-First)

- Unit tests for every engine module against PRD expected behavior.
- Table-driven tests for: pool sizing (Section 7), DE duration estimation (Section 10), crossover penalty matrix (Section 4), cut promotion counts (Section 18).
- Integration tests for `schedule_all()` using each template tournament config.
- Edge cases: min/max fencer counts (2 and 500), single-day tournaments, zero video strips, all events on one day, sabre fill-in accepted vs rejected.

### Store Tests

- Stale tracking: mutations in config slices set downstream `isStale` flags correctly.
- Serialization round-trip: save → JSON → load → state matches original.
- URL encoding round-trip: encode → base64url → decode → state matches original.
- Schema validation: reject malformed JSON, unknown fields, out-of-range values.

### Component Tests — @testing-library/react

Component tests use [@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/) with Vitest. Tests query the DOM by user-visible text and ARIA roles — never by class names or internal component state.

- Wizard navigation: forward/back buttons advance/retreat steps; validation gates block progress when required fields are missing.
- Schedule grid: correct events appear in correct weapon/gender column cells.
- Warning/error icons: appear on event entries that have bottlenecks.
- File load: uploading a `.piste.json` hydrates the store and renders the schedule.

### Coverage Targets

- `engine/`: 90%+
- `store/`: 70%+
- `components/`: smoke-level (key user flows covered, not exhaustive)

---

## 12. Pending Items

- [x] Rename `CONCURRENT_PAIR` → `FLIGHTING_GROUP` throughout the PRD (completed 2026-03-25).
- [ ] Evaluate Frappe Gantt vs React Modern Gantt during implementation.
- [ ] Determine Gantt bar color scheme (by category or weapon) during implementation.
- [ ] Verify TAP reporter package availability for Vitest.
