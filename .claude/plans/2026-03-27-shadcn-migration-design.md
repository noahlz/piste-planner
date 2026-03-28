# shadcn/ui + Lucide Migration Design

## Goal

Replace all hand-rolled UI elements with shadcn/ui components and add Lucide icons throughout. Make the CompetitionMatrix more compact. Preserve all existing functionality and the Piste Planner color palette.

---

## 1. Setup & Infrastructure

### shadcn/ui Init

- Run `pnpm dlx shadcn@latest init` — this scaffolds:
  - `components.json` config file
  - `src/components/ui/` directory
  - CSS variable-based theming in `index.css`
  - `@/` path alias in `tsconfig.app.json` and `vite.config.ts`
- shadcn has native Tailwind v4 support — no `tailwind.config.ts` needed

### Theme Mapping

Map the existing `@theme` palette to shadcn's CSS variable convention. shadcn expects HSL variables like `--primary`, `--secondary`, `--muted`, etc. The existing hex palette maps to:

| Existing Token      | shadcn Variable    | Source Hex |
|--------------------|--------------------|------------|
| `--color-accent`   | `--primary`        | #6b7fa8    |
| `--color-accent-hover` | (computed)     | #576d91    |
| `--color-background` | `--background`   | #faf9f6    |
| `--color-card`     | `--card`           | #ffffff    |
| `--color-border`   | `--border`         | #475569    |
| `--color-body`     | `--foreground`     | #475569    |
| `--color-header`   | `--card-foreground`| #1e293b    |
| `--color-muted`    | `--muted-foreground`| #94a3b8   |
| `--color-danger`   | `--destructive`    | #a35b5b    |
| `--color-success`  | (custom)           | #5a8a6a    |
| `--color-warning`  | (custom)           | #fef3c7    |
| `--color-error`    | (custom)           | #fee2e2    |
| `--color-info`     | (custom)           | #dbeafe    |

Keep `--color-success`, `--color-warning`, `--color-error`, `--color-info` and their text variants as custom variables — shadcn doesn't have equivalents for all of these.

### Dependencies

- `lucide-react` — icon library
- shadcn components installed via CLI (each `pnpm dlx shadcn@latest add <component>`)

---

## 2. shadcn Components to Install

| shadcn Component | Replaces | Used In |
|-----------------|----------|---------|
| `Button`        | All hand-rolled `<button>` elements | ActionButtons, WizardShell, RefereeSetup, SaveLoadShare, AnalysisOutput, App |
| `Input`         | All `<input type="text/number">` | TournamentSetup, FencerCounts, CompetitionOverrides, RefereeSetup, SaveLoadShare |
| `Select`        | All native `<select>` elements | TournamentSetup, CompetitionOverrides, TemplateSelector |
| `Checkbox`      | All `<input type="checkbox">` | CompetitionMatrix, RefereeSetup |
| `Card`          | `.rounded-lg.border.border-slate-200.bg-card.p-3.shadow-sm` wrapper pattern | Every section component |
| `Label`         | `<label>` with `LABEL_CLASSES` | TournamentSetup, TemplateSelector |
| `Table`         | All `<table>` elements | FencerCounts, CompetitionOverrides, RefereeSetup, ScheduleOutput |
| `Badge`         | Severity labels, status pills, DefaultLabel | AnalysisOutput, ScheduleOutput, CompetitionOverrides |
| `Tooltip`       | CSS hover tooltip on Suggest button | RefereeSetup |
| `Toggle` / `ToggleGroup` | CompetitionMatrix checkboxes | CompetitionMatrix |
| `Tabs`          | Layout toggle (Single Page / Wizard) | App.tsx |
| `Alert`         | Validation/bottleneck message items | AnalysisOutput, ScheduleOutput |
| `Separator`     | Section dividers where needed | Various |

---

## 3. Component Migration Map

### App.tsx — LayoutToggle
- **Current**: Hand-rolled pill-shaped radio toggle
- **Target**: shadcn `Tabs` with `TabsList` + `TabsTrigger` — same visual concept, proper keyboard nav and ARIA
- **Icons**: Add `LayoutDashboard` (kitchen-sink) and `Wand2` (wizard) from Lucide

### WizardShell.tsx — StepIndicator
- **Current**: Hand-rolled numbered circles with inline SVG checkmark
- **Target**: Keep custom (shadcn has no stepper). Replace inline SVG with Lucide `Check` icon. Use shadcn `Button` for Back/Next with `ChevronLeft` / `ChevronRight` icons.
- **Scroll badge**: Replace with shadcn `Badge` + Lucide `ChevronsDown`

### TournamentSetup.tsx
- **Current**: `INPUT_CLASSES` / `SELECT_CLASSES` / `LABEL_CLASSES` constants
- **Target**: shadcn `Card`, `Label`, `Input`, `Select` components. Remove all class constants.
- **Icons**: `Calendar` for days, `Swords` for strips (Lucide)

### TemplateSelector.tsx
- **Current**: Native select in card wrapper
- **Target**: shadcn `Card` + `Select` (with `SelectTrigger`, `SelectContent`, `SelectItem`)
- **Icons**: `FileTemplate` or `LayoutTemplate`

### CompetitionMatrix.tsx — COMPACT REDESIGN
- **Current**: 3-column grid of 6 weapon/gender cards, each with a full table (Category × Individual/Team)
- **Target**: Compact chip/toggle layout:
  - 6 collapsible weapon/gender sections (use shadcn `Collapsible` or just toggle state)
  - Within each section: compact rows with category name + two small `Toggle` buttons labeled "I" and "T"
  - Selected state: filled accent color. Unselected: outline only.
  - This eliminates table headers per group and reduces vertical space significantly
  - Show count badge per group: "Women Foil (3)"
- **Alternative**: Use shadcn `Checkbox` in a dense 2-column grid (simpler, still more compact than current tables)
- **Recommendation**: Toggle buttons — more compact and visually clearer than checkboxes in a matrix

### FencerCounts.tsx
- **Current**: Table with inline number inputs
- **Target**: shadcn `Card` + `Table` + `Input` (type number). Keep tabular layout — it's appropriate here.

### CompetitionOverrides.tsx
- **Current**: Dense table with inline selects and number inputs
- **Target**: shadcn `Table` + `Select` + `Input` + `Badge` (replace `DefaultLabel` with a small Badge). The inline selects become shadcn Select components (smaller variant).

### RefereeSetup.tsx
- **Current**: Table + CSS hover tooltip + native checkbox
- **Target**: shadcn `Table` + `Input` + `Checkbox` + `Tooltip` (proper Radix tooltip) + `Button` (Suggest)
- **Icons**: `Lightbulb` for Suggest button

### ActionButtons.tsx
- **Current**: Two hand-rolled buttons (Validate, Generate Schedule)
- **Target**: shadcn `Button` variants — `default` for Validate, `success` (custom variant) for Generate Schedule
- **Icons**: `ShieldCheck` for Validate, `Play` for Generate Schedule

### AnalysisOutput.tsx
- **Current**: Severity-colored list items with inline styles
- **Target**: shadcn `Alert` with `AlertTitle` + `AlertDescription` for validation messages. shadcn `Button` (size "sm") for Accept/Reject. `Badge` for accepted/rejected status.
- **Icons**: `AlertCircle` (error), `AlertTriangle` (warn), `Info` (info), `Check` / `X` for accept/reject

### ScheduleOutput.tsx
- **Current**: Table + bottleneck list
- **Target**: shadcn `Table` (proper `TableHeader`, `TableRow`, `TableCell`) + `Alert` for bottlenecks
- **Icons**: `AlertTriangle` for bottleneck items

### SaveLoadShare.tsx
- **Current**: Multiple hand-rolled buttons, file input, text input
- **Target**: shadcn `Button` + `Input`. File input stays native (shadcn doesn't have one) but wrapped with Button-style trigger.
- **Icons**: `Download` (save), `Upload` (load), `Share2` (share), `Copy` / `Check` (copy button)

### DefaultLabel.tsx (common)
- **Current**: Renders "(default)" text with muted styling
- **Target**: shadcn `Badge` variant="outline" with muted colors. May become unnecessary if badge is used inline.

---

## 4. Custom Button Variants

shadcn's default Button has `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` variants. We need to add:

- **`success`** — maps to `--color-success` / `--color-success-hover` (for Generate Schedule, Accept)
- Keep `destructive` mapped to `--color-danger` (for Reject)

---

## 5. Migration Order

Ordered to minimize intermediate breakage:

1. **Setup** — shadcn init, path alias, theme CSS variables, install all components
2. **Primitives first** — Button, Input, Label, Select, Checkbox, Badge, Tooltip (these are leaf components used everywhere)
3. **Card wrapper** — Replace the repeated card pattern across all section components
4. **Table** — Migrate all table usages
5. **Section components** — TournamentSetup, TemplateSelector, FencerCounts, CompetitionOverrides, RefereeSetup, ActionButtons, SaveLoadShare
6. **CompetitionMatrix** — Redesign with Toggle/compact layout (biggest change, saved for when primitives are stable)
7. **Analysis & Schedule output** — Alert components for validation/bottleneck messages
8. **App chrome** — LayoutToggle (Tabs), WizardShell stepper icons, scroll badge
9. **Cleanup** — Remove unused CSS class constants, delete `App.css` if fully unused, verify no hand-rolled button/input/select patterns remain

---

## 6. Files Modified

| File | Change Type |
|------|-------------|
| `tsconfig.app.json` | Add `@/` path alias |
| `vite.config.ts` | Add path resolve for `@/` |
| `src/index.css` | Add shadcn CSS variables alongside existing theme |
| `src/components/ui/*` | New — shadcn component files |
| `src/components/sections/TournamentSetup.tsx` | Migrate to shadcn components |
| `src/components/sections/TemplateSelector.tsx` | Migrate to shadcn components |
| `src/components/sections/CompetitionMatrix.tsx` | Redesign with compact toggle layout |
| `src/components/sections/FencerCounts.tsx` | Migrate to shadcn components |
| `src/components/sections/CompetitionOverrides.tsx` | Migrate to shadcn components |
| `src/components/sections/RefereeSetup.tsx` | Migrate to shadcn components |
| `src/components/sections/ActionButtons.tsx` | Migrate to shadcn components |
| `src/components/sections/AnalysisOutput.tsx` | Migrate to shadcn components |
| `src/components/sections/ScheduleOutput.tsx` | Migrate to shadcn components |
| `src/components/sections/SaveLoadShare.tsx` | Migrate to shadcn components |
| `src/components/common/DefaultLabel.tsx` | Replace with Badge or remove |
| `src/components/wizard/WizardShell.tsx` | Lucide icons, shadcn Button |
| `src/components/wizard/WizardStep1-4.tsx` | Minor — wrappers, no direct UI elements |
| `src/App.tsx` | Tabs for layout toggle |
| `src/lib/utils.ts` | New — shadcn's `cn()` utility (clsx + tailwind-merge) |
| `package.json` | New deps: lucide-react, class-variance-authority, clsx, tailwind-merge |

---

## 7. What Stays the Same

- **Zustand store** — no state changes
- **Engine logic** — pure functions, untouched
- **Routing** — no router, same hash-based sharing
- **Responsive grid layouts** — same breakpoint strategy
- **Color palette** — same brand colors, just expressed as shadcn CSS variables
- **Accessibility** — shadcn components have built-in ARIA; net improvement

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| shadcn Tailwind v4 compatibility gaps | shadcn has supported TW4 since v2.2 (early 2025); widely tested |
| CompetitionMatrix redesign changes UX | Keep same data model; only presentation changes. If toggles feel wrong, fall back to shadcn Checkbox in dense grid |
| CSS variable conflicts between existing `@theme` and shadcn vars | Migrate to shadcn naming convention; remove old `@theme` vars after all components are migrated |
| Bundle size increase | shadcn is copy-paste (tree-shakes well); lucide-react supports individual icon imports. Minimal impact. |
