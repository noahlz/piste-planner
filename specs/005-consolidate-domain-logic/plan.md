# Implementation Plan: Consolidate Domain Logic and Coverage Before the Layout Deletion

**Branch**: `004-p3-workbench-shell` (interstitial – no branch of its own) | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-consolidate-domain-logic/spec.md`

## Summary

Move the judgment out of feature 004's S3 and do it now, while both old layouts
still run and all 878 tests pass. Two stories:

- **US1** hardens `src/store/viewState.ts` against three defects its T005 review
  did not catch, while the module still has exactly one consumer.
- **US2** triages 78 test cases that assert behavior belonging to layouts 004
  deletes, moves the survivors to files named for the behavior, and records a
  per-case decision.

The point is not tidiness. 004's T021–T022 asked one session to make 78 judgment
calls at the same moment it deleted the code those calls are about, and the
failure mode is silent — a wrong call still leaves a green suite. Splitting the
judgment from the mechanics makes the loss visible while it is still cheap to
reverse.

Two things this plan establishes that the spec does not:

- **Survivors mount sections, not pages.** Of the twelve components in
  `src/components/sections/`, 004 deletes exactly two — `TemplateSelector.tsx`
  and `ActionButtons.tsx`. Everything else survives and is re-homed. So most
  re-targeted cases can mount the single surviving section that exhibits the
  behavior instead of a whole page, which is what makes FR-008 achievable rather
  than aspirational. [research D1](./research.md).
- **The triage record is an artifact, not a commit message.** It is
  `triage-record.md` in this directory, one row per case, and it is the
  deliverable a reviewer reads to decide whether coverage was lost.
  [research D2](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.9 with `erasableSyntaxOnly`, React 19.2

**Primary Dependencies**: React, Zustand 5, Radix behind shadcn/ui wrappers,
Tailwind CSS 4. **No dependency is added, removed, or upgraded by this feature.**

**Storage**: Unchanged. Tournament state serializes to a URL fragment via
`src/store/serialization.ts` (`schemaVersion: 2`); viewer preferences live in
`localStorage` under one key, outside the serializer.

**Testing**: Vitest 3 with React Testing Library and jsdom. `scripts/smoke.mjs`
is **not** run by this feature and **not** modified by it — see the Constitution
Check for why that is a reading of principle VI rather than a gap in it.

**Target Platform**: Desktop browser. Unchanged.

**Project Type**: Single-page React application over a pure TypeScript engine.

**Performance Goals**: None. This feature adds no runtime work. The full suite
runs in roughly 5 seconds and must not get materially slower.

**Constraints**: `src/engine/` is not touched, read or written. The B1–B8
figures in [`../004-p3-workbench-shell/drift-baseline.md`](../004-p3-workbench-shell/drift-baseline.md)
must be bit-identical before and after. Feature 004's `spec.md`, `plan.md`, and
`tasks.md` must not be edited beyond checkbox state — a hook enforces this.

**Scale/Scope**: 2 user stories. 78 test cases triaged. 1 source module
hardened. 0 components deleted, 0 created. Starting suite 878 passing across 34
files.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1.*

| Principle | Verdict | Basis |
|---|---|---|
| **I. Pure Engine Core** | PASS | `src/engine/` is neither read nor written. The only source file this feature edits is `src/store/viewState.ts`, which has no engine dependency. Everything else is test-layer. |
| **II. Test-First** | PASS | US1's three defects each get a failing test that reproduces the defect before the fix lands — a test that passes before the fix has not reproduced anything. US2 is test work throughout, and `test-quality-reviewer` is dispatched on the consolidated files. No React component is written, so `react-code-reviewer` has nothing to review — recorded here so its absence is not read as an omission. |
| **III. Behavior Drift** | PASS | No engine input, constant, or allocation changes. B1–B8 are re-run at the close as proof rather than as a diff to explain, and any movement at all is a defect in this feature, not a drift to record. |
| **IV. Bounded Computation** | PASS | Nothing in this feature iterates. |
| **V. Erasable TypeScript** | PASS | `viewState.ts` already uses `as const` objects with derived union types. The range validation US1 adds is plain predicates and introduces no new type construct. |
| **VI. The App Is Verified Live** | PASS, deliberately | Principle VI binds "every feature that changes what a user sees." This feature changes nothing a user sees: the view-state module has no UI consumer until 004's US1 wires it, and the rest is test-layer work. `scripts/smoke.mjs` is therefore neither run nor edited. This is the reading, stated so a later session does not mistake it for a skipped gate. If US1's scope ever grows to wire view state into a component, this verdict is void and the smoke run returns. |

### Orchestration note

This session authored the spec and this plan. Per the constitution's
orchestration section it **does not implement them** — a session that plans and
then builds against its own plan is the expensive failure the rule names. It
produces `tasks.md`, writes a session prompt, and hands off.

## Git Flow

**Worktree** (constitution §Git Ownership), sharing feature 004's. This feature
creates no branch: its output must exist on `004-p3-workbench-shell` before
that feature's S2 begins, and a separate branch would have to be merged into it
first, which is a landing operation no agent performs.

Subagents commit incrementally to `004-p3-workbench-shell`. Triage decisions
belong in those commit messages as well as in `triage-record.md` — the record is
the index, the commits are where a deletion's reasoning is attached to the
deletion itself. The user makes the commit that closes the feature.

`.specify/feature.json` now points at this directory, so `/speckit-tasks` and
`/speckit-implement` resolve here rather than at 004. Repointing it back is part
of the handoff to 004's S2.

## Project Structure

### Documentation (this feature)

```text
specs/005-consolidate-domain-logic/
├── spec.md
├── plan.md              # this file
├── research.md          # D1–D6
├── data-model.md        # viewer-preference field ranges, triage record shape
├── triage-record.md     # created during execution – the 78 decisions
├── quickstart.md        # how to verify this feature end to end
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks output – not created by /speckit-plan
```

No `contracts/` directory. This feature exposes no interface and changes no
user-facing surface, so a contract document would restate `data-model.md` under
a second heading. Constitution §Planning Artifacts: each fact has one home.

### Source Code (repository root)

```text
src/
├── engine/                       # NOT READ, NOT WRITTEN (constitution I)
├── store/
│   ├── viewState.ts              # US1 – the only source file this feature edits
│   ├── store.ts                  # UNCHANGED. The layoutMode slice at :93,:96,
│   │                             #   :313,:316 is 004's T020 to delete, not
│   │                             #   this feature's – App.tsx still renders it
│   └── serialization.ts          # UNCHANGED – already carries 76 tests
└── components/
    ├── KitchenSinkPage.tsx       # UNCHANGED – deleted by 004's T020
    ├── wizard/                   # UNCHANGED – deleted by 004's T020
    └── sections/                 # UNCHANGED. 10 of 12 survive 004 and are the
                                  #   mount targets for re-targeted cases (D1)

__tests__/
├── store/
│   ├── viewState.test.ts         # US1 – extended with the three defect cases
│   └── store.test.ts             # US2 – the 4 layoutMode cases removed
├── components/
│   ├── KitchenSinkPage.test.tsx  # US2 – triaged, then DELETED (47 cases)
│   ├── WizardShell.test.tsx      # US2 – triaged, then DELETED (27 cases)
│   ├── saveLoadShare.test.tsx    # NEW – survivors, mounting SaveLoadShare
│   ├── analysisOutput.test.tsx   # NEW – survivors, mounting AnalysisOutput
│   ├── scheduleOutput.test.tsx   # NEW – survivors, mounting ScheduleOutput
│   └── configEditing.test.tsx    # NEW – survivors, mounting rail sections
└── helpers/                      # shared setup extracted from the two dying
                                  #   files, if triage finds any worth keeping

scripts/smoke.mjs                 # NOT RUN, NOT MODIFIED – see constitution VI above
```

**Structure Decision**: New test files are named for the component or behavior
under test, never for a layout. The four names above are provisional — triage
decides how many buckets there actually are, and a bucket that ends up holding
two cases is merged into its neighbour rather than kept for symmetry with this
tree. What is not provisional is the rule that produced them: a survivor mounts
the smallest surviving component that exhibits its behavior.

## Story Sequencing

| | Story | Ships | Depends on |
|---|---|---|---|
| **US1** | View-state hardening | A module whose defaults cannot be corrupted and whose writes cannot throw | – |
| **US2** | Coverage triage | 78 recorded decisions, survivors re-homed, both files deleted, T020 made mechanical | – |

The two are independent and could run in either order or in parallel. US1 is
sequenced first because it is small and finishes cleanly, so a session that
runs out of room mid-triage still lands something whole.

US2 is the story with a halt condition. A case that asserts surviving and
departing behavior in one block is split; if it cannot be split, the feature
stops and asks rather than rounding it into a bucket. Halting is the correct
outcome there and the session prompt says so.

## Complexity Tracking

No constitution violations require justification.

One judgment call is recorded rather than buried: principle VI's live-smoke
requirement is read as not applying, because nothing user-visible changes. The
Constitution Check states the condition that would void that reading. The
simpler alternative — run the smoke driver anyway — was rejected because
`scripts/smoke.mjs`'s locators all target UI that 004's T020 deletes, so a run
here would assert against a layout on its way out and prove nothing about this
feature's work.
