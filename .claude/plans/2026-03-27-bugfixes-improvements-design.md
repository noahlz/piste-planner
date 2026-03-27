# Bug Fixes & Improvements — Design Spec

**Date:** 2026-03-27
**Scope:** 2 bugs, 2 improvements, plan file cleanup

---

## 1. Cut Mode/Value UI Field

**Problem:** Engine supports `cut_mode` and `cut_value` per competition, but CompetitionOverrides has no fields for them. Users are stuck with category defaults.

**Solution:** Add two fields per competition row in `CompetitionOverrides.tsx`:

- **Cut Mode** dropdown: DISABLED, PERCENTAGE, COUNT — sourced from `CutMode` const object
- **Cut Value** number input: visible only when mode is PERCENTAGE or COUNT
  - PERCENTAGE mode: label "Cut %", value 0-100
  - COUNT mode: label "Cut to N", value >= 1
- DefaultLabel shown when values match `DEFAULT_CUT_BY_CATEGORY[category]`
- Wired to existing `store.updateCompetition(id, { cut_mode, cut_value })`

**Files:** `src/components/sections/CompetitionOverrides.tsx`

**No store or engine changes needed** — `CompetitionConfig` already has `cut_mode` and `cut_value`, and `buildConfig.ts` already passes them through.

---

## 2. Scheduler Graceful Degradation (BUG-1)

**Problem:** `scheduleAll` throws `SchedulingError` for mandatory competitions, losing partial results. UI shows a catch-all error instead of a partial schedule with diagnostics.

**Solution:** Catch-and-continue in `scheduleAll`:

- Catch `SchedulingError` for mandatory competitions (same as optional events already work)
- Record an ERROR-severity `Bottleneck`:
  - `competition_id`: the failed competition's ID
  - `phase`: `'SCHEDULING'`
  - `cause`: extracted from `err.cause` (the `BottleneckCause` value)
  - `severity`: `BottleneckSeverity.ERROR`
  - `message`: the error's message string
- Track failed competition IDs in a local array for the return value
- Continue scheduling remaining competitions
- Return partial `ScheduleAllResult` with all bottlenecks included

**No changes to `scheduleOne.ts` or `dayAssignment.ts`** — errors still throw from those modules, `scheduleAll` just handles them gracefully.

**UI impact:** Already renders bottlenecks with severity-based tinting. ERROR bottlenecks appear with red background — no UI changes needed.

**Files:** `src/engine/scheduler.ts`, `__tests__/engine/scheduler.test.ts`

---

## 3. Pre-Scheduling Capacity Warning (IMP-1)

**Problem:** With 174 pools / 3 days = 58 pools/day vs 24 strips, the user gets no warning until the scheduler fails. Analysis should flag this before "Generate Schedule."

**Solution:** Add Pass 0 to `initialAnalysis` in `analysis.ts`:

- For each day, estimate pools that will run on that day:
  - Use `competitions.length / config.days_available` as a simple estimate, or
  - Sum `poolCount(comp.fencer_count)` across all competitions, divide by `days_available`
- If estimated pools/day > `config.strips_total`, emit a WARN bottleneck:
  - `competition_id`: `''` (venue-level)
  - `phase`: `'CAPACITY'`
  - `cause`: `BottleneckCause.STRIP_CONTENTION`
  - `severity`: `BottleneckSeverity.WARN`
  - `message`: `"Estimated ~X pools/day exceeds Y available strips. Consider adding strips or reducing competitions."`

**Files:** `src/engine/analysis.ts`, `__tests__/engine/analysis.test.ts`

---

## 4. Auto-Populate Referee Counts (IMP-2)

**Problem:** Refs default to 0 and require a manual "Suggest" click. Could auto-suggest when competitions or strips change.

**Solution:** Auto-run ref suggestion when competition selection changes:

- Extract `suggestRefs` from `RefereeSetup.tsx` (currently a local function at line 10) into a shared utility (e.g., `src/store/refSuggestion.ts`) so both the component and the store can call it
- In the store, after `selectCompetitions`, `removeCompetition`, or `applyTemplate` mutates `selectedCompetitions`, auto-run the extracted `suggestRefs` logic
- Populate `dayRefs` with suggested values
- Track a `manuallyEdited` flag per day in the referee slice
  - Auto-suggest only overwrites days where `manuallyEdited` is false
  - Manual edits to `dayRefs` set `manuallyEdited = true` for that day
  - "Suggest" button overrides all days regardless of `manuallyEdited` flag

**Files:** `src/store/store.ts` (referee slice + competition slice), `src/components/sections/RefereeSetup.tsx`

---

## 5. Plan File Cleanup

Delete completed plan files after all fixes are done:

- `.claude/plans/2026-03-25-engine-execution-plan.md`
- `.claude/plans/2026-03-25-engine-implementation-plan.md`
- `.claude/plans/2026-03-25-piste-planner-design.md`
- `.claude/plans/2026-03-27-ui-execution-plan.md`
- `.claude/plans/2026-03-27-ui-implementation-design.md`
- `.claude/plans/duration-estimate-analysis.md`
- `.claude/plans/prd-addendum-duration-corrections.md`
- `.claude/plans/event-start-end-times-export.csv`

Keep: `piste-planner-prd.md`, update `known-bugs.md` and `bugs-and-improvements.md` to mark resolved items.
