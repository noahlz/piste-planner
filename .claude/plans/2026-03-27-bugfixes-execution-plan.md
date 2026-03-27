# Bug Fixes & Improvements — Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 2 bugs (cut % UI, scheduler graceful degradation) and implement 2 improvements (capacity warning, auto-populate refs), then clean up completed plan files.

**Architecture:** Minimal changes — engine catch-and-continue for scheduler, new analysis pass for capacity, UI fields for cut mode, store-level auto-suggest for refs.

**Tech Stack:** React 19, Zustand 5, TypeScript, Vitest 3.2, Tailwind CSS 4

**Design Spec:** `.claude/plans/2026-03-27-bugfixes-improvements-design.md`

---

## File Structure

```
src/
├── engine/
│   ├── scheduler.ts          # Modify: catch-and-continue for mandatory events
│   ├── analysis.ts           # Modify: add Pass 0 capacity warning
│   └── types.ts              # Modify: add RESOURCE_EXHAUSTION bottleneck cause
├── store/
│   ├── store.ts              # Modify: add manuallyEditedDays to referee slice
│   └── refSuggestion.ts      # Create: extracted suggestRefs utility
├── components/sections/
│   ├── CompetitionOverrides.tsx  # Modify: add cut mode/value fields
│   └── RefereeSetup.tsx         # Modify: use extracted suggestRefs

__tests__/
├── engine/
│   ├── scheduler.test.ts     # Modify: add graceful degradation tests
│   └── analysis.test.ts      # Modify: add capacity warning tests
├── store/
│   └── refSuggestion.test.ts # Create: tests for extracted suggestRefs
```

---

## Task 0: Scheduler Graceful Degradation (BUG-1)

Modify `scheduleAll` to catch `SchedulingError` for mandatory competitions instead of re-throwing.

**Files:**
- Modify: `src/engine/types.ts:98-130` (add RESOURCE_EXHAUSTION to BottleneckCause)
- Modify: `src/engine/scheduler.ts:42-74` (catch-and-continue)
- Modify: `__tests__/engine/scheduler.test.ts` (add degradation tests)

### Steps

- [ ] **Step 0.1: Add RESOURCE_EXHAUSTION to BottleneckCause**

  In `src/engine/types.ts`, add a new cause after `SCHEDULE_ACCEPTED_WITH_WARNINGS`:

  ```typescript
  RESOURCE_EXHAUSTION: 'RESOURCE_EXHAUSTION',
  ```

- [ ] **Step 0.2: Write failing test — mandatory competition failure returns partial results**

  In `__tests__/engine/scheduler.test.ts`, add a new describe block:

  ```typescript
  describe('scheduleAll — graceful degradation on resource exhaustion', () => {
    it('returns partial schedule with ERROR bottleneck when mandatory competition fails', () => {
      // RJCC with many competitions but very few strips (2) and 1 day
      // forces resource exhaustion on later competitions
      const config = makeConfig({
        tournament_type: 'RJCC',
        days_available: 1,
        strips: makeStrips(2, 0),
        dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
        referee_availability: [{ foil_epee_refs: 10, sabre_refs: 10, allow_sabre_ref_fillin: false }],
      })

      // Create enough competitions to exhaust 2 strips in a single day
      const competitions: Competition[] = Array.from({ length: 10 }, (_, i) =>
        makeCompetition({
          id: `COMP-${i}`,
          gender: i % 2 === 0 ? 'MEN' : 'WOMEN',
          category: 'CADET',
          weapon: 'FOIL',
          event_type: 'INDIVIDUAL',
          fencer_count: 24,
          strips_allocated: 2,
        }),
      )

      // Should NOT throw — should return partial results
      const result = scheduleAll(competitions, config)

      // At least some competitions should have been scheduled
      expect(Object.keys(result.schedule).length).toBeGreaterThan(0)
      // But not all — some should have failed
      expect(Object.keys(result.schedule).length).toBeLessThan(competitions.length)
      // Failed competitions produce ERROR bottlenecks
      const errorBottlenecks = result.bottlenecks.filter(
        (b) => b.severity === BottleneckSeverity.ERROR,
      )
      expect(errorBottlenecks.length).toBeGreaterThan(0)
      // Each error bottleneck has a meaningful message
      for (const b of errorBottlenecks) {
        expect(b.message).toBeTruthy()
        expect(b.competition_id).toBeTruthy()
      }
    })

    it('still throws non-SchedulingError exceptions', () => {
      // Passing null config should cause a TypeError, not a SchedulingError
      expect(() =>
        scheduleAll([], null as unknown as Parameters<typeof scheduleAll>[1]),
      ).toThrow()
    })
  })
  ```

- [ ] **Step 0.3: Run test to verify it fails**

  Run: `timeout 120 pnpm --silent test -- --reporter=verbose __tests__/engine/scheduler.test.ts > ./tmp/test.log 2>&1`

  Expected: FAIL — `scheduleAll` throws instead of returning partial results

- [ ] **Step 0.4: Implement catch-and-continue in scheduleAll**

  In `src/engine/scheduler.ts`, modify the catch block (lines 56-67):

  ```typescript
  } catch (err) {
    if (err instanceof SchedulingError) {
      // Record failure as ERROR bottleneck; continue scheduling remaining competitions
      const cause =
        typeof err.cause === 'string'
          ? (err.cause as BottleneckCause)
          : BottleneckCause.RESOURCE_EXHAUSTION
      state.bottlenecks.push({
        competition_id: comp.id,
        phase: 'SCHEDULING',
        cause,
        severity: BottleneckSeverity.ERROR,
        delay_mins: 0,
        message: err.message,
      })
    } else {
      throw err
    }
  }
  ```

  Also update the JSDoc comment (lines 32-41) to reflect the new behavior:

  ```typescript
  /**
   * Master orchestrator: creates global state, sorts competitions by constraint
   * priority (mandatory before optional, most constrained first), schedules each
   * competition, and returns results with bottlenecks.
   *
   * Error handling: competitions that fail to schedule are recorded as ERROR-severity
   * bottlenecks and skipped. Remaining competitions continue scheduling. Non-SchedulingError
   * exceptions are re-thrown.
   */
  ```

  Add `BottleneckCause` and `BottleneckSeverity` to the value import from `./types.ts` (they're already imported, verify `BottleneckCause` includes `RESOURCE_EXHAUSTION`).

- [ ] **Step 0.5: Run tests**

  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass

---

## Task 1: Pre-Scheduling Capacity Warning (IMP-1)

Add Pass 0 to `initialAnalysis` that warns when estimated pools/day exceeds strips.

**Files:**
- Modify: `src/engine/analysis.ts:41-48` (add Pass 0 before Pass 1)
- Modify: `__tests__/engine/analysis.test.ts` (add capacity warning tests)

### Steps

- [ ] **Step 1.1: Write failing test — capacity warning emitted**

  In `__tests__/engine/analysis.test.ts`, add a new describe block:

  ```typescript
  describe('initialAnalysis — Pass 0: capacity warning', () => {
    it('warns when estimated pools/day exceeds strips_total', () => {
      // 4 competitions × 4 pools each = 16 pools, 1 day, 8 strips → warning
      const config = makeConfig({
        strips: makeStrips(8, 0),
        days_available: 1,
        dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
      })
      const competitions = Array.from({ length: 4 }, (_, i) =>
        makeCompetition({
          id: `COMP-${i}`,
          fencer_count: 24, // 24 fencers → 4 pools of 6
        }),
      )
      const dayAssignments: Record<string, number> = {}
      for (const c of competitions) dayAssignments[c.id] = 0

      const result = initialAnalysis(config, competitions, dayAssignments)

      const capacityWarnings = result.warnings.filter(
        (w) => w.phase === 'CAPACITY' && w.cause === BottleneckCause.STRIP_CONTENTION,
      )
      expect(capacityWarnings.length).toBe(1)
      expect(capacityWarnings[0].severity).toBe(BottleneckSeverity.WARN)
      expect(capacityWarnings[0].message).toContain('strips')
    })

    it('does not warn when pools/day fits within strip count', () => {
      // 2 competitions × 4 pools each = 8 pools, 1 day, 10 strips → no warning
      const config = makeConfig({
        strips: makeStrips(10, 0),
        days_available: 1,
        dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
      })
      const competitions = [
        makeCompetition({ id: 'A', fencer_count: 24 }),
        makeCompetition({ id: 'B', fencer_count: 24 }),
      ]
      const dayAssignments: Record<string, number> = { A: 0, B: 0 }

      const result = initialAnalysis(config, competitions, dayAssignments)

      const capacityWarnings = result.warnings.filter((w) => w.phase === 'CAPACITY')
      expect(capacityWarnings.length).toBe(0)
    })
  })
  ```

- [ ] **Step 1.2: Run test to verify it fails**

  Run: `timeout 120 pnpm --silent test -- --reporter=verbose __tests__/engine/analysis.test.ts > ./tmp/test.log 2>&1`

  Expected: FAIL — no CAPACITY warnings emitted

- [ ] **Step 1.3: Implement Pass 0 in initialAnalysis**

  In `src/engine/analysis.ts`, insert Pass 0 before Pass 1 (after `const suggestions: string[] = []` on line 47):

  ```typescript
  // ── Pass 0: capacity warning — pools/day vs strips_total ────────────────
  // Sum pools per day from dayAssignments, warn if any day exceeds strip count.
  const poolsByDay = new Map<number, number>()
  for (const comp of competitions) {
    const day = dayAssignments[comp.id]
    if (day === undefined) continue
    const ps = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
    poolsByDay.set(day, (poolsByDay.get(day) ?? 0) + ps.n_pools)
  }
  for (const [day, totalPools] of poolsByDay) {
    if (totalPools > config.strips_total) {
      warnings.push({
        competition_id: '',
        phase: 'CAPACITY',
        cause: BottleneckCause.STRIP_CONTENTION,
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `Day ${day + 1}: ~${totalPools} pools assigned but only ${config.strips_total} strips available. Consider adding strips, reducing competitions, or enabling flighting.`,
      })
    }
  }
  ```

- [ ] **Step 1.4: Run tests**

  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass

---

## Task 2: Cut Mode/Value UI Field

Add cut_mode dropdown and cut_value input to CompetitionOverrides.

**Files:**
- Modify: `src/components/sections/CompetitionOverrides.tsx`

### Steps

- [ ] **Step 2.1: Add CutMode imports and options array**

  In `src/components/sections/CompetitionOverrides.tsx`, add to imports:

  ```typescript
  import { CutMode } from '../../engine/types.ts'
  import { DEFAULT_CUT_BY_CATEGORY } from '../../engine/constants.ts'
  ```

  Add options array after `VIDEO_POLICY_OPTIONS`:

  ```typescript
  const CUT_MODE_OPTIONS: { value: CutMode; label: string }[] = [
    { value: CutMode.DISABLED, label: 'Disabled' },
    { value: CutMode.PERCENTAGE, label: 'Percentage' },
    { value: CutMode.COUNT, label: 'Count' },
  ]
  ```

- [ ] **Step 2.2: Add Cut Mode and Cut Value columns to the table**

  Add two `<th>` elements after the Video Policy header:

  ```html
  <th className="pb-2 text-left font-medium">Cut Mode</th>
  <th className="pb-2 text-left font-medium">Cut Value</th>
  ```

  In each row, after the video policy `<td>`, add:

  ```tsx
  <td className="py-1.5">
    <select
      className={INLINE_SELECT}
      value={config.cut_mode}
      onChange={(e) =>
        updateCompetition(id, { cut_mode: e.target.value as CutMode })
      }
      aria-label={`Cut mode for ${label}`}
    >
      {CUT_MODE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    <DefaultLabel
      isDefault={
        entry
          ? config.cut_mode === DEFAULT_CUT_BY_CATEGORY[entry.category].mode
          : false
      }
    />
  </td>
  <td className="py-1.5">
    {config.cut_mode !== CutMode.DISABLED && (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={1}
          max={config.cut_mode === CutMode.PERCENTAGE ? 100 : undefined}
          className="w-16 rounded-md border border-slate-200 px-2 py-0.5 text-right text-sm text-body focus:ring-2 focus:ring-accent focus:outline-none"
          value={config.cut_value}
          onChange={(e) =>
            updateCompetition(id, { cut_value: Number(e.target.value) })
          }
          aria-label={`Cut value for ${label}`}
        />
        <span className="text-xs text-muted">
          {config.cut_mode === CutMode.PERCENTAGE ? '%' : 'fencers'}
        </span>
        <DefaultLabel
          isDefault={
            entry
              ? config.cut_value === DEFAULT_CUT_BY_CATEGORY[entry.category].value
              : false
          }
        />
      </div>
    )}
  </td>
  ```

- [ ] **Step 2.3: Verify in browser**

  Run `pnpm dev`, select a template, verify:
  - Cut Mode dropdown appears with correct default per category
  - Cut Value input appears when mode is PERCENTAGE or COUNT
  - DefaultLabel shows when values match category defaults
  - Changing values updates the store

- [ ] **Step 2.4: Run tests**

  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass (existing component tests still work)

---

## Task 3: Extract suggestRefs Utility

Extract `suggestRefs` from `RefereeSetup.tsx` into a shared module for reuse by the store.

**Files:**
- Create: `src/store/refSuggestion.ts`
- Create: `__tests__/store/refSuggestion.test.ts`
- Modify: `src/components/sections/RefereeSetup.tsx` (import from new location)

### Steps

- [ ] **Step 3.1: Write tests for suggestRefs**

  Create `__tests__/store/refSuggestion.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { suggestRefs } from '../../src/store/refSuggestion.ts'

  describe('suggestRefs', () => {
    it('returns null when no competitions selected', () => {
      expect(suggestRefs({}, 3, 24)).toBeNull()
    })

    it('returns null when strips_total is 0', () => {
      expect(
        suggestRefs({ 'CDT-M-FOIL-IND': { fencer_count: 24, use_single_pool_override: false } }, 3, 0),
      ).toBeNull()
    })

    it('returns null when days_available is 0', () => {
      expect(
        suggestRefs({ 'CDT-M-FOIL-IND': { fencer_count: 24, use_single_pool_override: false } }, 0, 24),
      ).toBeNull()
    })

    it('splits refs proportionally between sabre and foil/epee', () => {
      // Catalogue IDs: CDT = Cadet, M = Men, weapon, IND = Individual
      const competitions = {
        'CDT-M-FOIL-IND': { fencer_count: 24, use_single_pool_override: false },
        'CDT-M-SABRE-IND': { fencer_count: 24, use_single_pool_override: false },
      }
      const result = suggestRefs(competitions, 3, 24)
      expect(result).not.toBeNull()
      expect(result!.foil_epee_refs).toBeGreaterThan(0)
      expect(result!.sabre_refs).toBeGreaterThan(0)
    })

    it('caps refs at strips_total', () => {
      // Use real catalogue IDs — suggestRefs calls findCompetition internally
      // so fake IDs would be skipped. Use multiple real foil competitions.
      const competitions: Record<string, { fencer_count: number; use_single_pool_override: boolean }> = {
        'CDT-M-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
        'JR-M-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
        'D1-M-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
        'CDT-W-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
        'JR-W-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
      }
      const result = suggestRefs(competitions, 1, 8)
      expect(result).not.toBeNull()
      expect(result!.foil_epee_refs + result!.sabre_refs).toBeLessThanOrEqual(8)
    })
  })
  ```

- [ ] **Step 3.2: Run test to verify it fails**

  Run: `timeout 120 pnpm --silent test -- --reporter=verbose __tests__/store/refSuggestion.test.ts > ./tmp/test.log 2>&1`

  Expected: FAIL — module does not exist

- [ ] **Step 3.3: Create refSuggestion.ts**

  Create `src/store/refSuggestion.ts`:

  ```typescript
  import { findCompetition } from '../engine/catalogue.ts'
  import { computePoolStructure } from '../engine/pools.ts'

  export interface RefSuggestion {
    foil_epee_refs: number
    sabre_refs: number
  }

  /**
   * Suggests referee counts based on selected competitions and strip count.
   * Heuristic: one ref per strip in use. Sabre competitions need sabre refs;
   * foil/epee competitions need foil/epee refs. Distributes evenly across days.
   *
   * Accepts a map of competition ID → { fencer_count, use_single_pool_override }
   * so it can be called from both the store and the component without coupling
   * to the full store shape.
   */
  export function suggestRefs(
    competitions: Record<string, { fencer_count: number; use_single_pool_override: boolean }>,
    daysAvailable: number,
    stripsTotal: number,
  ): RefSuggestion | null {
    const entries = Object.entries(competitions)
    if (entries.length === 0 || daysAvailable === 0 || stripsTotal === 0) return null

    let sabrePools = 0
    let foilEpeePools = 0
    for (const [id, config] of entries) {
      const entry = findCompetition(id)
      if (!entry || config.fencer_count < 2) continue
      const ps = computePoolStructure(config.fencer_count, config.use_single_pool_override)
      if (entry.weapon === 'SABRE') {
        sabrePools += ps.n_pools
      } else {
        foilEpeePools += ps.n_pools
      }
    }

    const totalPools = sabrePools + foilEpeePools
    if (totalPools === 0) return null

    const poolsPerDay = Math.ceil(totalPools / daysAvailable)
    const stripsInUse = Math.min(poolsPerDay, stripsTotal)

    const sabreRatio = sabrePools / totalPools
    const sabreRefs = Math.max(1, Math.round(stripsInUse * sabreRatio))
    const foilEpeeRefs = Math.max(1, stripsInUse - sabreRefs)

    return { foil_epee_refs: foilEpeeRefs, sabre_refs: sabreRefs }
  }
  ```

- [ ] **Step 3.4: Update RefereeSetup.tsx to use extracted function**

  In `src/components/sections/RefereeSetup.tsx`:

  - Remove the local `suggestRefs` function (lines 10-42)
  - Remove the `computePoolStructure` import (line 3)
  - Remove the `findCompetition` import (line 2)
  - Add import: `import { suggestRefs } from '../../store/refSuggestion.ts'`
  - Update `handleSuggest` to call with extracted args:

  ```typescript
  function handleSuggest() {
    const state = useStore.getState()
    const suggestion = suggestRefs(
      state.selectedCompetitions,
      state.days_available,
      state.strips_total,
    )
    if (!suggestion) return
    for (let i = 0; i < state.days_available; i++) {
      setDayRefs(i, suggestion)
    }
  }
  ```

- [ ] **Step 3.5: Run tests**

  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass

---

## Task 4: Auto-Populate Referee Counts (IMP-2)

Wire `suggestRefs` into the store so refs auto-populate when competitions change.

**Files:**
- Modify: `src/store/store.ts` (referee slice + competition slice)

### Steps

- [ ] **Step 4.1: Add manuallyEditedDays to RefereeSlice**

  In `src/store/store.ts`, update the `RefereeSlice` interface:

  ```typescript
  export interface RefereeSlice {
    dayRefs: DayRefConfig[]
    optimalRefs: DayRefConfig[]
    manuallyEditedDays: Set<number>

    setDayRefs: (dayIndex: number, refs: Partial<DayRefConfig>) => void
    toggleSabreFillin: (dayIndex: number) => void
    setOptimalRefs: (refs: DayRefConfig[]) => void
  }
  ```

  Update `createRefereeSlice` initial state:

  ```typescript
  manuallyEditedDays: new Set<number>(),
  ```

  Update `setDayRefs` to mark the day as manually edited:

  ```typescript
  setDayRefs: (dayIndex, refs) => {
    set((state) => {
      const extended = ensureDayRefs(state.dayRefs, dayIndex + 1)
      const updated = extended.map((dc, i) =>
        i === dayIndex ? { ...dc, ...refs } : dc,
      )
      const newManual = new Set(state.manuallyEditedDays)
      newManual.add(dayIndex)
      return { dayRefs: updated, manuallyEditedDays: newManual }
    })
    get().markStale({ scheduleStale: true })
  },
  ```

- [ ] **Step 4.2: Add autoSuggestRefs helper to store**

  In `src/store/store.ts`, add an import at the top:

  ```typescript
  import { suggestRefs } from './refSuggestion.ts'
  ```

  Add a helper function before `createCompetitionSlice`:

  ```typescript
  /**
   * Auto-populates referee counts for days that haven't been manually edited.
   * Called after competition selection changes.
   */
  function autoSuggestRefs(get: GetState, set: SetState) {
    const state = get()
    if (state.days_available === 0 || state.strips_total === 0) return

    const suggestion = suggestRefs(
      state.selectedCompetitions,
      state.days_available,
      state.strips_total,
    )
    if (!suggestion) return

    const extended = ensureDayRefs(state.dayRefs, state.days_available)
    const updated = extended.map((dc, i) =>
      state.manuallyEditedDays.has(i) ? dc : { ...dc, ...suggestion },
    )
    set({ dayRefs: updated })
  }
  ```

- [ ] **Step 4.3: Wire autoSuggestRefs into competition mutations**

  In `createCompetitionSlice`, add `autoSuggestRefs(get, set as SetState)` after `markStale` in:

  - `selectCompetitions` (after line 243)
  - `addCompetition` (after line 252)
  - `removeCompetition` (after line 274)
  - `applyTemplate` (after line 286)

  Example for `selectCompetitions`:

  ```typescript
  selectCompetitions: (ids) => {
    const map: Record<string, CompetitionConfig> = {}
    for (const id of ids) {
      const config = defaultConfigForId(id)
      if (config) map[id] = config
    }
    set({ selectedCompetitions: map })
    get().markStale({ analysisStale: true, scheduleStale: true })
    autoSuggestRefs(get, set as SetState)
  },
  ```

  Also wire it into `setStrips` in `createTournamentSlice` (after markStale):

  ```typescript
  setStrips: (total) => {
    set({ strips_total: total })
    get().markStale({ analysisStale: true, scheduleStale: true })
    autoSuggestRefs(get, set as SetState)
  },
  ```

- [ ] **Step 4.4: Reset manuallyEditedDays on Suggest button click**

  In `src/components/sections/RefereeSetup.tsx`, update `handleSuggest` to also clear the manual flags:

  ```typescript
  function handleSuggest() {
    const state = useStore.getState()
    const suggestion = suggestRefs(
      state.selectedCompetitions,
      state.days_available,
      state.strips_total,
    )
    if (!suggestion) return
    // Clear manual edit flags so future auto-suggests work for all days
    useStore.setState({ manuallyEditedDays: new Set<number>() })
    for (let i = 0; i < state.days_available; i++) {
      setDayRefs(i, suggestion)
    }
  }
  ```

  Note: `setDayRefs` will re-add days to `manuallyEditedDays`. To avoid this, we need a different approach: override the refs without going through `setDayRefs`. Instead, set them directly:

  ```typescript
  function handleSuggest() {
    const state = useStore.getState()
    const suggestion = suggestRefs(
      state.selectedCompetitions,
      state.days_available,
      state.strips_total,
    )
    if (!suggestion) return
    const dayRefs = Array.from({ length: state.days_available }, () => ({
      ...DEFAULT_DAY_REF_CONFIG,
      ...suggestion,
    }))
    useStore.setState({ dayRefs, manuallyEditedDays: new Set<number>() })
  }
  ```

  Import `DEFAULT_DAY_REF_CONFIG` — but it's not exported. Instead, use the existing `dayRefs` values to preserve `allow_sabre_ref_fillin`:

  ```typescript
  function handleSuggest() {
    const state = useStore.getState()
    const suggestion = suggestRefs(
      state.selectedCompetitions,
      state.days_available,
      state.strips_total,
    )
    if (!suggestion) return
    const extended = state.dayRefs.length >= state.days_available
      ? state.dayRefs
      : [
          ...state.dayRefs,
          ...Array.from(
            { length: state.days_available - state.dayRefs.length },
            () => ({ foil_epee_refs: 0, sabre_refs: 0, allow_sabre_ref_fillin: false }),
          ),
        ]
    const dayRefs = extended.slice(0, state.days_available).map((dc) => ({
      ...dc,
      ...suggestion,
    }))
    useStore.setState({ dayRefs, manuallyEditedDays: new Set<number>() })
  }
  ```

- [ ] **Step 4.5: Run tests**

  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass. Some existing store tests may need updates if they assert on `manuallyEditedDays` in state shape — check and fix.

- [ ] **Step 4.6: Handle serialization**

  Check `src/store/serialization.ts` — if `manuallyEditedDays` is a `Set`, it won't serialize to JSON by default. Either:
  - Exclude it from serialization (it's transient UI state — on load, all days are non-manual), or
  - Convert to array for serialization

  The simplest: exclude it. In the `serializeState` function, verify `manuallyEditedDays` is not included in the serialized output. If it is, filter it out. On deserialization, initialize to `new Set()`.

- [ ] **Step 4.7: Run full test suite**

  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass

---

## Task 5: Plan File Cleanup

Delete completed plan files and update bug tracking docs.

**Files:**
- Delete: 8 completed plan files
- Modify: `.claude/plans/known-bugs.md`
- Modify: `.claude/plans/bugs-and-improvements.md`

### Steps

- [ ] **Step 5.1: Delete completed plan files**

  Delete these files:
  - `.claude/plans/2026-03-25-engine-execution-plan.md`
  - `.claude/plans/2026-03-25-engine-implementation-plan.md`
  - `.claude/plans/2026-03-25-piste-planner-design.md`
  - `.claude/plans/2026-03-27-ui-execution-plan.md`
  - `.claude/plans/2026-03-27-ui-implementation-design.md`
  - `.claude/plans/duration-estimate-analysis.md`
  - `.claude/plans/prd-addendum-duration-corrections.md`
  - `.claude/plans/event-start-end-times-export.csv`

- [ ] **Step 5.2: Update known-bugs.md**

  Mark the cut % bug as resolved:

  ```markdown
  # Known Bugs

  ## UI

  - ~~**No way to set cut % per event.** The engine supports `cut_percent` per competition, but the UI (CompetitionOverrides section) does not expose a field to set it. Discovered 2026-03-27.~~ **Resolved 2026-03-27.**
  ```

- [ ] **Step 5.3: Update bugs-and-improvements.md**

  Mark resolved items:

  - BUG-1: Add "**Status: Resolved 2026-03-27** — scheduler now returns partial results with ERROR bottlenecks"
  - IMP-1: Add "**Status: Resolved 2026-03-27** — Pass 0 capacity warning added to initialAnalysis"
  - IMP-2: Add "**Status: Resolved 2026-03-27** — refs auto-populate when competitions change"

- [ ] **Step 5.4: Run build to verify nothing is broken**

  Run: `timeout 120 pnpm build > ./tmp/build.log 2>&1`

  Expected: clean build

- [ ] **Step 5.5: Run full test suite one final time**

  Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

  Expected: all tests pass
