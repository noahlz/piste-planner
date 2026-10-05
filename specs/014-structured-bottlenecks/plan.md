# 014 Structured bottlenecks – plan

> **For agentic workers:** execute with superpowers:subagent-driven-development.
> The orchestrator writes no code, and each task below is one subagent dispatch.

**Goal:** `Bottleneck` carries a stable rule id and the competitions it names,
every producer fills both, and nothing in `src/` or the tests reads message
text to learn which rule fired or which events it is about.

**Why:** [`backlog.md` §`Bottleneck` has no structured field for a second
subject](../../docs/design/backlog.md#bottleneck-has-no-structured-field-for-a-second-subject).
Two readers depend on message text today:
`postScheduleDiagnostics` (`concurrentScheduler.ts:1603-1607`) spots the
demoted feasibility finding by `message.startsWith('RESOURCE_INSUFFICIENT')`,
and the crossover test (`concurrentScheduler.test.ts:636-649`) finds a
violated pair by `message.includes(a) && message.includes(b)`. The survey for
this plan found a third, the B4 pin in `driftLedger.test.ts:250-257`, which
reads `validateConfig` directly because the scheduler drops the rule id.

**Roadmap:** [`competition-planner-workbench.md` §Roadmap row
014](../../docs/design/competition-planner-workbench.md). 016 depends on it,
because hand-placement crossover findings will need two subjects.

**Branch / worktree:** `014-structured-bottlenecks`, at
`.claude/worktrees/014-structured-bottlenecks`, cut from `main` at
`83168c7f2a`.

## Baseline (measured 2026-10-04 in this worktree)

- 76 files / 1764 tests, all passing.
- Drift ledger snapshot SHA-256 `5483c40c1349944b…` (matches 013's handoff).
- B1–B8 scheduled 24 / 24 / 24 / 17 / 12 / 45 / 18 / 52.

## Expected outcome

- **Zero drift.** The ledger digest tallies WARNs by `cause` and never reads
  bottleneck objects whole, so new fields leave the snapshot byte-identical.
  No `cause` value changes. Any snapshot movement halts the task.
- **No user-visible change.** The Findings panel, canvas tooltips and print
  read `message`, `cause`, `competition_id` and `phase`, and none of them
  changes. The live smoke runs once at the end to confirm that the board
  boots to the same counts.

## Decisions

**D1 – Shape.** `Bottleneck` gains two **required** fields. Required, so `tsc`
proves that every producer fills them:

- `rule: string` is a stable kebab-case id for the condition that fired.
- `subjects: string[]` lists the sorted, de-duplicated ids of every
  competition the finding names. A finding copied from `validateConfig` keeps
  its `subjects` unchanged, which is `[field]` for a global rule, the same
  contract as `ValidationError.subjects`. A finding that names no competition
  has `[]`.

`competition_id` stays. It is the finding's *owner*: rollback
(`releaseEventAllocations`, `resources.ts:126`), the canvas, the Findings
target and the ASCII renderer all key on it. Invariant: `competition_id` is
`''` or appears in `subjects`.

**D2 – Engine rule ids are an `as const` catalogue.** `BottleneckRule` sits in
`types.ts` beside `BottleneckCause`, with a derived union (constitution V).
Producers reference the constants and never write string literals. One id
covers one *condition*: two sites that report the same condition share an
id, and two conditions that happen to share a `cause` get separate ids.

**D3 – Validation-derived bottlenecks carry the finding's own rule and
subjects.** The push at `concurrentScheduler.ts:214-223` copies `ve.rule` and
`ve.subjects`. Its `cause` stays `RESOURCE_EXHAUSTION`, so the ledger holds.
To make that copy total, `ValidationError.rule` and `.subjects` become
required. The one producer without them is `validateSameDayCompletion`
(`validation.ts:74-92`). It is exported and tested but never called from
`src/`, and it gains rule `same-day-completion` and subjects `[competition.id]`.
The "Optional until T017/T021" comment goes. `kind` stays optional.

**D4 – Feasibility rule ids get one home.** `validation.ts` exports its two
feasibility rule ids as an `as const` object. `feasibilityErr` and
`postScheduleDiagnostics` both import them, so the producer and the consumer
cannot drift apart.

**D5 – Out of scope, recorded in the backlog by Task 3:**

- *Day-level identity.* Per-day venue findings, such as `analysis.ts` passes 0
  and 4 and the three `DAY_RESOURCE_SUMMARY` lines, differ only by day, which
  lives only in the message text. `rule` + `subjects` therefore cannot
  identify them. The Findings panel's bottleneck row id keeps its
  `cause:competition_id:ordinal` scheme, and these rows show `day: null`. A
  structured `day` field is the fix, and it changes dismissal identity, so it
  needs its own decision.
- *Showing a two-subject finding on both events' blocks.*
  `findingsForBlock` (`Canvas.tsx:152-172`) matches on `competition_id`.
  Matching on `subjects` would be a user-visible change.
- *The ledger's day-summary check.* It parses the day and the peak value out of
  `Day N refs: peak demand M.` (`driftLedger.test.ts:290-308`), because the
  peak value has no structured home. It may filter by rule first, but the
  numbers stay in the text.
- *Labels in place of ids in Findings messages.* `subjects` now lists every id
  a message names, which gives option (B) of §Findings messages name events by
  catalogue id a structured source.
- *Sequencing delays naming their predecessor.* A `SEQUENCING_CONSTRAINT`
  delay is caused by another event that its message does not name, so under
  D1 its subjects list only its owner.

## Rule-id catalogue

Engine-native ids (D2). The implementer may rename an id for clarity before
the first commit, and must not merge or split conditions.

| Site | Cause | `rule` | `subjects` |
|---|---|---|---|
| `concurrentScheduler.ts:215` | RESOURCE_EXHAUSTION | the finding's own (D3) | the finding's own (D3) |
| `:264` | RESOURCE_EXHAUSTION | `per-event-exclusion-summary` | `[]` |
| `:316` | CONSTRAINT_RELAXED | `day-assignment-relaxed` | `[owner]` |
| `:332` | UNAVOIDABLE_CROSSOVER_CONFLICT | `hard-separation-violated` | `[id, targetId]` sorted |
| `:793` | PINNED_UNCLAIMED | `pinned-phase-unclaimed` | `[owner]` |
| `:874` | SEQUENCING_CONSTRAINT | `cross-event-dependency-delay` | `[owner]` |
| `:926` | NO_WINDOW_DIAGNOSTIC | `phase-deferred` | `[owner]` |
| `:943` | STRIP_CONTENTION | `strip-contention-deferral` | `[owner]` |
| `:986` | DEADLINE_BREACH | `first-attempt-failed` | `[owner]` |
| `:1002` | DEADLINE_BREACH_UNRESOLVABLE | `event-unscheduled` | `[owner]` |
| `:1147` | SAME_DAY_VIOLATION | `phase-overruns-day-end` | `[owner]` |
| `:1164` | VIDEO_STRIP_CONTENTION | `video-phase-delayed` | `[owner]` |
| `:1268` | FLIGHT_B_DELAYED | `flight-b-delayed` | `[owner]` |
| `:1549` | SCHEDULE_ACCEPTED_WITH_WARNINGS | `first-day-longer-than-middle` | `[]` |
| `:1560` | SCHEDULE_ACCEPTED_WITH_WARNINGS | `last-day-longer-than-middle` | `[]` |
| `:1622` | RESOURCE_RECOMMENDATION | `resource-levers` | `[]` |
| `:1676` | DAY_RESOURCE_SUMMARY | `day-strip-hours-summary` | `[]` |
| `:1697` | DAY_RESOURCE_SUMMARY | `day-ref-peak-summary` | `[]` |
| `:1715` | DAY_RESOURCE_SUMMARY | `day-video-de-ref-summary` | `[]` |
| `analysis.ts:122` | STRIP_CONTENTION | `day-pools-exceed-strips` | `[]` |
| `analysis.ts:143` | STRIP_DEFICIT_NO_FLIGHTING | `pools-exceed-strip-cap-unflighted` | `[owner]` |
| `analysis.ts:187` | MULTIPLE_FLIGHTED_SAME_DAY | `multiple-flighted-same-day` | every flighted event that day |
| `analysis.ts:212` | VIDEO_STRIP_CONTENTION | `day-video-demand-exceeds-video-strips` | `[]` |
| `analysis.ts:234` | VIDEO_STRIP_CONTENTION | `flighting-group-both-video` | `[priority, flighted]` sorted |
| `analysis.ts:250` | CUT_SUMMARY | `cut-summary` | `[owner]` |
| `flighting.ts:51` | FLIGHTING_GROUP_MANUAL_NEEDED | `flighting-priority-tie` | `[c1, c2]` sorted |
| `flighting.ts:144` | MULTIPLE_FLIGHTED_SAME_DAY | `multiple-flighted-same-day` (same condition as `analysis.ts:187`) | every flighted event that day |
| `flighting.ts:166` | FLIGHTING_GROUP_NOT_LARGEST | `flighted-not-largest` | `[flighted, largest]` sorted |
| `flighting.ts:181` | SAME_DAY_DEMOGRAPHIC_CONFLICT | `flighting-group-crossover-penalty` | `[priority, flighted]` sorted |

`[owner]` means `[competition_id]`. Line numbers are as of `83168c7f2a`.

## Review focus

The failure modes most likely to bite, and the task whose tests pin each:

1. A reworded feasibility message still produces the "levers" finding, and a
   WARN from any other rule never does, even one whose message starts with
   `RESOURCE_INSUFFICIENT`. **Task 2.**
2. A two-subject finding loses a subject. For example, `flighted-not-largest`
   loses `largest` when the flighted event is itself the largest (it does not
   fire then, but the guard must not emit `undefined`). **Task 1** (the
   invariant oracle rejects non-string subjects).
3. Rollback of event B removes a finding owned by A that merely names B. It
   must not: rollback stays keyed on `competition_id`. **Task 1** (a
   `releaseEventAllocations` case).
4. The id oracle matches one catalogue id inside a longer one. **Task 1**
   (match ids on token boundaries, with a case where one id is a prefix of
   another).
5. The digest picks up `rule` or `subjects` and the snapshot moves. **Every
   task** (ledger SHA re-measured).

## Global constraints

- Constitution: test-first, the drift ledger after every engine change,
  bounded loops, erasable TypeScript, live smoke, git ownership.
- Subagents commit only inside this worktree, at the commit points marked
  below. Never push, merge, rebase or reset.
- Halt conditions: any ledger snapshot movement, any scheduled count below its
  floor, any test-count drop not named in the commit message.
- Commands are the project CLAUDE.md's, with logs in `./tmp/`.

---

## Task 1 – The type, the catalogue, every producer

**Model:** Sonnet, high effort. The decisions are made above, and the work is
carrying them through about 30 sites.

**Files:** `src/engine/types.ts`, `src/engine/validation.ts`,
`src/engine/concurrentScheduler.ts`, `src/engine/analysis.ts`,
`src/engine/flighting.ts`. Tests: a new
`__tests__/engine/bottleneckSubjects.test.ts`,
`__tests__/engine/validation.test.ts`, `__tests__/engine/resources.test.ts`,
and every test file that builds a `Bottleneck` literal (`resources`,
`derive`, `asciiLaneRenderer`, `Canvas`, `findings` and others that `tsc`
names). A `makeBottleneck` factory in `__tests__/helpers/factories.ts` is
preferred over hand-editing many literals.

**Produces:** `Bottleneck.rule: string`, `Bottleneck.subjects: string[]`,
`BottleneckRule` (`as const` object and union), required
`ValidationError.rule` and `.subjects`, and the exported feasibility rule-id
object from `validation.ts` (D4).

Steps:

- [ ] **Failing tests first.** Write the invariant oracle, run over
  `scheduleAll` for B1–B8 plus `initialAnalysis` on the same scenarios: every
  bottleneck has a non-empty kebab-case `rule`, and its `subjects` are sorted,
  unique strings. `competition_id` is `''` or in `subjects`. Every catalogue
  id named in `message` is in `subjects`, matched on token boundaries, and
  every subject that is a catalogue id appears in `message`. Each `rule` is a
  `BottleneckRule` value or a `validateConfig` rule id. Add focused cases:
  the crossover pair's subjects (B-scenario or template from the existing
  crossover test), a validation-derived bottleneck carrying its finding's
  rule and subjects, `validateSameDayCompletion` carrying
  `same-day-completion` / `[id]`, a rollback case where B's rollback leaves
  A's two-subject finding in place, and an id-prefix case for the oracle's
  matcher. Run them and confirm that they fail because the fields are
  missing, not on a typo. If a validation-derived message does not name one of
  its own subjects, report it and leave the message alone, because messages do
  not change in 014.
- [ ] **Implement D1–D4** and fill every row of the catalogue. Keep every
  `cause`, `severity`, `message` and `competition_id` unchanged.
- [ ] **Run** the suite, `tsc -b`, lint, and the ledger. Re-measure the
  snapshot SHA, which must equal the baseline. Fix any test literal that `tsc`
  flags, and name in the commit message every existing assertion that changed.
- [ ] **Commit** in the worktree: the test count before and after, the ledger
  SHA, "zero drift".

## Task 2 – Move the readers off message text

**Model:** Sonnet, high effort.

**Files:** `src/engine/concurrentScheduler.ts` (`postScheduleDiagnostics`
and the comment above it), `__tests__/engine/concurrentScheduler.test.ts`
(the crossover pair test at `:636-649` and its comment),
`__tests__/engine/driftLedger.test.ts` (the B4 pin's comment and assertions,
not the digest and not the snapshot), and the comment in
`src/store/derived.ts:483-488`, which still says `Bottleneck` carries no id.

**Consumes:** Task 1's fields and the feasibility rule-id object.

Steps:

- [ ] **Failing tests first.** `postScheduleDiagnostics` returns the levers
  finding for a `RESOURCE_EXHAUSTION` WARN whose rule is either feasibility id
  and whose message does *not* start with `RESOURCE_INSUFFICIENT`. It returns
  nothing for a `RESOURCE_EXHAUSTION` WARN with another rule whose message
  *does* start with it. The ERROR path is unchanged. Confirm that the first
  case fails on today's prefix check.
- [ ] **Move the readers.** `postScheduleDiagnostics` decides by rule. The
  crossover test asserts each pair by `subjects` deep-equal to the sorted
  pair, with no message read. The B4 pin also asserts that the scheduler's
  *own* bottlenecks carry one `feasibility-strip-hours` WARN, which the old
  comment said was impossible, and keeps the `validateConfig` read. Rewrite
  the four stale comments to say what is true now. The derived.ts comment
  keeps its ordinal rationale and points to the D5 day-identity entry.
- [ ] **Run** the suite, `tsc -b`, lint, and the ledger SHA. Then grep `src/`
  and `__tests__/` for `.message.startsWith`, `.message.includes` and
  `message).toContain` on bottlenecks. Every match left must be a test about
  the wording itself, or the ledger's day-summary parse (D5). List them in the
  commit message.
- [ ] **Commit** in the worktree.

**Reviews after Task 2:** one combined spec + code-quality review of Tasks 1–2
(the change is small, at most 6 source files), then `test-quality-reviewer`
over both tasks' test edits, including every modified assertion. Bundle all
findings into one fix dispatch, then re-run the checks.

## Task 3 – Record and verify

**Model:** the orchestrator does the docs edits (no code). Smoke locator
repair, if any, goes to a Sonnet subagent.

- [ ] **Backlog:** delete the closed entry and its bullet in §What 013
  deliberately left unfixed. Add one entry for D5's day-level identity gap and
  the Canvas two-subject attach. Append a line to §Findings messages name
  events by catalogue id saying `subjects` now enumerates the ids. Roadmap row
  014: delivered, with the measured counts. Update the baseline line.
- [ ] **Live smoke** against a dev server started from this worktree on port
  5186 (`live-smoke` skill). Expect 24 schedule rows on boot, the same footer
  counts as 013's handoff, and 0 console errors.
- [ ] **Merged-tree check** (memory: agent verifies the merge tree):
  `git merge-tree --write-tree main 014-structured-bottlenecks`. If it equals
  the branch tree, say so. Otherwise run `tsc -b`, lint and the full suite on a
  detached throwaway worktree.
- [ ] **Handoff:** `specs/014-structured-bottlenecks/handoff.md` with what
  changed, the measurements (tests, ledger SHA, smoke counts), the D5 items,
  the merge instructions (`merge-with-costs`, never squash) and the resume
  prompt for 015. Commit in the worktree. The user makes the merge.
