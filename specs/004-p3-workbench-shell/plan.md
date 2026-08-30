# Implementation Plan: P3 Workbench Shell and Canvas

**Branch**: `004-p3-workbench-shell` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-p3-workbench-shell/spec.md`

## Summary

Replace both existing layouts with a single full-bleed workbench, then give its
center region a strips × time matrix the organizer can read and navigate. Two
backlog items ride along: per-type defaults in the rail's Advanced panel, and a
top-bar gears surface over the settings the store already carries.

Almost all of this is presentation over data P2 already derives. Two pieces are
not:

- **Referee defaults are a behavior change, not a new feature.**
  `RefPolicy.AUTO` is the store default on every event and
  `src/engine/pools.ts:166` resolves it identically to `TWO`, so it is a dead
  alias today. Making it mean "2 refs per pool at NAC, SJCC, and SYC, 1
  elsewhere" is what the constant was always for, and it changes referee demand
  on regional presets. Constitution III governs it – see [research D5](./research.md).
- **The live smoke driver has no surviving locators.** Every step in
  `scripts/smoke.mjs` targets the `Single Page` tab, the `Wizard` tab, or
  `Generate Schedule`. Constitution VI forbids rewriting it from scratch, so it
  is re-targeted step by step alongside the UI that replaces each one.

The canvas is drawn as plain SVG with arithmetic scales rather than with visx,
which the design document names. That is a deliberate departure and
[research D1](./research.md) carries the reasoning and the cost of reversing it.

## Technical Context

**Language/Version**: TypeScript 5.9 with `erasableSyntaxOnly`, React 19.2

**Primary Dependencies**: React, Zustand 5, Radix (via `radix-ui` 1.4) behind
shadcn/ui wrappers, Tailwind CSS 4, lucide-react. **No new runtime dependency is
added by this feature** – see research D1, D2, and D3 for why visx, a
virtualization library, and a tooltip library were each evaluated and rejected.

**Storage**: Tournament state serializes to a URL fragment via
`src/store/serialization.ts` (`schemaVersion: 2`). Viewer preferences are new
and go to `localStorage`, deliberately outside the serializer (research D10).

**Testing**: Vitest 3 with React Testing Library and jsdom for unit and
component tests, `scripts/smoke.mjs` on playwright-core for live verification.

**Target Platform**: Desktop browser. Mobile and touch are out of scope per the
design.

**Project Type**: Single-page React application over a pure TypeScript engine.

**Performance Goals**: Pan and zoom keep up with the gesture on the largest
supported tournament – 80 strips across 14 days, 1,120 rows. The recompute
budget is already established: full `scheduleAll` on the largest preset runs in
9ms (design §Motivation), so the constraint is render volume, not computation.

**Constraints**: The engine stays pure (constitution I) – no work in this
feature adds state, React, or store reads to `src/engine/`. `buildConfig.ts`
remains the only bridge, and the three per-type defaults resolve there.

**Scale/Scope**: 16 category encoding values, up to 1,120 canvas rows, 5 user
stories, ~79 existing tests to prune or re-target, 7 components deleted.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1.*

| Principle | Verdict | Basis |
|---|---|---|
| **I. Pure Engine Core** | PASS | All work lands in `src/components/` and `src/store/`. The three per-type defaults resolve in `buildConfig.ts`, joining the regional cut override already at line 139 – the engine's signatures and purity are untouched. Block geometry stays derived, never stored (FR-013). |
| **II. Test-First** | PASS | Every story writes its tests first and confirms they fail for the stated reason. `test-quality-reviewer` is dispatched after each task that adds or edits tests, `react-code-reviewer` after each task touching React – both are named in `tasks.md` rather than left to judgment. |
| **III. Behavior Drift** | **GATE – one deliberate drift** | Research D5 changes referee demand for tournament types outside NAC, SJCC, and SYC. Exactly one preset is affected (B6, ROC). B1–B8 run before and after, the diff is explained rather than accepted, and the before/after referee figures are recorded in the commit that makes the change. No other task in this feature may change engine output; FR-050 and SC-011 assert that. |
| **IV. Bounded Computation** | PASS | Row windowing and time windowing are direct index arithmetic over uniform row heights (research D2). Zoom is a direct scale computation. Nothing in this feature iterates to convergence. |
| **V. Erasable TypeScript** | PASS | New unions – the row-height step, the view mode, the DE mode setting – are `as const` objects with derived union types, matching `RefPolicy` and `DeMode`. |
| **VI. The App Is Verified Live** | PASS | `scripts/smoke.mjs` is re-targeted in the same task that reshapes each surface it asserts on, never in a cleanup task at the end and never rewritten from scratch. Its accumulated corrections are preserved as comments where the selector they describe survives in a new form. |

### Design departure

Not a constitution violation, but it revises an approved design decision and is
recorded here so it is not mistaken for an oversight.

| Design says | Plan does | Where the reasoning lives |
|---|---|---|
| The canvas is built with visx, using `useTooltip` and `TooltipWithBounds` | Plain SVG with arithmetic scales, and the existing Radix tooltip primitive driven as a controlled component from a single canvas-level pointer handler | [research D1](./research.md), [D3](./research.md) |

The design's own reasoning for naming visx – that it does not virtualize, so the
canvas must window itself – is the reasoning for not adopting it. Once the
component windows its own rows and time range, what remains of visx is a scale
wrapper and an axis renderer over arithmetic the component already does.
Reversing this decision costs one task and adds four packages; research D1
records exactly which.

## Git Flow

**Worktree** (constitution §Git Ownership). Subagents commit incrementally to
`004-p3-workbench-shell` inside the worktree. Drift counts, before-and-after
referee figures, and deliberate corrections belong in those commit messages. The
user lands the branch with `git merge --no-ff --no-commit` completed by
`commit-with-costs`, so cost trailers ride the merge commit and every branch
commit survives.

## Project Structure

### Documentation (this feature)

```text
specs/004-p3-workbench-shell/
├── spec.md
├── plan.md              # this file
├── research.md          # D1–D12, the decisions above and their alternatives
├── data-model.md        # store slices, view state, palette, settings shapes
├── contracts/
│   └── ui-contract.md   # what each region owes the organizer, and the encoding
├── quickstart.md        # how to verify this feature end to end
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks output – not created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── engine/                       # UNCHANGED by this feature (constitution I)
│   ├── constants.ts              #   read for defaults; the 4 P1 constants gain
│   │                             #   no new behavior, only a UI surface
│   ├── pools.ts                  #   resolveRefsPerPool untouched – D5 resolves
│   │                             #   AUTO before the engine is called
│   └── types.ts                  #   Competition/TournamentConfig unchanged
│
├── store/
│   ├── store.ts                  # layoutMode deleted; globalOverrides widened;
│   │                             #   view-state slice added (not serialized)
│   ├── buildConfig.ts            # resolves the 3 per-type defaults, alongside
│   │                             #   the regional cut override already at :139
│   ├── serialization.ts          # widened settings; view state stays out
│   ├── derived.ts                # scorecard metric selectors
│   ├── typeDefaults.ts           # NEW – the per-type default table
│   └── viewState.ts              # NEW – localStorage-backed viewer prefs
│
├── data/tournaments.ts           # preset source, already in place from P2
│
└── components/
    ├── workbench/                # NEW – the shell
    │   ├── WorkbenchShell.tsx    #   the four regions
    │   ├── TopBar.tsx            #   presets, inline controls, actions, gears
    │   ├── Rail.tsx              #   collapsible panels
    │   ├── AdvancedPanel.tsx     #   per-type defaults, dim on collapse
    │   ├── UnplacedTray.tsx
    │   ├── Drawer.tsx            #   findings + scorecard
    │   ├── Scorecard.tsx
    │   └── SettingsPanel.tsx     #   the gears surface
    ├── canvas/                   # NEW – the matrix
    │   ├── MatrixCanvas.tsx      #   windowing, day groups, gutter, axis
    │   ├── EventBlock.tsx        #   fill, edge-bar, hatch, icon, label
    │   ├── WeaponGlyphs.tsx      #   foil, épée, sabre – lucide has none
    │   ├── CanvasTooltip.tsx     #   controlled Radix tooltip, virtual anchor
    │   └── palette.ts            #   16 values as 4 hue families
    ├── sections/                 # survivors become rail panels
    │   ├── StripSetup.tsx        #   → rail
    │   ├── FencerCounts.tsx      #   → rail
    │   ├── CompetitionOverrides.tsx  # → rail
    │   ├── TournamentSetup.tsx   #   → split between top bar and rail
    │   ├── AnalysisOutput.tsx    #   → findings list + invalid overlay
    │   ├── ScheduleOutput.tsx    #   → Schedule view behind the toggle
    │   ├── PoolDurationSettings.tsx  # → moves behind the gears
    │   ├── TemplateSelector.tsx  #   DELETED – superseded by the preset picker
    │   └── ActionButtons.tsx     #   DELETED – actions move to the top bar
    ├── wizard/                   # DELETED ENTIRELY (5 files)
    ├── KitchenSinkPage.tsx       # DELETED
    └── ui/                       # shadcn primitives, unchanged

__tests__/
├── components/
│   ├── WizardShell.test.tsx      # DELETED (27 tests)
│   ├── KitchenSinkPage.test.tsx  # DELETED (52 tests), behavior re-targeted
│   ├── workbench/                # NEW
│   └── canvas/                   # NEW
├── store/                        # typeDefaults, viewState, scorecard selectors
└── engine/                       # unchanged except B1–B8 referee re-baseline

scripts/smoke.mjs                 # re-targeted step by step (constitution VI)
```

**Structure Decision**: The existing `src/components/sections/` directory keeps
the components that become rail panels or views, so their tests and their
accumulated behavior move rather than being rewritten. Two new directories
separate the shell from the canvas, because the canvas is the only part of this
feature with non-trivial rendering mechanics and it benefits from being
reviewable on its own. `src/engine/` is not in the tree above except as a read
dependency – that is the point.

## Story Sequencing

Each story is independently shippable, in this order.

| | Story | Ships | Depends on |
|---|---|---|---|
| **US1** | Workbench shell | One screen, wizard and kitchen sink deleted, schedule table in the center | – |
| **US2** | Matrix canvas | The matrix, the encoding, zoom, windowing, tooltip, and the view toggle | US1 |
| **US3** | Scorecard | Drawer metrics with preset-baseline deltas | US1 (US2 for metric-hover highlighting) |
| **US4** | Per-type defaults | The Advanced panel and the three defaults | US1. **Carries the D5 drift gate.** |
| **US5** | Gears surface | The settings panel and its overrides | US1 |

US1's center content is the existing schedule table, so the shell is
demonstrable before the canvas exists. US2 adds the matrix and the toggle, and
the matrix becomes the default view at that point.

US4 is the only story that changes engine output. It is sequenced after the
shell so the drift work is not entangled with layout churn, and its checkpoint
does not close until the B1–B8 diff is explained.

## Complexity Tracking

No constitution violations require justification. The one judgment call that
departs from an approved artifact – rejecting visx – is recorded in the Design
departure table above and in research D1, with the reversal cost stated.
