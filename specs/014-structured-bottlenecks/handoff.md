# 014 Structured bottlenecks – handoff

**Status: delivered 2026-10-04** on branch `014-structured-bottlenecks`
(worktree `.claude/worktrees/014-structured-bottlenecks`), awaiting the user's
`merge-with-costs`. Plan: [`plan.md`](./plan.md).

## What changed

In product terms: nothing a user can see. Every warning the engine raises now
carries a fixed label for the check that fired and the list of events it names.
The code that used to work those out by reading the warning's wording now reads
the label and the list. Rewording a message can no longer silently drop the "add
a day, flight events, cap entries, add strips" advice, which is what the old
`RESOURCE_INSUFFICIENT` prefix check risked.

In code terms (plan D1–D4):

- `Bottleneck` (`src/engine/types.ts`) gains required `rule: string` and
  `subjects: string[]`. `competition_id` stays as the owner and rollback key,
  and the invariant is that `competition_id` is `''` or in `subjects`.
- `BottleneckRule` is an `as const` catalogue of 27 engine ids beside
  `BottleneckCause`. All 29 producer sites in `concurrentScheduler.ts`,
  `analysis.ts` and `flighting.ts` fill both fields. A bottleneck copied from a
  `validateConfig` finding carries that finding's `rule` and `subjects`.
- `ValidationError.rule` and `.subjects` are required.
  `validateSameDayCompletion` gained `same-day-completion` / `[id]`.
- `FeasibilityRule` (`validation.ts`) is the single home of the two
  feasibility ids, used by `feasibilityErr` and by `postScheduleDiagnostics`,
  which now decides by rule.
- The crossover tests, the pinned-scheduling crossover and PINNED_UNCLAIMED
  checks, the B4 drift-ledger pin, `analysis` pass 5, the FR-009 exclusion
  summary and `derived.test.ts`'s day-pools warning find their bottleneck by
  `rule` and `subjects`, not by message text.
- New tests: an invariant oracle over B1–B8 (`bottleneckSubjects.test.ts`,
  with `__tests__/helpers/bottleneckInvariants.ts`). It checks shape, owner in
  subjects, subjects against message, a `Record<BottleneckRule,
  BottleneckCause>` rule↔cause table and catalogue membership. Also focused
  rule/subjects pins with sort-visible fixtures (each checked by a throwaway
  `.sort()` mutation), the rollback-keyed-on-owner cases and a `makeBottleneck`
  factory.

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 77 files / 1794 tests, all pass (from 76 / 1764) | orchestrator, tip before handoff commit |
| `tsc -b`, lint | exit 0, exit 0 | same |
| Drift ledger snapshot SHA-256 | `5483c40c1349944b6ac26659406b39bb84fef9091c2e259c7f0e36920520d0b6`, byte-identical to `main` | every task, re-measured by orchestrator |
| B1–B8 scheduled | 24 / 24 / 24 / 17 / 12 / 45 / 18 / 52, unchanged | ledger floors |
| Live smoke | **SMOKE PASS** ×2, 0 console errors, dev server from the worktree on `:5186` | `src/` at its final state (`226389ed54`) |
| Boot, B1 | 24 schedule rows, footer `19 placed · 5 unplaced · 0 pinned` | smoke, both runs |
| Suggest: ROC Div1A/Vet, NAC Youth, NAC Vet/Div1/Junior, NAC Cadet/Junior | 15 / 66 / 80 / 48, identical to 013 | smoke, both runs |
| Oracle reach | 15 of 27 engine rules plus 3 validation rules across B1–B8 | Task 1 report |

Smoke command: `SMOKE_BASE=http://localhost:5186/piste-planner/ timeout 240 node scripts/smoke.mjs`,
after `pnpm dev --port 5186 --strictPort`. No locator change.

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `83168c7f2a` (main) | 1764 | – | baseline |
| `a853043491` T1 | 1786 | +22 | oracle 16, matcher 3, validation-derived 1, same-day-completion 1, rollback 1 |
| `b621fcb316` T1 fix | 1787 | +1 | per-event validation-derived case, plus flighting/analysis pins added to existing cases |
| `6ab54222c6` T1 fix 2 | 1787 | 0 | fixtures reordered so a dropped `sort()` fails |
| `226389ed54` T2 | 1790 | +3 | `postScheduleDiagnostics` by rule (2 feasibility ids + 1 negative) |
| `f4b79e4162` T2 | 1790 | 0 | pinned/analysis/flighting tests moved to rule/subjects |
| `877d1b126a` T2 fix | 1793 | +3 | rollback converse, two `postScheduleDiagnostics` negatives (table rows) |
| `7b32e88702` T2 fix 2 | 1793 | 0 | tie case sort-visible, oracle header, guard |
| `7113f4aeb9` final fix | 1794 | +1 | oracle on a real `same-population` copy |

No test was deleted without a successor. Removed or changed assertions are
named in each commit message. One correction: `7b32e88702`'s message cites the
`pin2Warns` loop as `pinnedScheduling.test.ts ~:628`. The loop is at
`:238-243`, with the covering `subjects` assertion at `:240`.

## Reviews

Each task had a spec + quality review and scoped re-reviews (Task 1: two fix
rounds, Task 2: two fix rounds). A test-quality review covered every 014 test
edit (constitution II), a React review covered the one-line `Canvas.tsx` edit,
and an Opus whole-branch review gave "with fixes". Its one fix wave
(`7113f4aeb9`) was re-reviewed, and its two doc findings are fixed in the
handoff commit.

## Decisions made on the owner's behalf

Each with what it costs if wrong.

1. `rule` and `subjects` are required, not optional. Cost: none found, since
   nothing outside the engine builds these objects.
2. `rule` is `string`, not a union, because validation rule ids are open-ended.
   Cost: a producer could use a literal, and the rule↔cause table catches only
   cross-cause mistakes.
3. A validation-derived bottleneck keeps `cause: RESOURCE_EXHAUSTION` and
   `competition_id: ''`, so the ledger holds. Its rule and subjects carry the
   identity. Cost: a per-event validation finding still has no owner.
4. `subjects` means the competitions the message names, so a sequencing delay
   lists only its owner. Cost: the predecessor is not structured (see below).
5. The oracle checks rule against cause instead of pinning which producers
   B1–B8 reach, so engine changes do not churn it. Cost: a swap between two
   rules that share a cause (the three day summaries, first/last day longer)
   goes uncaught on producers without a focused pin.
6. The oracle's subjects→message direction applies to engine rules only,
   because `same-population` and `flighting-group-strips` list ids their
   message does not name.
7. Wording checks that pin what a message says (PINNED_UNCLAIMED naming its
   phase, `/crossover/i`) were kept. Only checks that used text to *identify* a
   finding moved.
8. Scheduler-side shared `subjects` arrays are not copied, since nothing
   mutates them.

## Left unfixed

Recorded in `docs/design/backlog.md` §What 014 deliberately left unfixed:

- **Day-level findings have no structured day.** Per-day venue warnings share
  rule and subjects. The Findings row id keeps its ordinal, and those rows
  show `day: null`. The future identity key must combine `rule`,
  `competition_id`, `subjects` and `day`, because `multiple-flighted-same-day`
  emits N warnings per day that differ only by owner.
- **Two-subject findings show on one canvas block**, their owner's.
- **Sequencing delays name no predecessor.**
- **The ledger's day-summary check** still parses day and peak from
  `Day N refs: peak demand M.`, because the peak has no structured home.
- **Dead code:** `validateFlightingGroup` and `validateSameDayCompletion` have
  no caller in `src/` (feature 021).

Noticed by the final review and not 014's to fix (no backlog entry yet):

- A per-event ERROR such as `fencer-count-bounds` still produces the "More
  work than the venue holds" levers note through the unchanged ERROR branch of
  `postScheduleDiagnostics`. Scheduler bottlenecks do not reach the UI today.
- `initialAnalysis` messages mix `Day ${day + 1}` (pass 0) with a 0-based
  `day ${day}` (passes 3 and 4).
- Five producers are not exercised by the oracle and have no focused pin, so
  `tsc` proves their fields exist and nothing proves their content:
  `day-assignment-relaxed`, `cross-event-dependency-delay`,
  `phase-overruns-day-end`, `flight-b-delayed`,
  `day-video-demand-exceeds-video-strips`.
- The validation-error branch of `findingsForBlock` (`Canvas.tsx`) has no
  component test, as before 014.
- The dated alignment doc (`workbench-design-alignment-2026-09-07.md:165`)
  still names the removed backlog entry. It is a historical record.

Parked from the last re-review (no second fix wave), each a test-side
one-liner:

- The FR-009 exclusion-summary test (`concurrentScheduler.test.ts:803-806`)
  now finds the summary by rule, so it no longer pins its WARN severity,
  VALIDATION phase and RESOURCE_EXHAUSTION cause. Fix: one `toMatchObject`.
- The `same-population` oracle case (`bottleneckSubjects.test.ts:112-120`)
  does not assert that `derived.subjects` is non-empty. A dropped copy would
  make it pass vacuously. The `fencer-count-bounds` case pins the copy today.
- `checkInvariants`' docblock (`bottleneckInvariants.ts:59-63`) still says
  "subjects ↔ message" without the engine-rules-only scope, and no case
  exercises `flighting-group-strips` through the oracle.

## Merge

The user merges `014-structured-bottlenecks` into `main` with
`merge-with-costs`, from the main checkout
`/Users/noahlz/projects/piste-planner`. Never squash, and never merge by hand
followed by `commit-with-costs`.

What was checked:

- `main` and `origin/main` are `83168c7f2a`, an ancestor of the branch, so
  the merge is a fast-forward and the merged tree is the branch's own tree.
- At `7113f4aeb9` with the handoff's docs edits in the working tree: `tsc -b`
  and lint exit 0, 77 files / 1794 tests pass, and the ledger snapshot SHA is
  unchanged. The handoff commit touches only `docs/` and `specs/`, so these
  results hold for the tip.
- `package.json` and `pnpm-lock.yaml` are untouched by the branch.
- Nothing in the main checkout blocks the merge. It was clean when this
  worktree was cut, and no agent wrote to it.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 014 (structured bottlenecks) is delivered and merged
into main, and its record is specs/014-structured-bottlenecks/handoff.md.

Next is roadmap feature 015, the ledger converges with the store:
docs/design/competition-planner-workbench.md §Roadmap row 015, and
docs/design/backlog.md §"The drift ledger's factory does not apply the store's
per-type resolutions". It is a deliberate re-baseline: isolate B4's 18-vs-17
first, then make the drift factory apply the per-type cut, DE-mode and
ref-policy rules, so every later engine fix is measured against what the app
runs. 023 (team events go straight to DE) waits on 015 and on the owner's
METHODOLOGY.md amendment.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch. Plan 015 yourself: no Spec Kit, choose the planning approach, and keep
the constitution's guardrails (drift ledger, test-first, live smoke, git
ownership).
```
