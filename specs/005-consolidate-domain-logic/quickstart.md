# Quickstart: Verifying Consolidate Domain Logic and Coverage

How to confirm this feature did what it claims. Every check below is something a
reviewer can run without reading the diff.

## Prerequisites

Inside the `004-p3-workbench-shell` worktree, on that branch. This feature has
no branch of its own ([plan.md](./plan.md) §Git Flow).

Node 24 in this worktree, Node 22 on CI. The `localStorage` guard in
`src/test-setup.ts` exists because of that split — see 004's
[handoff](../004-p3-workbench-shell/sessions/handoff.md) §S1, surprise 1. Do not
remove it because the suite is green locally.

## The starting numbers

| | Value |
|---|---|
| Suite at `8bcbf18c2e` | 878 passed, 34 files |
| `KitchenSinkPage.test.tsx` | 47 cases |
| `WizardShell.test.tsx` | 27 cases |
| `store.test.ts` `layoutMode` cases | 4 |
| Cases to triage | 78 |

## The gate

```bash
timeout 180 pnpm exec tsc -b   > ./tmp/tsc.log  2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

Read a log only if its command failed. Run the suite **twice** before believing
a `localStorage`-adjacent result — 004's S1 recorded a file that passed once and
then failed reproducibly on re-run.

## US1 — view-state hardening

Each check corresponds to one acceptance scenario in [spec.md](./spec.md).

```bash
timeout 120 pnpm --silent vitest run __tests__/store/viewState.test.ts > ./tmp/test.log 2>&1
```

1. **Shared default cannot be corrupted.** A test loads preferences with nothing
   stored, mutates the result, loads again, and asserts the second result still
   holds the defaults. Before the fix this test fails — confirm it does, on the
   unfixed module, for that reason.
2. **A refused write does not throw.** A test makes `setItem` throw and asserts
   the call returns normally.
3. **Out-of-range numbers fall back.** One test per rule in
   [data-model.md](./data-model.md): `timeZoom: 0`, `timeScroll: -30`,
   `rowScroll: 2.5`, `drawerHeight: -240`. Each asserts the whole default object
   comes back, not a repaired value.

## US2 — coverage triage

**The record is complete and adds up.**

```bash
grep -c '^|' specs/005-consolidate-domain-logic/triage-record.md
```

Rows must total 78 after the header and separator. Any other number is reported,
never reconciled by adjusting a count (FR-005).

**Nothing references the departing layouts** — this is the check that makes
004's T020 mechanical:

```bash
grep -rn "KitchenSinkPage\|WizardShell\|layoutMode" __tests__/
```

Must return nothing. If it returns a hit, FR-008 is unmet regardless of what the
suite says.

**No test file is named for a departing layout:**

```bash
find __tests__ -iname "*kitchensink*" -o -iname "*wizard*"
```

Must return nothing.

**The suite reconciles.** Final case count equals `878 − deleted + added`, where
`deleted` and `added` come from the record. If it does not reconcile, the
discrepancy is the finding — a green suite at an unexplained count is exactly
the silent loss this feature exists to prevent.

## Zero engine drift

No engine file is read or written by this feature, so this is proof rather than
a diff to explain. Re-run the B1–B8 harness described in
[`../004-p3-workbench-shell/drift-baseline.md`](../004-p3-workbench-shell/drift-baseline.md)
and compare against the table recorded there.

Every scenario must match exactly. Any movement at all — including an increase —
is a defect in this feature, not a drift to record.

## What is deliberately not verified

`scripts/smoke.mjs` is neither run nor modified. This feature changes nothing a
user sees, and the driver's locators all target UI that 004's T020 deletes, so a
run here would assert against a layout on its way out.
[plan.md](./plan.md) §Constitution Check states the condition that would void
this reading.

## Handing back to 004

Before 004's S2 starts:

1. `.specify/feature.json` points back at `specs/004-p3-workbench-shell`.
2. 004's `sessions/S2.md` and `S3.md` reflect that triage is done and point at
   `triage-record.md`, and no longer instruct S3 to make 78 judgment calls or
   act on the superseded 52 and 79 counts ([research D5](./research.md)).
3. `scripts/run-chain.sh`'s header caution about S3 is updated for the same
   reason.
