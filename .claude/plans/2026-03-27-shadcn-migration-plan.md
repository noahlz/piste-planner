# shadcn/ui + Lucide Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hand-rolled UI primitives with shadcn/ui components and Lucide icons, redesign CompetitionMatrix for compactness, and preserve all existing functionality.

**Architecture:** Install shadcn/ui with Tailwind v4 support, map existing color palette to shadcn CSS variables, then migrate each section component bottom-up (primitives → containers → pages). The Zustand store and engine logic are untouched.

**Tech Stack:** React 19, Vite 8, Tailwind CSS v4, shadcn/ui, Lucide React, Zustand 5

**Spec:** `.claude/plans/2026-03-27-shadcn-migration-design.md`

---

## File Structure

### New Files
- `src/lib/utils.ts` — shadcn `cn()` utility (clsx + tailwind-merge)
- `src/components/ui/*.tsx` — shadcn component files (button, input, label, select, checkbox, card, table, badge, tooltip, toggle, tabs, alert, collapsible)
- `components.json` — shadcn config

### Modified Files
- `tsconfig.app.json` — Add `@/` path alias (`baseUrl` + `paths`)
- `vite.config.ts` — Add `resolve.alias` for `@` → `./src`
- `src/index.css` — Replace `@theme` with `@theme inline` using shadcn CSS variable names
- All `src/components/sections/*.tsx` — Migrate to shadcn components
- `src/components/common/DefaultLabel.tsx` — Replace with Badge
- `src/components/wizard/WizardShell.tsx` — shadcn Button + Lucide icons
- `src/components/ScheduleView.tsx` — shadcn Button/Alert + icons
- `src/App.tsx` — shadcn Tabs for layout toggle + icons

### Deleted Files
- `src/App.css` — Legacy CRA boilerplate, completely unused

---

## Task 0: Setup & Infrastructure

### Task 0a: Initialize shadcn/ui

**Files:** `tsconfig.app.json`, `vite.config.ts`, `components.json`, `src/lib/utils.ts`

- [ ] Add `baseUrl: "."` and `paths: { "@/*": ["./src/*"] }` to `tsconfig.app.json` compilerOptions
- [ ] Add `import path from 'path'` and `resolve.alias` mapping `@` to `./src` in `vite.config.ts`
- [ ] Run `pnpm dlx shadcn@latest init` — choose New York style, Slate base color, CSS variables, Tailwind v4
- [ ] Run `pnpm add lucide-react`
- [ ] Verify build: `pnpm build > ./tmp/build.log 2>&1`
- [ ] Commit: "chore: initialize shadcn/ui with Tailwind v4 and add lucide-react"

### Task 0b: Map Theme to shadcn CSS Variables

**Files:** `src/index.css`, `src/App.css` (delete)

- [ ] Replace the `@theme` block in `src/index.css` with `@theme inline` block using shadcn variable names. Map: accent→primary, background→background, card→card, body→foreground, header→card-foreground, muted→muted-foreground, danger→destructive. Keep custom vars for success/warning/error/info. Keep old aliases (text-header, text-body, etc.) temporarily so existing classes still work during migration.
- [ ] Delete `src/App.css` and remove any imports referencing it
- [ ] Verify build: `pnpm build > ./tmp/build.log 2>&1`
- [ ] Commit: "chore: map theme to shadcn CSS variables and remove unused App.css"

### Task 0c: Install All shadcn Components

**Files:** `src/components/ui/*.tsx`

- [ ] Run: `pnpm dlx shadcn@latest add button input label select checkbox card table badge tooltip toggle tabs alert collapsible`
- [ ] Add custom `success` variant to `src/components/ui/button.tsx` — add entry in `buttonVariants` cva with `bg-success text-success-foreground hover:bg-success-hover focus-visible:ring-success`
- [ ] Verify build: `pnpm build > ./tmp/build.log 2>&1`
- [ ] Commit: "chore: install all shadcn components and add success button variant"

---

## Task 1: Migrate DefaultLabel to Badge

**Files:** `src/components/common/DefaultLabel.tsx`

- [ ] Rewrite to use shadcn `Badge` with `variant="outline"` and muted styling instead of raw `<span>` with Tailwind classes
- [ ] Verify build
- [ ] Commit: "refactor: migrate DefaultLabel to shadcn Badge"

---

## Task 2: Migrate ActionButtons

**Files:** `src/components/sections/ActionButtons.tsx`

- [ ] Replace hand-rolled `<button>` elements with shadcn `Button` components — `default` variant for Validate, `success` variant for Generate Schedule
- [ ] Wrap in shadcn `Card` with `CardHeader`/`CardContent` instead of hand-rolled card div
- [ ] Add Lucide icons: `ShieldCheck` for Validate, `Play` for Generate Schedule
- [ ] All existing business logic (handleValidate, handleSchedule) stays unchanged
- [ ] Verify build
- [ ] Commit: "refactor: migrate ActionButtons to shadcn Button/Card with Lucide icons"

---

## Task 3: Migrate TournamentSetup

**Files:** `src/components/sections/TournamentSetup.tsx`

- [ ] Replace `INPUT_CLASSES`/`SELECT_CLASSES`/`LABEL_CLASSES` constants with shadcn `Input`, `Select` (with SelectTrigger/SelectContent/SelectItem), and `Label` components
- [ ] Wrap in shadcn `Card`. Remove the hand-rolled card div pattern.
- [ ] Convert all native `<select>` to shadcn Select — note: shadcn Select uses `onValueChange` (string callback) not `onChange` (event). Time selects need `String(value)` for the value prop since shadcn Select only handles strings.
- [ ] All existing state logic stays unchanged
- [ ] Verify build
- [ ] Commit: "refactor: migrate TournamentSetup to shadcn Card/Label/Input/Select"

---

## Task 4: Migrate TemplateSelector

**Files:** `src/components/sections/TemplateSelector.tsx`

- [ ] Replace native `<select>` with shadcn `Select` including `SelectTrigger` with placeholder text
- [ ] Wrap in shadcn `Card`
- [ ] Add Lucide `LayoutTemplate` icon in the card title
- [ ] Verify build
- [ ] Commit: "refactor: migrate TemplateSelector to shadcn Card/Select with Lucide icon"

---

## Task 5: Migrate FencerCounts

**Files:** `src/components/sections/FencerCounts.tsx`

- [ ] Replace `<table>` with shadcn `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`
- [ ] Replace `<input type="number">` with shadcn `Input`
- [ ] Wrap in shadcn `Card`
- [ ] Keep the "no competitions selected" empty state — just use Card + muted text
- [ ] Verify build
- [ ] Commit: "refactor: migrate FencerCounts to shadcn Card/Table/Input"

---

## Task 6: Migrate CompetitionOverrides

**Files:** `src/components/sections/CompetitionOverrides.tsx`

- [ ] Replace `<table>` with shadcn `Table` components
- [ ] Replace all native `<select>` with shadcn `Select` — use compact trigger sizing (`h-8 w-[Npx]`)
- [ ] Replace `<input type="number">` with shadcn `Input` — use compact sizing (`h-8 w-16`)
- [ ] Remove `INLINE_SELECT`/`INLINE_NUMBER` class constants
- [ ] Wrap in shadcn `Card`
- [ ] `DefaultLabel` already migrated in Task 1 — no changes needed there
- [ ] Verify build
- [ ] Commit: "refactor: migrate CompetitionOverrides to shadcn Table/Select/Input"

---

## Task 7: Migrate RefereeSetup

**Files:** `src/components/sections/RefereeSetup.tsx`

- [ ] Replace `<table>` with shadcn `Table` components
- [ ] Replace `<input type="number">` with shadcn `Input`
- [ ] Replace `<input type="checkbox">` with shadcn `Checkbox` — note: uses `onCheckedChange` not `onChange`
- [ ] Replace CSS hover tooltip (`.group` + `group-hover:block`) with shadcn `Tooltip`/`TooltipProvider`/`TooltipTrigger`/`TooltipContent`
- [ ] Replace Suggest `<button>` with shadcn `Button` + Lucide `Lightbulb` icon
- [ ] Remove `INLINE_INPUT` class constant
- [ ] Wrap in shadcn `Card`
- [ ] Verify build
- [ ] Commit: "refactor: migrate RefereeSetup to shadcn Card/Table/Input/Checkbox/Tooltip"

---

## Task 8: Migrate CompetitionMatrix (Compact Redesign)

**Files:** `src/components/sections/CompetitionMatrix.tsx`

This is the biggest change — a layout redesign, not just component swaps.

- [ ] Replace the table-per-group layout with a compact toggle layout:
  - Each weapon/gender group becomes a collapsible section with a clickable header
  - Header shows group name + Lucide `ChevronDown`/`ChevronRight` + selection count `Badge`
  - Within each group: dense rows with category label + two shadcn `Toggle` buttons labeled "I" (Individual) and "T" (Team)
  - Toggle pressed state = selected (filled accent), unpressed = outline only
  - Size the toggles small: `h-6 w-7 px-0 text-xs`
  - Skip categories where neither individual nor team exists
- [ ] Use local `useState<Set<string>>` for collapsed groups (all start expanded)
- [ ] Keep the existing toggle logic: `addCompetition`/`removeCompetition` from store
- [ ] Keep the "N competitions selected" footer text
- [ ] All catalogue grouping logic (GROUPS, CATALOGUE_INDEX, lookup) stays unchanged
- [ ] Wrap in shadcn `Card`
- [ ] Verify build
- [ ] Visual check: run dev server and verify toggle behavior, collapse/expand, count updates
- [ ] Commit: "refactor: redesign CompetitionMatrix with compact toggle layout and collapsible groups"

---

## Task 9: Migrate AnalysisOutput

**Files:** `src/components/sections/AnalysisOutput.tsx`

- [ ] Replace severity-colored `<li>` items with shadcn `Alert` + `AlertDescription` — keep severity-based className for bg/text colors (ERROR=error bg, WARN=warning bg, INFO=info bg)
- [ ] Add Lucide severity icons: `AlertCircle` (ERROR), `AlertTriangle` (WARN), `Info` (INFO) — map via a `SEVERITY_ICON` record
- [ ] Replace Accept/Reject `<button>` with shadcn `Button` size="sm" — `success` variant for Accept (with `Check` icon), `destructive` for Reject (with `X` icon)
- [ ] Replace accepted/rejected status `<span>` with shadcn `Badge`
- [ ] Wrap in shadcn `Card`
- [ ] Verify build
- [ ] Commit: "refactor: migrate AnalysisOutput to shadcn Card/Alert/Button/Badge with Lucide icons"

---

## Task 10: Migrate ScheduleOutput

**Files:** `src/components/sections/ScheduleOutput.tsx`

- [ ] Replace `<table>` with shadcn `Table` components
- [ ] Replace bottleneck `<li>` items with shadcn `Alert` + `AlertDescription` + Lucide severity icons (same mapping as Task 9)
- [ ] Keep `rowTintClass` and `formatMinutes` helpers unchanged
- [ ] Wrap in shadcn `Card`
- [ ] Verify build
- [ ] Commit: "refactor: migrate ScheduleOutput to shadcn Card/Table/Alert with Lucide icons"

---

## Task 11: Migrate SaveLoadShare

**Files:** `src/components/sections/SaveLoadShare.tsx`

- [ ] Replace all `<button>` with shadcn `Button` — default for Save/Share, outline for Load/Copy
- [ ] Add Lucide icons: `Download` (save), `Upload` (load), `Share2` (share), `Copy`/`Check` (copy toggle)
- [ ] Replace the visible native `<input type="file">` with a hidden file input triggered by a Button click
- [ ] Replace the share URL `<input type="text" readOnly>` with shadcn `Input` with muted background
- [ ] Remove `BTN_PRIMARY`/`BTN_SECONDARY` class constants
- [ ] Wrap in shadcn `Card`
- [ ] Verify build
- [ ] Commit: "refactor: migrate SaveLoadShare to shadcn Card/Button/Input with Lucide icons"

---

## Task 12: Migrate App Chrome (LayoutToggle + WizardShell + ScheduleView)

**Files:** `src/App.tsx`, `src/components/wizard/WizardShell.tsx`, `src/components/ScheduleView.tsx`

- [ ] **App.tsx**: Replace hand-rolled pill toggle with shadcn `Tabs`/`TabsList`/`TabsTrigger`. Add Lucide icons: `LayoutDashboard` (Single Page), `Wand2` (Wizard). Note: Tabs `onValueChange` replaces the onClick handlers. Update header text classes from `text-header` to `text-card-foreground`.
- [ ] **WizardShell.tsx**: Replace inline SVG checkmark with Lucide `Check`. Replace Back/Next `<button>` with shadcn `Button` — outline variant for Back (with `ChevronLeft`), default for Next (with `ChevronRight`). Replace "Scroll for more" `<span>` with shadcn `Badge` + Lucide `ChevronsDown`. Update color classes: `bg-accent`→`bg-primary`, `text-accent`→`text-primary`, `border-slate-300`→`border-muted-foreground/30`.
- [ ] **ScheduleView.tsx**: Replace stale results `<div>` with shadcn `Alert` (warning style) + `AlertTriangle` icon. Replace Regenerate `<button>` with shadcn `Button` variant="success" + Lucide `RefreshCw` icon.
- [ ] Verify build
- [ ] Commit: "refactor: migrate App/WizardShell/ScheduleView to shadcn Tabs/Button/Alert with Lucide icons"

---

## Task 13: Cleanup & Final Verification

- [ ] Search for leftover hand-rolled patterns: `INPUT_CLASSES`, `SELECT_CLASSES`, `LABEL_CLASSES`, `BTN_PRIMARY`, `BTN_SECONDARY`, `INLINE_SELECT`, `INLINE_INPUT`, `INLINE_NUMBER`, `accent-accent` — fix any remaining references
- [ ] Search for old color class usage: `text-header`, `text-body`, `text-muted` (without `-foreground`) — replace with shadcn equivalents (`text-card-foreground`, `text-foreground`, `text-muted-foreground`)
- [ ] Remove old alias vars from `src/index.css` once all references are updated
- [ ] Run full build: `pnpm build > ./tmp/build.log 2>&1`
- [ ] Run tests: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`
- [ ] Visual smoke test: walk through wizard flow end-to-end (all 5 steps), verify Single Page mode, test save/load/share
- [ ] Commit cleanup: "chore: clean up leftover hand-rolled patterns and old color aliases"

---

## Summary

| Task | What | Components Used |
|------|------|----------------|
| 0a | shadcn init + path alias + lucide-react | Infrastructure |
| 0b | Theme CSS variables + delete App.css | Infrastructure |
| 0c | Install all shadcn components + success variant | Infrastructure |
| 1 | DefaultLabel → Badge | Badge |
| 2 | ActionButtons | Card, Button + icons |
| 3 | TournamentSetup | Card, Label, Input, Select |
| 4 | TemplateSelector | Card, Select + icon |
| 5 | FencerCounts | Card, Table, Input |
| 6 | CompetitionOverrides | Card, Table, Select, Input |
| 7 | RefereeSetup | Card, Table, Input, Checkbox, Tooltip, Button |
| 8 | CompetitionMatrix (redesign) | Card, Toggle, Badge, Collapsible + icons |
| 9 | AnalysisOutput | Card, Alert, Button, Badge + icons |
| 10 | ScheduleOutput | Card, Table, Alert + icons |
| 11 | SaveLoadShare | Card, Button, Input + icons |
| 12 | App/WizardShell/ScheduleView | Tabs, Button, Badge, Alert + icons |
| 13 | Cleanup + verification | — |
