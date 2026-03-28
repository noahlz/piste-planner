### Enhance RefereeSetup UI with optimal vs actual comparison

The PRD specified showing the user "You need X foil/epee refs and Y sabre refs on day N" and letting them adjust from the optimal. Currently the UI has a "Suggest" button that auto-fills but doesn't show the optimal values for comparison, and doesn't surface sabre fill-in recommendations.

**Files:**
- Modify: `src/components/sections/RefereeSetup.tsx`
- Modify: `__tests__/components/WizardShell.test.tsx` (or create `__tests__/components/RefereeSetup.test.tsx` if the shell test doesn't cover this)

- [ ] **Step 1: Add optimal refs display to RefereeSetup**

Add a column to the referee table showing the optimal (engine-calculated) values alongside the user's actual values. Read `optimalRefs` from the store:

```typescript
const optimalRefs = useStore((s) => s.optimalRefs)
```

Add two new `<th>` columns after the existing headers: "Optimal F/E" and "Optimal S". In each row, display the optimal values as read-only reference. When the user's value is below optimal, tint the cell with a warning color.

```tsx
<th className="pb-2 text-right font-medium">Optimal F/E</th>
<th className="pb-2 text-right font-medium">Optimal S</th>
```

In each row:

```tsx
<td className="py-1.5 text-right text-muted text-xs tabular-nums">
  {optimal?.foil_epee_refs ?? '—'}
</td>
<td className="py-1.5 text-right text-muted text-xs tabular-nums">
  {optimal?.sabre_refs ?? '—'}
</td>
```

- [ ] **Step 2: Add deficit warning styling**

When `ref.foil_epee_refs < optimal.foil_epee_refs`, add a warning tint to the input cell. Same for sabre. Use the existing `bg-warning` class.

```tsx
const feDeficit = optimal && ref.foil_epee_refs < optimal.foil_epee_refs
const sDeficit = optimal && ref.sabre_refs < optimal.sabre_refs
```

Apply conditionally:

```tsx
<td className={`py-1.5 text-right ${feDeficit ? 'bg-warning rounded' : ''}`}>
```

- [ ] **Step 3: Add sabre fill-in recommendation message**

Below the table, when any day has `sabre_refs < optimal sabre_refs` and `allow_sabre_ref_fillin` is false, show a recommendation:

```tsx
{daysWithSabreDeficit.length > 0 && (
  <p className="mt-3 rounded-md border border-amber-200 bg-warning px-3 py-2 text-sm text-warning-text">
    Days {daysWithSabreDeficit.map(d => d + 1).join(', ')}: sabre refs below optimal.
    Consider enabling "Sabre Fill-in" to allow foil/epee refs on sabre strips.
  </p>
)}
```

- [ ] **Step 4: Wire calculateOptimalRefs into the wizard flow**

The store has `optimalRefs` and `setOptimalRefs`, but check whether `calculateOptimalRefs` is actually called and its results stored. Look at `ActionButtons.tsx` or wherever the "Suggest" button triggers to see if `calculateOptimalRefs` runs. If not, add the call:

In the component or action that runs analysis/validation, after running `initialAnalysis`, also run:

```typescript
import { calculateOptimalRefs } from '../../engine/refs.ts'

// After building config and competitions:
const optimal = calculateOptimalRefs(competitions, config)
setOptimalRefs(optimal.map(o => ({
  foil_epee_refs: o.foil_epee_refs,
  sabre_refs: o.sabre_refs,
  allow_sabre_ref_fillin: false,
})))
```

- [ ] **Step 5: Test manually in the browser**

Run: `pnpm dev`
- Select a template with mixed weapons
- Set strip count
- Navigate to referee setup (Step 3 in wizard)
- Click "Suggest"
- Verify optimal columns show values
- Reduce a ref count below optimal
- Verify warning tint appears
- Verify sabre fill-in message appears when sabre refs are below optimal

- [ ] **Step 6: Commit**

```
feat: show optimal vs actual referee comparison in RefereeSetup

Displays engine-calculated optimal ref counts alongside user
inputs. Highlights deficits with warning styling and recommends
sabre fill-in when sabre refs are below optimal.
```

