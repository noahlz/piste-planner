# Phase 3 — Matrix viewer (read-only visx component)

Part of the four-phase Strip-Time Matrix Allocation Model rollout. See the
meta-plan at `~/.claude/plans/i-want-to-adjust-calm-rabin.md` for the full
vision and locked decisions. Depends on Phase 1; benefits from Phase 2 for
the STRICT-vs-FLUID side-by-side display but does not strictly require it
(the FLUID column can be hidden until Phase 2 lands).

## Context

Until now the only visualization of strip allocation has been the ASCII lane
renderer (`src/tools/asciiLaneRenderer.ts`), useful for terminal debugging
and integration-test snapshots but not for the UI. This phase adds a
production visx-based **strips × 5-min-blocks matrix** that renders the
default empirical schedule and, when Phase 2 has shipped, the FLUID
alternative side-by-side for what-if comparison.

The component is **read-only** in this phase. Drag-drop repair lands in
Phase 4.

## Scope

### Dependencies (`package.json`)
- Add: `@visx/scale`, `@visx/group`, `@visx/axis`, `@visx/shape`, `@visx/tooltip`, `@visx/responsive`.
- Verify React 19 peer-deps. As of late 2024, several `@visx/*` 3.x
  sub-packages still declare React `^16/^17/^18` peer deps. Add
  `overrides` in `package.json` to satisfy installation:
  - `"overrides": { "react": "$react", "react-dom": "$react-dom" }`
  Or pin the specific visx packages and use `--legacy-peer-deps` with a
  documented note. Pick whichever produces the cleanest install on the
  current Node version.
- After install, smoke-test: import `<Bar>` from `@visx/shape` in a test
  React component and confirm no runtime warnings in StrictMode.

### Store integration (`src/store/store.ts`)
- Currently `scheduleAll` returns `strip_allocations` but the store does not
  persist it. Expose:
  ```
  scheduleResultsStrict: { schedule, bottlenecks, ref_requirements_by_day, strip_allocations }
  scheduleResultsFluid: same shape | null
  ```
- After Phase 2 ships, an action `runFluid()` calls `scheduleAll` with
  `video_stage_mode = 'FLUID'` and stores under `scheduleResultsFluid`.
- Until Phase 2 ships, only `scheduleResultsStrict` is populated and the
  matrix renders a single panel.

### Matrix component (`src/components/ScheduleMatrixVisx.tsx` — new)
- Props: `{ schedule, strip_allocations, config, competitions, label }`.
- Layout:
  - Left margin: strip labels (`S0`, `S1`, …, `V0`, `V1` for video-capable strips).
  - X axis: time, 5-min ticks, hour labels.
  - One row per strip; row height ~22px; total height = `strips_total × row_height`.
  - For very wide schedules (long days), use `<ParentSize>` for responsive width.
- Bars: one `<Bar>` per allocation interval per strip. Color by phase using the palette below (lifted from the deprecated `schedule-visualizer.md`). Phase abbreviations rendered inside the bar when wide enough.
- Tooltip on hover: event id, phase, allocation start/end time as HH:MM, duration. When Phase 4 introduces per-bout allocations, the tooltip also shows bout index and round.
- Multi-day support: render one matrix per day vertically stacked, separated by a 16px gap and a day-header bar.

### STRICT-vs-FLUID comparison view
- When both `scheduleResultsStrict` and `scheduleResultsFluid` are populated, render two `<ScheduleMatrixVisx>` side-by-side (or stacked on narrow viewports) with synchronized x-axis ranges.
- A "Re-pack tightly (FLUID)" button in the schedule view triggers `runFluid()`.
- A summary banner above the comparison shows: events scheduled (S/F), total tournament end time delta (FLUID is ≤ STRICT), peak concurrent strip usage delta.

### Phase color palette (lifted from `schedule-visualizer.md`)

| Phase | Color |
|-------|-------|
| `POOLS` (incl. `FLIGHT_A` / `FLIGHT_B`) | `#4a90d9` (blue) |
| `DE_PRELIMS` | `#e8a838` (amber) |
| `DE` (single-stage) | `#e06b3f` (orange) |
| `DE_ROUND_OF_16` | `#e06b3f` (orange) |
| `DE_FINALS` | `#c0392b` (crimson) |
| `DE_FINALS_BRONZE` | `#8e44ad` (purple) |

### ASCII renderer tune-up (`src/tools/asciiLaneRenderer.ts`)
- Adjust `MINS_PER_CHAR` so the renderer reflects 5-min granularity. Pick a value that keeps the 14-hour-day × 80-strip layout inside 120 columns. `MINS_PER_CHAR = 10` continues to fit; consider keeping it for terminal readability and document that ASCII renders at 10-min/char while engine snaps at 5-min/slot.
- Add a unit test verifying B7/B8 outputs do not exceed 120 columns.

### Methodology (`METHODOLOGY.md`)
- New §Visualization Outputs section documenting:
  - ASCII renderer (`PISTE_VISUALIZE=1`) for terminal/snapshot debugging.
  - visx matrix component for the UI.
  - STRICT-vs-FLUID comparison workflow.

## Files to modify (summary)

- `package.json` (visx deps + overrides)
- `src/store/store.ts` (expose strip_allocations + Strict/Fluid result keys)
- `src/components/ScheduleMatrixVisx.tsx` (new)
- `src/components/ScheduleView.tsx` or equivalent host (mount the matrix)
- `src/tools/asciiLaneRenderer.ts` (granularity tune)
- `__tests__/tools/asciiLaneRenderer.test.ts` (column count regression)
- `__tests__/components/ScheduleMatrixVisx.test.tsx` (new — render smoke test, color mapping, tooltip content)
- `METHODOLOGY.md` (Visualization Outputs)

## Reused functions and primitives

- Phase color palette from `schedule-visualizer.md` (about to be deleted, but values are preserved here).
- `dayStart`, `dayEnd`, `findDayForTime` (`src/engine/types.ts`) for time → x mapping.
- ASCII renderer architecture as the design reference for the visx component (same per-strip walking pattern, just rendered to SVG instead of text).

## Acceptance

- visx packages installed cleanly; no runtime warnings in StrictMode.
- `<ScheduleMatrixVisx>` renders B1 in the dev server with readable strip lanes, hour-labeled axis, phase-colored bars, and working tooltips on hover.
- After Phase 2 ships, the side-by-side STRICT/FLUID comparison renders both schedules with synchronized x-axis.
- `pnpm test` passes including the new component smoke test.
- ASCII renderer column-count regression test passes.

## Verification

```
pnpm install
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
pnpm dev
# open the schedule view in a browser; load a B-scenario; confirm matrix renders
PISTE_VISUALIZE=1 timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1
```

After visual verification, dispatch the `react-code-reviewer` agent on the
new component.

## Risks

- **visx React 19 peer deps**: may require `overrides` in `package.json`.
  Document the choice and rationale in the PR description so future
  upgrades don't regress.
- **Bar count**: 80 strips × ~10 allocations/strip/day × 3 days = ~2400
  bars. SVG handles this comfortably but watch for slowdowns on B6/B8 with
  many small allocations once Phase 4's bout-level splits land.
- **Tooltip implementation**: visx's `useTooltip` + `<TooltipWithBounds>`
  is the idiomatic path; avoid hand-rolling unless visx's wrapper is
  unsuitable.
- **Side-by-side layout**: on narrow viewports the two matrices may need to
  stack vertically. Use `<ParentSize>` and a min-width threshold.
- **Color contrast**: the `DE_FINALS_BRONZE` purple may be hard to
  distinguish from `DE_FINALS` crimson on some monitors; accept for v1 and
  iterate based on user feedback.

## Out of scope

- Drag-drop interactivity (Phase 4).
- Per-bout rendering when Phase 2 has not shipped yet (the matrix shows
  block allocations only until FLUID is invoked).
- Animation between STRICT and FLUID transitions.
- Export to PNG / PDF (future polish).

## Notes for the executing session

- No pre-written code in this plan. Implementation during execution.
- User runs commits manually.
- After the component is built and tested, dispatch
  `react-code-reviewer` and `test-quality-reviewer` agents per project
  methodology.
