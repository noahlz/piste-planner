# Feature Specification: Consolidate Domain Logic and Coverage Before the Layout Deletion

**Feature Branch**: `004-p3-workbench-shell` (interstitial – no new branch)

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "before we proceed to S2, lets specify session 1.5 that fixes the issues but also cleans up / deletes lines from WizardShell and KitchenSink and also refactors them to a new file that consolidates the domain logic that is reusable"

## Why This Feature Exists

Feature 004 plans to delete the wizard and kitchen-sink layouts at T020, then decide
the fate of their test cases at T021–T022 — in the same session, under deletion
pressure. That ordering mixes two different kinds of work. Deciding *which
behavior survives* is judgment, and its failure mode is silent: coverage
disappears and the suite stays green. Making a surviving test *run against the
new UI* is mechanical, and it fails loudly.

This feature does the judgment now, while both layouts still run and all 878
tests pass, so 004's S3 is left with only the mechanical half — and so that its
T020 becomes a pure deletion with no test fallout to discover.

## Scope Correction Recorded Before Specification

The originating request assumed reusable domain logic was still buried in the
components 004 deletes. Inspection of the actual files contradicts that, and the
scope below reflects what is really there:

- `ActionButtons.tsx` is 31 lines and holds no domain logic. `runScheduleAll`
  already lives in `src/store/runActions.ts` and findings already derive through
  `selectDerivedFindings` in `src/store/derived.ts`.
- `TemplateSelector.tsx` is 46 lines and holds no domain logic. `applyTemplate`
  is already a store action and `TEMPLATES` already lives in
  `src/engine/catalogue.ts`.
- `SaveLoadShare.tsx` is **not** in 004's T020 deletion list. It survives and is
  re-homed into the workbench top bar. Its serialization logic already lives in
  `src/store/serialization.ts`, which already carries 76 of its own tests.

P1 and P2 already did the extraction this request anticipated. A third story was
drafted to lift the remaining browser plumbing out of `SaveLoadShare.tsx` — blob
download, file reading, share-URL assembly, clipboard, the size threshold — and
was **cut**: the component that hosts it survives 004's deletion, so nothing
breaks without it, and it would have traded a test dependency on one layout for
a dependency on another. It is recorded in the backlog, not here.

## What This Feature Cannot Do, and Why

The six source files carrying the unwanted names — `KitchenSinkPage.tsx` and
`wizard/WizardShell.tsx` plus `WizardStep1` through `WizardStep4` — are not
deleted here. `src/App.tsx` renders `layoutMode === 'wizard' ? <WizardShell /> :
<KitchenSinkPage />` and has no third branch. Those two components are the
entire application until 004's T011–T019 build the workbench shell. Deleting
them first leaves a header rendering over nothing, a failing live smoke run, and
every re-targeted test with no host to mount.

So they die at 004's T020, which is the first task of its S3. This feature's job
is to make that deletion mechanical: after it, nothing in the test suite
references those components or the layout mode at all, and T020 is a plain
removal rather than a removal that discovers broken imports.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Viewer preferences cannot be corrupted by their own defaults (Priority: P1)

The view-state module that 004 landed at T004 is about to be wired into the
store by 004's US1 and read by every panel of the workbench. Three defects in it
are cheap to fix while it has exactly one consumer and expensive to find once a
store slice, a canvas, and a drawer all hold references to its output.

**Why this priority**: It is the smallest, most contained work in the feature,
it blocks nothing, and its cost rises steeply the moment 004's S2 starts. A
shared mutable default is the kind of defect that surfaces as an unrelated test
failing in a different file.

**Independent Test**: Fully testable through the view-state module's own unit
tests with no UI mounted. Delivers a module whose fallback path cannot leak
shared state and whose write path cannot throw into a caller.

**Acceptance Scenarios**:

1. **Given** stored preferences are absent or unreadable, **When** preferences
   are loaded twice and the first result is mutated, **Then** the second load
   returns unmodified defaults.
2. **Given** the browser refuses to persist (private mode, quota exhausted),
   **When** preferences are saved, **Then** the caller is not interrupted by an
   error and the application continues.
3. **Given** stored preferences contain a numerically valid but nonsensical
   value — a zero or negative zoom, a negative drawer height — **When**
   preferences are loaded, **Then** defaults are returned rather than the stored
   value.

---

### User Story 2 - No behavior loses its only test when the old layouts go (Priority: P1)

Seventy-eight test cases assert behavior belonging to layouts feature 004
deletes. Some of that behavior the workbench still owns. Some of it — step
navigation, layout switching — is gone by design. Each case is triaged
individually, survivors are moved to files named for the behavior they test
rather than for the layout that hosted them, and the tally is recorded.

**Why this priority**: This is the whole point of the feature. It is also the
only part whose failure is invisible — every wrong call still leaves a green
suite.

**Independent Test**: Fully testable by running the suite before and after and
comparing case counts against the recorded tally. Delivers a triage decision for
every one of the 78 cases, with the reasoning for every deletion written down.

**The 78 cases**:

| Source | Cases |
|---|---:|
| `__tests__/components/KitchenSinkPage.test.tsx` | 47 |
| `__tests__/components/WizardShell.test.tsx` | 27 |
| `__tests__/store/store.test.ts` — the `layoutMode` and `setLayoutMode` cases | 4 |
| **Total** | **78** |

The four store cases are included because nothing in 004 currently owns them.
They assert a slice that T020 removes, so left alone they survive the deletion
and then fail.

**Acceptance Scenarios**:

1. **Given** the 78 cases, **When** triage completes, **Then** every case is
   recorded as either re-targeted or deleted, the two counts sum to 78, and each
   deletion names the behavior that is going away.
2. **Given** a case asserting behavior the workbench retains, **When** it is
   re-targeted, **Then** it lives in a file named for that behavior and passes.
3. **Given** a case asserting wizard step navigation, layout switching, or the
   layout-mode slice, **When** it is triaged, **Then** it is deleted and the
   deletion is recorded as intentional.
4. **Given** triage is complete, **When** the full suite runs, **Then** it is
   green and its total case count equals 878 minus the deleted count plus any
   cases added.
5. **Given** triage is complete, **When** the suite is searched, **Then** no test
   file imports `KitchenSinkPage` or `WizardShell` or reads the layout-mode
   slice, so 004's T020 can delete those files without touching a test.

---

### Edge Cases

- A test case asserts a mixture of surviving and departing behavior in one
  assertion block. It cannot be cleanly re-targeted or cleanly deleted, and
  guessing either way loses information. Such a case is split, or the feature
  halts on it and asks — it is never silently rounded into a bucket.
- Triage finds a case that duplicates coverage already provided by
  `serialization.test.ts`'s 76 cases or by 004's planned region tests.
  Duplicate coverage is still coverage, and it is deleted only when the
  duplicate is exact, not merely similar.
- A re-targeted case cannot pass because the behavior it asserts is currently
  provided only by a layout that 004 deletes. The case is kept and marked as
  belonging to 004's later work rather than deleted for being inconvenient now.
- A re-targeted case still needs a component to mount, and the only one
  available is a layout that 004 deletes. Mounting it is acceptable — 004's T023
  re-points it — but the case must not take its *file name* from that layout,
  because the name is what survives to confuse the next reader.
- Stored viewer preferences hold a value that is well-formed and inside range
  but was written by an older shape of the module. Whole-object fallback to
  defaults is the existing and intended behavior and stays that way.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Loading viewer preferences MUST return an independent value on
  every call, so that mutating a returned result cannot affect any later call.
- **FR-002**: Saving viewer preferences MUST NOT propagate a storage failure to
  its caller, matching the tolerance the load path already has.
- **FR-003**: Loading viewer preferences MUST reject stored numeric values that
  are outside the range their field can meaningfully take, falling back to
  defaults as it already does for malformed and wrongly-typed values.
- **FR-004**: Every one of the 78 identified cases MUST receive an individually
  recorded triage decision of re-targeted or deleted.
- **FR-005**: The recorded re-targeted and deleted counts MUST sum to 78, and
  any discrepancy MUST be reported rather than reconciled by adjusting a count.
- **FR-006**: Re-targeted cases MUST be relocated into test files named for the
  behavior under test rather than for the layout that previously hosted it.
- **FR-007**: Each deleted case MUST have its deletion justified by naming the
  behavior being removed from the product.
- **FR-008**: On completion, no test in the suite may import `KitchenSinkPage`
  or `WizardShell`, or read or set the layout-mode slice, so that 004's T020 is
  a deletion of source files only.
- **FR-009**: Scheduling results MUST NOT change. The B1–B8 figures recorded in
  `specs/004-p3-workbench-shell/drift-baseline.md` MUST be identical before and
  after, with scheduled event counts especially unmoved.
- **FR-010**: The full test suite MUST be green at the end of the feature, and
  the final case count MUST be reconcilable to 878 by the recorded tally alone.
- **FR-011**: This feature MUST NOT modify `specs/004-p3-workbench-shell/`'s
  `spec.md`, `plan.md`, or `tasks.md` beyond checkbox state.
- **FR-012**: Feature 004's session prompts MUST be updated to reflect what this
  feature has already done, so that S3 does not repeat triage that is complete
  and does not act on the superseded case counts.

### Key Entities

- **Triage record**: The per-case decision log. For each of the 78 cases: where
  it came from, whether it was re-targeted or deleted, and where it went or why
  it went away. This is the feature's primary deliverable and the artifact that
  makes a silent coverage loss visible.
- **Viewer preferences**: The per-person view settings — view mode, row height,
  zoom, scroll positions, drawer height, scorecard expansion. Not part of a
  tournament configuration and never present in a shared link.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 78 identified cases have a recorded decision, and the
  re-targeted and deleted counts sum to exactly 78.
- **SC-002**: The full test suite is green, and its case count is explained
  entirely by the triage tally applied to the starting 878.
- **SC-003**: All eight drift scenarios produce results identical to the
  recorded baseline — no scenario's scheduled event count moves by even one.
- **SC-004**: No test file takes its name from a layout that feature 004
  deletes, and no test references those components or the layout-mode slice.
  Deleting the six source files would break no test.
- **SC-005**: Feature 004's remaining test-triage work is reduced to relocating
  already-triaged cases, with no surviving instruction to make judgment calls at
  volume and no surviving reference to the superseded 52 and 79 counts.

## Assumptions

- This feature is interstitial. It builds on branch `004-p3-workbench-shell` at
  `8bcbf18c2e` and creates no new branch, because its output must be present
  before 004's S2 begins.
- Feature 004's worktree flow applies unchanged: subagents commit to the feature
  branch and the user makes the commit that closes the work.
- Surviving tests may still mount `KitchenSinkPage` when this feature ends, so
  long as no test file is *named* for it and 004's T020 remains a source-only
  deletion. Feature 004's T023 re-points those mounts at the workbench.
- The scheduling engine is not touched. This is store- and test-layer work only,
  and the store-to-engine bridge is unchanged.
- No live smoke run is required. This feature changes nothing a person using the
  application can see — the view-state module has no UI consumer yet, and the
  rest is test-layer work. That is a deliberate reading of constitution VI, not
  a skipped step.
- The counts 52 and 79 appearing in feature 004's `tasks.md`, `plan.md`,
  `research.md`, and `scripts/run-chain.sh` were estimated during planning and
  are wrong. The verified counts are 47 and 27. Because those files may not be
  edited mid-implementation, the correction is carried in 004's session prompts
  instead, per FR-012.
- The browser plumbing inside `SaveLoadShare.tsx` is left where it is. It was
  specified and cut for the reasons in the Scope Correction above, and belongs
  in the backlog rather than in this feature.
