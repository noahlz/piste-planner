# Data Model: Consolidate Domain Logic and Coverage Before the Layout Deletion

Two shapes. One is an existing module gaining validation rules; the other is an
artifact this feature creates.

---

## Viewer preferences — validation rules added

The `ViewState` shape itself is unchanged and its home is
[`../004-p3-workbench-shell/data-model.md`](../004-p3-workbench-shell/data-model.md)
§New: view state. What changes here is what counts as a valid stored value.

Existing rules, unchanged: every field is required, both union fields are
checked against their `as const` value sets, and any failure falls back to the
whole default object rather than merging per field.

Rules added by US1:

| Field | Type | Added rule | Rejected example |
|---|---|---|---|
| `viewMode` | union | — (already checked) | — |
| `rowHeightStep` | union | — (already checked) | — |
| `timeZoom` | number | finite and `> 0` | `0`, `-1.5`, `Infinity` |
| `timeScroll` | number | finite and `>= 0` | `-30` |
| `rowScroll` | number | finite, integer, `>= 0` | `-1`, `2.5` |
| `drawerHeight` | number | finite and `>= 0` | `-240` |
| `scorecardExpanded` | boolean | — (already checked) | — |

No upper bounds. An upper bound would be a product decision nobody has made, and
[research D3](./research.md) records why inventing one is worse than omitting it.

**Return contract**, also new: `loadViewState()` returns a value no other caller
holds a reference to. Callers may mutate what they receive without affecting any
later call. `DEFAULT_VIEW_STATE` is frozen so a write to it fails rather than
propagates.

**Write contract**, also new: `saveViewState()` does not throw. A browser that
refuses to persist — private mode, exhausted quota — produces no error at the
call site, matching what `loadViewState()` already does when reading throws.

---

## Triage record

`specs/005-consolidate-domain-logic/triage-record.md`. Created during execution,
committed, and read afterwards by 004's S3. One row per case.

| Column | Meaning |
|---|---|
| Source | The file the case came from, and its `describe` block |
| Case | The case name, verbatim from `it(...)` |
| Decision | `re-targeted` or `deleted` |
| Destination / reason | For a survivor: the file it now lives in and the component it mounts. For a deletion: the product behavior being removed |

**Invariants**:

- Exactly 78 rows. 47 from `__tests__/components/KitchenSinkPage.test.tsx`,
  27 from `__tests__/components/WizardShell.test.tsx`, 4 from
  `__tests__/store/store.test.ts`.
- Every row has a decision. There is no third value and no blank.
- A `deleted` row's reason names a product behavior, not a test property.
  "Asserts wizard step navigation, which the workbench does not have" qualifies.
  "Redundant" does not — redundant with what, and is the duplicate exact?
- A `re-targeted` row's destination names both the file and the mounted
  component, so [research D1](./research.md)'s rule is checkable row by row.
- A case that cannot be classified is not given a row and guessed. The feature
  halts and asks. See [spec.md](./spec.md) §Edge Cases.

**Source counts** were verified two ways before planning — `grep -c` over each
file and vitest's own per-file report — because the counts in feature 004's
artifacts (52 and 79) were planning estimates that turned out wrong.

---

## What this feature does not model

No store slice is added, widened, or removed. No serialized shape changes, so
`schemaVersion` stays at 2 and every existing share URL and saved file keeps
working. No engine type is touched.

The `layoutMode` slice at `src/store/store.ts:93,96,313,316` is **not** removed
here — only its four tests are. The slice is 004's T020, because `src/App.tsx`
still reads it. [research D6](./research.md).
