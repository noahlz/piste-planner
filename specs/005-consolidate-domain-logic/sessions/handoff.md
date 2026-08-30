# Session handoff — 005-consolidate-domain-logic

One section per session. Each records what landed, with commit SHAs, and what
the next session has to know that is not obvious from the code.

## S1

**Scope**: T001–T008 — the judgment half. T009 onward belongs to S2 and was not
started.

### Tasks completed

| Task | Commit | What landed |
|---|---|---|
| T001 | – (no artifact) | Starting counts verified, not assumed. See below. |
| T002 | `c92675a261` | 6 failing cases in `__tests__/store/viewState.test.ts` for defects (a), (b), (c) |
| T002 follow-on | `72ad06eacd` | 3 more failing cases closing the `+Infinity` hole. See "Decisions the plan did not anticipate". |
| T003 | `d61baa9bf3` | `src/store/viewState.ts` — fresh-object returns, frozen default, guarded write, four range predicates |
| T004 | `0901122686` | `test-quality-reviewer` dispatched; 1 finding applied, 4 recorded and skipped |
| T005 | `2a50e581c0` | `triage-record.md` — 78 rows, decisions blank |
| T006 + T008 | `89bde51e20` | 27 WizardShell + 4 `uiSlice` decisions |
| T007 | `1b310dd5ae` | 47 KitchenSinkPage decisions, made one at a time |

### Gate at end of session

`tsc -b` exit 0, `lint` exit 0, full suite **890 passed (890)** across 34 files,
run twice at session close with identical results.

### The starting counts, and how they were verified

Every count was taken two independent ways before any work began — `grep -cE
'^\s*(it|test)\('` per file, and vitest's own per-file report from a full run.

| Source | Expected | grep | vitest |
|---|---:|---:|---:|
| `__tests__/components/KitchenSinkPage.test.tsx` | 47 | 47 | 47 |
| `__tests__/components/WizardShell.test.tsx` | 27 | 27 | 27 |
| `__tests__/store/store.test.ts` — `describe('uiSlice')` | 4 | 4 | — |
| Whole suite | 878 / 34 files | — | 878 / 34 |

Branch `004-p3-workbench-shell`, working tree clean, `.specify/feature.json`
pointing at `specs/005-consolidate-domain-logic`. No halt was triggered.

**Suite count reconciliation.** 878 at session start → **890** at close. All
+12 are US1 test additions: +9 from T002 and its follow-on, +3 from T004's
applied finding. **No triage decision has been applied to the suite yet** — S2's
T009–T013 do the moving and deleting, so the 78 cases are all still present and
still passing.

### Triage tally

**39 re-targeted, 39 deleted, summing to 78.** Verified against the record
independently of the subagents' reports: 78 numbered rows, 78 non-blank
decisions, zero rows naming `KitchenSinkPage` or `WizardShell` as a mount target.

| Source | re-targeted | deleted | total |
|---|---:|---:|---:|
| `KitchenSinkPage.test.tsx` | 33 | 14 | 47 |
| `WizardShell.test.tsx` | 6 | 21 | 27 |
| `store.test.ts` `uiSlice` | 0 | 4 | 4 |
| **Total** | **39** | **39** | **78** |

Where the survivors are headed. The counts sum to 40 rather than 39 because one
row (`shows the empty state when nothing is placed`) splits across two
destinations — its schedule half and its referee half assert text in two
different components.

| Destination file | Cases | Mounts |
|---|---:|---|
| `saveLoadShare.test.tsx` | 12 | `SaveLoadShare` |
| `configEditing.test.tsx` | 11 | `TournamentSetup` ×2, `StripSetup` ×3, `FencerCounts` ×5, `CompetitionMatrix` ×1, plus one composed host |
| `analysisOutput.test.tsx` | 9 | `AnalysisOutput` |
| `scheduleOutput.test.tsx` | 5 | `ScheduleOutput` |
| `refRequirementsReport.test.tsx` | 2 | `RefRequirementsReport` |
| `scheduleView.test.tsx` | 1 | `ScheduleView` |

### The four provisional buckets, on contact

`plan.md` named four and said they were provisional. **Three survived intact**
(`saveLoadShare`, `analysisOutput`, `configEditing`) and `scheduleOutput`
survived but absorbed cases from both source files. **Two new ones appeared**,
both because research D1's cluster table was wrong about where behavior lives —
see below.

**An unresolved inconsistency S2 must settle.** `plan.md`'s rule is that "a
bucket that ends up holding two cases is merged into its neighbour rather than
kept for symmetry." T007 applied it, folding what would have been four separate
`tournamentSetup` / `stripSetup` / `fencerCounts` / `competitionMatrix` files
into `configEditing.test.tsx` — each case still mounts its own single component,
because the file is a bucket, not a shared mount. T006 did not apply it, and
left `refRequirementsReport.test.tsx` (2 cases) and `scheduleView.test.tsx`
(1 case) standing as their own files.

Applying the rule consistently would fold both into `scheduleOutput.test.tsx`,
giving exactly the four files `plan.md` provisionally named, with each case
still mounting `RefRequirementsReport` or `ScheduleView` as recorded. **This is
S2's call, since T009–T012 create the files** — but if S2 merges them, it must
update the destination column in `triage-record.md` in the same task, or the
record stops describing the tree.

### Cases that were hard to classify, and how they were decided

This is the part S2 cannot reconstruct from the record alone.

- **`fixing strips re-enables Forward without any validate run`** (WizardShell)
  was the expected halt candidate — a compound case with a departing navigation
  half and a surviving derived-findings half. Decided as a clean **deletion**,
  not a split: `__tests__/store/derived.test.ts`'s `selectDerivedFindings >
  reports validation errors from current inputs – a zero strip count surfaces
  and clears` already runs the identical zero-strips-then-fixed sequence against
  the exact selector the Forward button's `disabled` prop read. The surviving
  contract already has a home, so nothing needed carrying forward.
- **`state (strips_total) is preserved when switching layouts`** looked like a
  state-persistence case. It is not — it only asserts that flipping `layoutMode`
  does not reset an unrelated field. With the toggle gone there is no "switching
  layouts" for anything to be preserved across, so it goes with the toggle.
- **`Generate Schedule is disabled while derived findings hold a hard error`**
  and its `is enabled once the hard error is fixed` twin. Both deleted, and this
  one is a product gap rather than a coverage lapse. See the section below.
- **`saved JSON carries the v2 shape including placements`** was checked against
  `serialization.test.ts`'s 76 cases before being called. Those cases exercise
  `serializeState` against a state object; **none** of them assert that the blob
  `SaveLoadShare` hands to `URL.createObjectURL` is the serialization of the
  live store. The v2-shape assertions inside the case are redundant, the wiring
  claim is not, so it survives as a wiring test rather than being deleted as a
  duplicate.
- **`renders no Validate button — findings derive on every render`** was flagged
  during dispatch as probably a surviving contract, and T007 deleted it anyway
  with a better argument: mounting `AnalysisOutput` to assert the absence of a
  button that component never rendered is vacuous, and would stay green through
  exactly the regression it exists to catch. The contract's positive form
  survives three times over.
- **`shows the empty state when nothing is placed`** is the one split row. Its
  two assertions land on text in two different components — `"No events placed
  yet."` in `ScheduleOutput` and `"No referee demand — nothing is placed yet."`
  in `RefRequirementsReport` — and neither depends on the other being mounted.
- **Two pairs that look like duplicates and are not.** `entering fencer counts
  updates the inputs` asserts the input's displayed value after
  `fireEvent.change`; `changing fencer count input updates store state` asserts
  the `updateCompetition` write after change *plus blur*. Render side versus
  commit-on-blur wiring, both kept. Likewise `loading a file with no orphan
  placements shows no drop notice` is not merely the negative of its neighbour —
  it is the only case anywhere pinning that the `role="status"` live region
  stays mounted while empty, which is the behavior `SaveLoadShare.tsx`'s own
  comment exists to protect.
- **Two genuine duplicates were found and deleted.** One KitchenSinkPage case is
  byte-identical to another in the same file (same `applyTemplate('RYC
  Weekend')`, same render, same single assertion), and one is line-for-line
  identical to a WizardShell case already re-targeted at `scheduleOutput` —
  including the helper body, inlined. Both deleted with the survivor named.

### Coverage knowingly dropped

Three behaviors leave the suite with no equivalent test anywhere. Written down
because this is the half that is easiest to leave out and impossible to
reconstruct.

**(a) The ERROR-severity scheduling gate. This is a product gap, not a test
gap — S2 must build it, not restore a test for it.** `severity === 'ERROR'`
appears in exactly two files in `src/`, and 004's T020 deletes both:

```
src/components/sections/ActionButtons.tsx:16   hasHardErrors = validationErrors.some(e => e.severity === 'ERROR')
src/components/sections/ActionButtons.tsx:24   <Button ... onClick={() => runScheduleAll()} disabled={hasHardErrors}>
src/components/wizard/WizardShell.tsx:113      hasHardErrors = ...
src/components/wizard/WizardShell.tsx:116      forwardDisabled = wizardStep === 3 && hasHardErrors
```

The only surviving trigger is `src/components/ScheduleView.tsx`'s Regenerate
button, which calls `runScheduleAll()` with **no `disabled` prop**, and
`src/store/runActions.ts` does not self-guard — it catches a scheduler throw but
never inspects finding severity. So once T020 lands, nothing stops a user
scheduling with a hard ERROR present. Verified by reading all four files
directly, not inferred from the triage.

The related selector-level coverage that *does* survive keys on `e.field ===
'strips_total'`, not on severity, so it does not cover this.

**(b) Render coverage for any template picker.** `TemplateSelector` goes.
`CompetitionMatrix` has its own surviving "Presets…" control over the same
`TEMPLATES` keys, but it sits inside a `Collapsible` closed by default, so the
deleted case's `getByRole('radio', …)` cannot be re-pointed at it. What lapses
is only "a user can reach template application through the UI" — the behavior
behind it, `applyTemplate` selecting the right ids, is covered more tightly by
`store.test.ts`'s `applyTemplate > selects competitions from a named template`.
Whether the workbench exposes a reachable picker is 004's question.

**(c) "No action button triggers scheduling on demand."** The negative
assertion has no non-vacuous home once `ActionButtons` is gone. The contract's
positive form — findings appear with no run in between — survives three times
over on `AnalysisOutput`.

### Errors found in this feature's own planning artifacts

Recorded here rather than corrected in place, because editing `research.md`
mid-implementation is the re-plan the constitution forbids.

- **research D1's cluster table is wrong twice, and incomplete once.** It
  assigns referee behavior to `ScheduleOutput`; `grep -ci referee
  src/components/sections/ScheduleOutput.tsx` returns **0**, and "Referee
  Requirements", "Peak Total Refs" and "No referee demand — nothing is placed
  yet." all live in `RefRequirementsReport.tsx`. It omits
  `src/components/ScheduleView.tsx`, which holds the Regenerate button and
  survives T020, so it is a legitimate mount target. And it treats
  `TemplateSelector` as the sole host for template application, when
  `CompetitionMatrix.tsx:206,213` holds its own `applyTemplate` wiring over the
  same `TEMPLATES` keys — which is why several rows re-target at a surviving
  component instead of falling back to D1's "re-target at the store action" rule.
- **research D4's citation is imprecise; its count is right.** It calls them
  "the four `layoutMode` and `setLayoutMode` cases at `store.test.ts:134–148`".
  That line range holds three `it()` blocks. The four are the whole
  `describe('uiSlice')` block at 130–159 — the fourth is `setStep > sets
  wizardStep`, which asserts wizard step sequencing that 004's T022 already
  names as departing. The denominator of 78 is unaffected, so this was recorded
  rather than halted on.
- **`spec.md` contradicts itself on FR-008.** FR-008 requires that no test
  imports `KitchenSinkPage` or `WizardShell`; §Assumptions and §Edge Cases say
  surviving tests may still mount `KitchenSinkPage` so long as no file is
  *named* for it. Resolved toward FR-008, which is what makes T020 a source-only
  deletion, using D1's own escape hatch: a genuinely cross-section case
  "composes its own minimal host rather than importing one." Triage was run on
  that reading and no row names either component as a mount.

### Things S2 must not be surprised by

- **`__tests__/store/derived.test.ts:97` calls `setLayoutMode('kitchen-sink')`**
  as the "unrelated set()" in its memoization test. It is **not** one of the 78
  triaged cases, but T014's `grep -rn "KitchenSinkPage\|WizardShell\|layoutMode"
  __tests__/` will hit it and FR-008 is unmet until it is changed. It needs a
  substitute unrelated setter. A green suite will not tell you about this.
- **One re-targeted case carries a mount-scope hazard.** `Generate Link produces
  URL containing #config= hash` asserts
  `document.querySelectorAll('input[readonly]').length === 1` — a page-wide
  count. It holds with `SaveLoadShare` mounted alone, because the share URL
  input is that component's only readonly input, but it would break if
  `saveLoadShare.test.tsx` ever composes a host around it. T009 should keep the
  mount bare or rewrite the assertion to be scoped.
- **The Node 24 `localStorage` guard in `src/test-setup.ts` is still load-bearing**
  and now has more dependents than before. See 004's handoff §S1 surprise 1. Do
  not delete it as redundant because the suite is green.

### Not finished, and why

Nothing in scope was left undone, and no halt condition fired. T009 onward was
out of scope by instruction and was not started. S2 begins at **T009** with the
US2 triage complete and every decision recorded.
