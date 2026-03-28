# Refs & Strips Wizard Step — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move strips into a combined "Refs & Strips" wizard step with a strip suggestion feature, add a reusable NumberInput stepper component, and polish numeric inputs across the wizard.

**Architecture:** Pure suggestion function (`stripSuggestion.ts`) feeds a new `StripSetup` component. Strips move from TournamentSetup to the combined step. A new `NumberInput` component replaces all `<Input type="number">` across the wizard. Tournament Length becomes a `<Select>`.

**Tech Stack:** React, Zustand, shadcn/ui (Button, Input, Select, Checkbox, Card, Tooltip, Table), Vitest, TypeScript

---

### Task 1: NumberInput Stepper Component

**Files:**
- Create: `src/components/ui/number-input.tsx`
- Test: `src/components/ui/__tests__/number-input.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/number-input.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NumberInput } from '../number-input'

describe('NumberInput', () => {
  it('renders the current value', () => {
    render(<NumberInput value={5} onChange={() => {}} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(5)
  })

  it('increments on plus click', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /increment/i }))
    expect(onChange).toHaveBeenCalledWith(6)
  })

  it('decrements on minus click', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} min={0} />)
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('does not decrement below min', () => {
    const onChange = vi.fn()
    render(<NumberInput value={0} onChange={onChange} min={0} />)
    fireEvent.click(screen.getByRole('button', { name: /decrement/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not increment above max', () => {
    const onChange = vi.fn()
    render(<NumberInput value={10} onChange={onChange} max={10} />)
    fireEvent.click(screen.getByRole('button', { name: /increment/i }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('clamps typed value to min/max on blur', () => {
    const onChange = vi.fn()
    render(<NumberInput value={5} onChange={onChange} min={0} max={10} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `timeout 120 pnpm --silent vitest run src/components/ui/__tests__/number-input.test.tsx > ./tmp/test.log 2>&1`
Expected: FAIL — module not found

- [ ] **Step 3: Write the NumberInput component**

```tsx
// src/components/ui/number-input.tsx
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  'aria-label'?: string
}

export function NumberInput({
  value,
  onChange,
  min = 0,
  max = Infinity,
  step = 1,
  className,
  'aria-label': ariaLabel,
}: NumberInputProps) {
  const [localValue, setLocalValue] = useState(String(value))

  useEffect(() => {
    setLocalValue(String(value))
  }, [value])

  function clamp(n: number): number {
    return Math.min(max, Math.max(min, n))
  }

  function handleDecrement() {
    const clamped = clamp(value - step)
    if (clamped !== value) onChange(clamped)
  }

  function handleIncrement() {
    const clamped = clamp(value + step)
    if (clamped !== value) onChange(clamped)
  }

  function handleBlur() {
    const parsed = parseInt(localValue, 10)
    if (isNaN(parsed)) {
      setLocalValue(String(value))
      return
    }
    const clamped = clamp(parsed)
    onChange(clamped)
    setLocalValue(String(clamped))
  }

  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={handleDecrement}
        disabled={value <= min}
        aria-label="Decrement"
      >
        <Minus />
      </Button>
      <Input
        type="number"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        min={min}
        max={max === Infinity ? undefined : max}
        className="h-6 w-14 text-center text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label={ariaLabel}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        onClick={handleIncrement}
        disabled={value >= max}
        aria-label="Increment"
      >
        <Plus />
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `timeout 120 pnpm --silent vitest run src/components/ui/__tests__/number-input.test.tsx > ./tmp/test.log 2>&1`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/number-input.tsx src/components/ui/__tests__/number-input.test.tsx
git commit -m "feat: add NumberInput stepper component with +/- buttons"
```

---

### Task 2: Strip Suggestion Algorithm

**Files:**
- Create: `src/store/stripSuggestion.ts`
- Test: `src/store/__tests__/stripSuggestion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/store/__tests__/stripSuggestion.test.ts
import { describe, it, expect } from 'vitest'
import { suggestStrips } from '../stripSuggestion'

describe('suggestStrips', () => {
  it('returns null when no competitions', () => {
    expect(suggestStrips({}, false)).toBeNull()
  })

  it('returns null when all fencer counts are 0', () => {
    const comps = { 'comp-1': { fencer_count: 0, use_single_pool_override: false } }
    expect(suggestStrips(comps, false)).toBeNull()
  })

  it('suggests n_pools for largest competition', () => {
    // 300 fencers → ceil(300/7) = 43 pools
    const comps = {
      'large': { fencer_count: 300, use_single_pool_override: false },
      'small': { fencer_count: 20, use_single_pool_override: false },
    }
    expect(suggestStrips(comps, false)).toBe(43)
  })

  it('adds +1 when include finals strip is true', () => {
    const comps = {
      'large': { fencer_count: 300, use_single_pool_override: false },
    }
    expect(suggestStrips(comps, true)).toBe(44)
  })

  it('handles single pool override', () => {
    // 10 fencers with override → 1 pool
    const comps = {
      'small': { fencer_count: 10, use_single_pool_override: true },
    }
    expect(suggestStrips(comps, false)).toBe(1)
  })

  it('handles small competition (≤9 fencers)', () => {
    // 8 fencers → 1 pool
    const comps = {
      'tiny': { fencer_count: 8, use_single_pool_override: false },
    }
    expect(suggestStrips(comps, false)).toBe(1)
  })

  it('skips competitions with fencer_count < 2', () => {
    const comps = {
      'invalid': { fencer_count: 1, use_single_pool_override: false },
      'valid': { fencer_count: 50, use_single_pool_override: false },
    }
    // 50 fencers → ceil(50/7) = 8 pools
    expect(suggestStrips(comps, false)).toBe(8)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `timeout 120 pnpm --silent vitest run src/store/__tests__/stripSuggestion.test.ts > ./tmp/test.log 2>&1`
Expected: FAIL — module not found

- [ ] **Step 3: Write the suggestion function**

```ts
// src/store/stripSuggestion.ts
import { computePoolStructure } from '../engine/pools.ts'

/**
 * Suggests strip count based on the largest competition's pool count.
 * Returns enough strips to run all pools of the peak competition in a single flight.
 *
 * Returns null if no valid competitions exist.
 */
export function suggestStrips(
  competitions: Record<string, { fencer_count: number; use_single_pool_override: boolean }>,
  includeFinalsStrip: boolean,
): number | null {
  let maxPools = 0

  for (const config of Object.values(competitions)) {
    if (config.fencer_count < 2) continue
    const ps = computePoolStructure(config.fencer_count, config.use_single_pool_override)
    if (ps.n_pools > maxPools) {
      maxPools = ps.n_pools
    }
  }

  if (maxPools === 0) return null

  return includeFinalsStrip ? maxPools + 1 : maxPools
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `timeout 120 pnpm --silent vitest run src/store/__tests__/stripSuggestion.test.ts > ./tmp/test.log 2>&1`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/store/stripSuggestion.ts src/store/__tests__/stripSuggestion.test.ts
git commit -m "feat: add strip suggestion algorithm"
```

---

### Task 3: Store Changes — include_finals_strip + suggestStrips

**Files:**
- Modify: `src/store/store.ts`
- Modify: `src/store/serialization.ts`

- [ ] **Step 1: Add `include_finals_strip` to TournamentSlice**

In `src/store/store.ts`, add to the `TournamentSlice` interface:

```ts
// Add to TournamentSlice interface (after video_strips_total line)
include_finals_strip: boolean
// Add to TournamentSlice interface (after setVideoStrips line)
setIncludeFinalsStrip: (include: boolean) => void
suggestStrips: () => void
```

In `createTournamentSlice`, add initial state and actions:

```ts
// Add to initial state (after video_strips_total: 0)
include_finals_strip: false,

// Add actions (after setVideoStrips action)
setIncludeFinalsStrip: (include) => {
  set({ include_finals_strip: include })
  get().markStale({ analysisStale: true, scheduleStale: true })
},

suggestStrips: () => {
  const state = get()
  const suggested = suggestStrips(
    state.selectedCompetitions,
    state.include_finals_strip,
  )
  if (suggested !== null) {
    set({ strips_total: suggested })
    get().markStale({ analysisStale: true, scheduleStale: true })
    autoSuggestRefs(get as GetState, set as SetState)
  }
},
```

Add import at the top of `store.ts`:

```ts
import { suggestStrips } from './stripSuggestion.ts'
```

- [ ] **Step 2: Update serialization**

In `src/store/serialization.ts`, add `include_finals_strip` to the `SerializedState.tournament` type:

```ts
// Add to SerializedState.tournament (after video_strips_total)
include_finals_strip?: boolean  // optional for backwards compat
```

In `serializeState`, add:

```ts
// Add to serialized.tournament (after video_strips_total)
include_finals_strip: state.include_finals_strip,
```

In `deserializeState`, add:

```ts
// Add to returned state (after video_strips_total)
include_finals_strip: data.tournament.include_finals_strip ?? false,
```

- [ ] **Step 3: Run all tests**

Run: `timeout 120 pnpm --silent vitest run > ./tmp/test.log 2>&1`
Expected: All existing tests pass (type-check clean)

- [ ] **Step 4: Commit**

```bash
git add src/store/store.ts src/store/serialization.ts
git commit -m "feat: add include_finals_strip state and suggestStrips store action"
```

---

### Task 4: StripSetup Component

**Files:**
- Create: `src/components/sections/StripSetup.tsx`

- [ ] **Step 1: Create the StripSetup component**

```tsx
// src/components/sections/StripSetup.tsx
import { useStore } from '../../store/store.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NumberInput } from '@/components/ui/number-input'
import { Lightbulb } from 'lucide-react'

export function StripSetup() {
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)
  const videoStripsTotal = useStore((s) => s.video_strips_total)
  const setVideoStrips = useStore((s) => s.setVideoStrips)
  const includeFinalsStrip = useStore((s) => s.include_finals_strip)
  const setIncludeFinalsStrip = useStore((s) => s.setIncludeFinalsStrip)
  const suggestStripsFn = useStore((s) => s.suggestStrips)

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="flex flex-row items-center justify-between bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Strips</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="default" size="sm" onClick={suggestStripsFn}>
                <Lightbulb className="mr-1.5 h-4 w-4" />
                Suggest
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-64 text-xs">
              Suggests enough strips to run all pools of the largest competition in a single flight.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="pt-3 pb-3">
        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <Label className="text-xs"># of Strips</Label>
            <NumberInput
              value={stripsTotal}
              onChange={setStrips}
              min={0}
              aria-label="Number of strips"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs"># with Video</Label>
            <NumberInput
              value={videoStripsTotal}
              onChange={setVideoStrips}
              min={0}
              max={stripsTotal}
              aria-label="Number of video strips"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="finals-strip"
              checked={includeFinalsStrip}
              onCheckedChange={(checked) => setIncludeFinalsStrip(checked === true)}
            />
            <Label htmlFor="finals-strip" className="text-xs cursor-pointer">
              Include Finals Strip
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Verify dev server compiles without errors**

Check the Vite dev server terminal output for TypeScript/build errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sections/StripSetup.tsx
git commit -m "feat: add StripSetup component with Suggest button"
```

---

### Task 5: Wire Up Wizard — Combined Refs & Strips Step

**Files:**
- Modify: `src/components/wizard/WizardShell.tsx`
- Modify: `src/components/wizard/WizardStep3.tsx`
- Modify: `src/components/sections/TournamentSetup.tsx`

- [ ] **Step 1: Update WizardShell step labels**

In `src/components/wizard/WizardShell.tsx`, change `STEP_LABELS`:

```ts
// Before:
const STEP_LABELS = ['Tournament', 'Fencers', 'Referees', 'Analysis', 'Schedule'] as const

// After:
const STEP_LABELS = ['Tournament', 'Fencers', 'Refs & Strips', 'Analysis', 'Schedule'] as const
```

- [ ] **Step 2: Update WizardStep3 to render both cards**

Replace `src/components/wizard/WizardStep3.tsx`:

```tsx
import { StripSetup } from '../sections/StripSetup.tsx'
import { RefereeSetup } from '../sections/RefereeSetup.tsx'

export function WizardStep3() {
  return (
    <div className="space-y-4">
      <StripSetup />
      <RefereeSetup />
    </div>
  )
}
```

- [ ] **Step 3: Remove strips from TournamentSetup**

In `src/components/sections/TournamentSetup.tsx`:

1. Remove store selectors for `stripsTotal`, `setStrips`, `videoStripsTotal`, `setVideoStrips`
2. Remove the two `<div className="space-y-1">` blocks for `# of Strips` and `# with Video`
3. Change the grid from `grid-cols-2` to a simpler layout with just Tournament Type and Tournament Length

The resulting grid should contain only:
- Tournament Type (Select)
- Tournament Length (Input — will become Select in next task)

- [ ] **Step 4: Verify dev server compiles, visually check wizard navigation**

Check that:
- Step 1 shows Tournament Setup (no strips) + Competition Matrix
- Step 3 shows Strips card + Referees card
- Navigation works through all 5 steps

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/WizardShell.tsx src/components/wizard/WizardStep3.tsx src/components/sections/TournamentSetup.tsx
git commit -m "feat: move strips to combined Refs & Strips wizard step"
```

---

### Task 6: Tournament Length → Select & Tooltip Cleanup

**Files:**
- Modify: `src/components/sections/TournamentSetup.tsx`

- [ ] **Step 1: Change Tournament Length to Select**

In `src/components/sections/TournamentSetup.tsx`, replace the Tournament Length `<Input type="number">` with:

```tsx
<div className="space-y-1">
  <Label htmlFor="days-available" className="text-xs">
    Tournament Length (Days)
  </Label>
  <Select
    value={String(daysAvailable)}
    onValueChange={(v: string) => setDays(Number(v))}
  >
    <SelectTrigger id="days-available">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="2">2 Days</SelectItem>
      <SelectItem value="3">3 Days</SelectItem>
      <SelectItem value="4">4 Days</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 2: Remove unnecessary tooltips**

In `TournamentSetup.tsx`:
- Remove the `HelpTip` from Tournament Type label (the select options are self-explanatory with labels like "NAC", "RYC")
- Remove the `HelpTip` from Tournament Length label
- Keep the `HelpTip` component definition in the file (it's still used by other components if needed, or remove if no remaining usages)

Check if `HelpTip` is still used anywhere in the file. If not, remove the `HelpTip` function, the `CircleHelp` import, and the `Tooltip`/`TooltipProvider`/`TooltipTrigger`/`TooltipContent` imports (if no other tooltips remain).

- [ ] **Step 3: Remove unused imports**

Clean up any imports that are no longer used after removing strips and tooltips (e.g., `Input` if no longer needed, tooltip imports, `CircleHelp`).

- [ ] **Step 4: Verify dev server compiles, check Tournament step visually**

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/TournamentSetup.tsx
git commit -m "refactor: tournament length to Select, remove unnecessary tooltips"
```

---

### Task 7: Replace Remaining Number Inputs with NumberInput

**Files:**
- Modify: `src/components/sections/FencerCounts.tsx`
- Modify: `src/components/sections/RefereeSetup.tsx`

- [ ] **Step 1: Update FencerCounts**

In `src/components/sections/FencerCounts.tsx`:

1. Replace the `Input` import with `NumberInput`:
   ```tsx
   import { NumberInput } from '@/components/ui/number-input'
   ```

2. Replace each `<Input type="number" ...>` in the fencer count table with:
   ```tsx
   <NumberInput
     value={selectedCompetitions[id].fencer_count}
     onChange={(v) => updateCompetition(id, { fencer_count: v })}
     min={0}
     aria-label={`Fencer count for ${label}`}
   />
   ```

3. Remove the `Input` import if no longer used.

- [ ] **Step 2: Update RefereeSetup**

In `src/components/sections/RefereeSetup.tsx`:

1. Add `NumberInput` import:
   ```tsx
   import { NumberInput } from '@/components/ui/number-input'
   ```

2. Replace each `<Input type="number" ...>` for foil/epee refs and sabre refs with:
   ```tsx
   <NumberInput
     value={ref.foil_epee_refs}
     onChange={(v) => setDayRefs(i, { foil_epee_refs: v })}
     min={0}
     aria-label={`Foil/Epee refs for Day ${i + 1}`}
   />
   ```
   and similarly for `sabre_refs`.

3. Remove the `Input` import if no longer used.

- [ ] **Step 3: Verify dev server compiles, check Fencer and Referee steps visually**

Verify the +/- stepper buttons render correctly in both tables.

- [ ] **Step 4: Run all tests**

Run: `timeout 120 pnpm --silent vitest run > ./tmp/test.log 2>&1`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/FencerCounts.tsx src/components/sections/RefereeSetup.tsx
git commit -m "refactor: replace Input type=number with NumberInput stepper across wizard"
```

---

### Task 8: Wire buildConfig for Finals Strip

**Files:**
- Modify: `src/store/buildConfig.ts`

- [ ] **Step 1: Update buildCompetitions to use include_finals_strip**

In `src/store/buildConfig.ts`, the `buildCompetitions` function currently hardcodes `de_finals_strip_id: null`. Update it to read from state:

```ts
// In buildCompetitions, replace the hardcoded finals strip fields:
de_finals_strip_id: state.include_finals_strip ? `strip-${state.strips_total}` : null,
de_finals_strip_requirement: DeStripRequirement.HARD,
de_round_of_16_strips: 4,
de_round_of_16_requirement: DeStripRequirement.HARD,
de_finals_strips: state.include_finals_strip ? 1 : 2,
de_finals_requirement: DeStripRequirement.HARD,
```

When `include_finals_strip` is true, the last strip (highest index) is designated as the finals strip.

- [ ] **Step 2: Run all tests**

Run: `timeout 120 pnpm --silent vitest run > ./tmp/test.log 2>&1`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/store/buildConfig.ts
git commit -m "feat: wire include_finals_strip to buildConfig competition output"
```

---

### Task 9: End-to-End Visual Verification

**Files:** None (verification only)

- [ ] **Step 1: Walk through the wizard**

Using the preview server, verify each step:

1. **Tournament step:** Only shows Tournament Type (Select) and Tournament Length (Select with 2/3/4). No strips. No unnecessary tooltips. Day schedule still appears.
2. **Fencers step:** Fencer counts use NumberInput steppers. Compact layout.
3. **Refs & Strips step:** Strips card on top (# of Strips with NumberInput + Suggest, # with Video with NumberInput clamped to strips_total, Include Finals Strip checkbox). Referees card below (same as before but with NumberInput steppers).
4. **Analysis step:** Runs without errors.
5. **Schedule step:** Renders if analysis passes.

- [ ] **Step 2: Test Suggest buttons**

1. Select a template with competitions (e.g., NAC template)
2. Go to Refs & Strips step
3. Click Suggest on Strips card → should populate strip count = n_pools of largest competition
4. Click Suggest on Referees card → should populate ref counts

- [ ] **Step 3: Test video strip clamping**

1. Set strips to 10
2. Set video strips to 5
3. Reduce strips to 3 → video strips max should clamp to 3

- [ ] **Step 4: Test finals strip checkbox**

1. Click Suggest with checkbox unchecked → get base count
2. Check "Include Finals Strip"
3. Click Suggest again → count should be base + 1
