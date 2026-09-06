# Handoff: 012 — the suggested strip count is one a venue can supply

**Feature**: `012-actionable-strip-suggestion` · **Status**: Delivered
**Branch**: `012-actionable-strip-suggestion`, worktree flow
**Branched from**: `main` at `670c4da36e` · **Closed**: 2026-09-06

011 made the suggested strip count arithmetically correct and practically
unusable — 011 `handoff.md` §7 finding 2 recorded it. This feature replaces the
busiest-day ceiling with a search for the smallest strip count that places
every event, and removes the ceiling from every user-facing surface.

Every number here is `[M]` measured unless marked `[R]` (read from source) or
`[E]` (estimated by arithmetic). Where a measurement disagreed with a planning
artifact, the measurement won and the disagreement is recorded in §7.

---

## 1. What shipped

**Suggest** now returns the smallest strip count that places every event on
the board, found by scanning upward one strip at a time from the strip-hours
floor to the concurrency ceiling. The floor is the board's aggregate
strip-hour demand divided by the schedulable hours across the tournament's
days; the ceiling is the old busiest-day rule, kept only as the scan's upper
bound and never shown. The scan steps by one rather than bisecting because
`baseline.md` §1a measured scheduling as non-monotonic in strip count on four
of the ten templates — a bisection would read the non-monotone band as
failure and overshoot the true answer.

The post-schedule finding that fires when a board does not fit now names four
levers an organizer can act on — add a day, flight the largest events, cap
entries, add strips — in that order, and reports no strip count of its own.
Strips come last because strips mean renting more of the facility. The
shortfall figures (strip-hours needed, available) still come from the
feasibility warning, unchanged.

A "Searching…" indicator appears next to the **Suggest** button only when a
search outlasts a 100ms reveal delay, so the search on every regional
template — all comfortably under 100ms — never flashes it, and only the
largest NAC template shows it, briefly. The button disables and the strip
field holds its old value until the search finishes.

---

## 2. The ten templates, before and after

`[M]` `baseline.md` §1 (T002, engine path) and §5 (T008, app path). Both
report the same numbers cell for cell — T008's halt condition, which confirms
the search's per-candidate config and the app's own `buildTournamentConfig`
agree on every field.

| Template | Events | Old rule (ceiling) | **New suggestion** | Placed @ new | Placed @ new−1 | Press ms (app path) |
|---|---:|---:|---:|---:|---:|---:|
| NAC Youth | 24 | 197 | **66** | 24 | 22 | 54.69 |
| NAC Cadet/Junior | 24 | 144 | **48** | 24 | 21 | 21.17 |
| NAC Div1/Junior | 24 | 147 | **49** | 24 | 23 | 19.73 |
| NAC Vet/Div1/Junior | 66 | 268 | **85** | 66 | 65 | 228.58 |
| ROC Div1A/Vet | 12 | 23 | **15** | 12 | 0 | 13.56 |
| ROC Div1A/Div2/Vet | 18 | 37 | **16** | 18 | 17 | 13.09 |
| ROC Mega | 42 | 158 | **46** | 42 | 41 | 63.89 |
| RYC Weekend | 18 | 78 | **32** | 18 | 17 | 28.25 |
| RJCC Weekend | 12 | 54 | **24** | 12 | 11 | 18.71 |
| Junior Olympics | 18 | 135 | **49** | 18 | 17 | 21.99 |

**Every template places its full field at the new count and falls short at
one strip less.** SC-001 and SC-002 hold 10/10. On the largest template, the
old rule's 268 is now 3.15× the new search's 85.

A fourth column — the same four templates the live smoke driver (T014)
presses in the running browser, in accumulated session state rather than a
fresh store:

| Template | Driver's suggested count | Rows after Auto-schedule |
|---|---:|---:|
| ROC Div1A/Vet | 15 | 12 |
| NAC Youth | **63** (fresh-store: 66 — §7c) | 24 |
| NAC Vet/Div1/Junior | **80** (fresh-store: 85 — §7b, 12 video strips) | 66 |
| NAC Cadet/Junior | 48 | 24 |

The driver runs at boot's B1 preset video-strip count (12), not the fresh
store's default (null → 8), because nothing before these steps resets that
field. §7 explains both driver disagreements.

---

## 3. The ledger, before and after

`[M]` `baseline.md` §2 (before) and `b5e0600efc`'s commit body (after). The
eight `stripRecommendation` values moved because T011 re-pointed the ledger
field from the old busiest-day rule to the search; **no scheduled count
moved**, all eight scenarios sit on their unchanged floors.

| Scenario | `stripRecommendation` before | after | Reason |
|---|---:|---:|---|
| B1 | 135 | **48** (36%) | 24 events over 4 days, NAC |
| B2 | 189 | **70** (37%) | 24 events over 4 days, NAC; the +6 RESOURCE_EXHAUSTION WARNs at the fixture's own 80 strips are unchanged |
| B3 | 182 | **71** (39%) | 24 events over 4 days, NAC |
| B4 | 190 | **76** (40%) | 30 events over 3 days, SYC — the tightest board; its `scheduledCount` of 17 is at the fixture's 40 strips, 76 is where all 30 would place |
| B5 | 73 | **28** (38%) | 12 events over 3 days, SJCC; smallest board, smallest ceiling, smallest answer |
| B6 | 165 | **60** (36%) | 54 events over 3 days, ROC — many small events, so the concurrency ceiling overstates most |
| B7 | 207 | **64** (31%) | 18 events over 4 days, NAC; largest ceiling of the eight, deepest cut, a few very large events drive peak concurrency |
| B8 | 147 | **69** (47%) | 53 events over 4 days, NAC; shallowest cut, closest of the eight to genuinely needing its peak |

`scheduledCount` unchanged on all eight: B1 24, B2 24, B3 24, B4 17, B5 12,
B6 45, B7 18, B8 52 — every one still exactly on its `SCHEDULED_FLOORS` value.

Ledger wall time: 75ms → 802ms of test time (470ms → 1.19s total), the eight
searches costing about 0.73s, below research.md D7's `[M]` ~2s estimate
(§7f).

---

## 4. One row per commit

| Commit | What it did | Drift it moved |
|---|---|---|
| `9efed59259` T001 | Opened the branch, carried the spec artifacts and backlog change | none — no code |
| `09273f61f9` T002 | Baseline harness at days=4: ceiling, floor, smallest working count on all ten templates | none — measurement only |
| `2cbcdc1eb6` T002a | Monotonicity sweep, floor to ceiling, all ten templates — found scheduling is non-monotonic | none — measurement only |
| `459473b75b` | Recorded the strip-count scheduling anomaly design note; annotated T014's stale 96→85 prediction | none — no code |
| `7b70e6fbf4` T003+T004 | Extracted `aggregateStripHours` (`capacity.ts`) and moved `buildStrips` to `stripBudget.ts` | **none** — driftLedger passed before and after, no snapshot field changed |
| `b439f08128` T005+T006 | Added `src/engine/stripSearch.ts` — the floor/ceiling range, the bounded scan, the synchronous driver | **none** — nothing reads the search yet |
| `73a7578806` T005 review | Replaced a measured literal with a formula recomputed from the same two functions the implementation calls, on B1's floor/ceiling pin | test-quality only |
| `356b52fd64` T007 | `suggestStrips` becomes async, drives the search itself, writes `strips_total` once at the end; tooltip reworded | not a drift task (store-only change) |
| `e6845a3d6e` T007 review | Shared fixture, guarded cleanup in `suggestStrips` tests | test-quality only |
| `77c081a60a` T008 | Re-ran the harness through the app's own path; confirmed cell-for-cell agreement with T002's engine path | none — measurement only |
| `703f454bef` T009+T010 | Post-schedule finding reworded to name four levers, no digit, no strip count | **none** — driftLedger digests ERROR/WARN only, never INFO text |
| `b5e0600efc` T011 | Deleted `recommendStripCount`, closed the `stripBudget.ts`↔`analysis.ts` cycle, re-pointed the ledger's `stripRecommendation` at the search | **`stripRecommendation` ×8, nothing else** (§3) |
| `0d9ee14b0a` T009 review + T012 | Widened a fits-precheck assertion, fixed a stale `recommendStripCount` name in a test comment; recorded the T012 grep record (§5) | test-quality + read-only verification |
| `cc44ff6282` T013 | Added the reveal-delayed searching indicator to `StripSetup.tsx` | not a drift task (component-only) |
| `ab0f3c4921` T013 review | Added the missing unmount-cancellation case | react-code-review only |
| `e2adeed85e` T013 review | Strengthened the unmount test to discriminate the cleanup (`vi.getTimerCount()` assertion) | test-quality only |
| `633d27adb5` T014 | Repaired the smoke driver's async Suggest presses; added the SC-008 step on the largest template | not a drift task (driver-only) |
| `1936d74583` T015 | Full gate run twice on the finished branch | not a drift task (verification-only) |

---

## 5. The T012 grep record

Verbatim from `0d9ee14b0a`:

1. `recommendStripCount` under src/ and __tests__/: one prose comment at
   __tests__/engine/concurrentScheduler.test.ts:985, fixed in this commit.
   Nothing under src/.
2. Importers of `suggestStripCount`: src/engine/stripSearch.ts (the only
   production importer); __tests__/engine/analysis.test.ts (pins the rule);
   __tests__/engine/stripSearch.test.ts and __tests__/store/store.test.ts
   (FR-007 cross-checks that T005 and T007 themselves require). tasks.md
   predicted only the first two; the plan did not anticipate its own tests.
3. Importers of `stripSearch` under src/: src/store/store.ts only.
   src/engine/analysis.ts names it in a docblock, not an import. Nothing
   under src/engine/ imports it — the leaf rule holds.
4. "busiest day" / "ceiling" / "floor" under src/components/: no
   user-visible string. Hits are an integer floor in canvas/windowing.ts:71
   and formatMinutes in workbench/Scorecard.tsx:52. In
   postScheduleDiagnostics the words appear only in the code comment
   explaining why neither number is reported; the message string carries
   none of them and no digit.

---

## 6. Verification record

### T014 — live smoke, run twice

Both runs: **SMOKE PASS**, identical counts, 0 console errors.

| Step | Count read | Rows after Auto-schedule |
|---|---:|---:|
| ROC Div1A/Vet, Suggest | 15 strips | 12 |
| NAC Div1/Junior (SC-008's predecessor step) | — | 24 |
| NAC Youth, Suggest | 63 strips | 24 |
| NAC Vet/Div1/Junior, Suggest (SC-008, new step) | 80 strips (12 video strips) | 66 |
| NAC Cadet/Junior, Suggest | 48 strips | 24 |

The `pressSuggest(stepName)` helper clicks **Suggest**, then polls (60× 50ms,
bounded) until the button re-enables and the strip field differs from its
pre-press value, throwing a named error if it never does. It cannot poll on
the 100ms reveal indicator instead, because a board that finishes inside the
reveal delay never shows it — the indicator is not a usable completion
signal.

### T015 — the full gate, run twice

| | Run 1 (`e2adeed85e`) | Run 2, identical tree |
|---|---|---|
| `tsc -b` | exit 0 | exit 0 |
| `lint` | exit 0 | exit 0 |
| `pnpm test` | 68 files / 1848 tests passed, 0 skipped | 68 files / 1848 tests passed, 0 skipped |
| Wall | 6.40s test / ~11s total | 6.35s test / ~10s total |

`grep` for `it.skip`/`test.skip`/`describe.skip`/`.todo`/`.only` over
`__tests__/` and `src/` returns 0 matches.

### Reviews

`test-quality-reviewer` ran after T003+T004, T005, T007, T009+T010, T013, and
the T013 unmount test; `react-code-reviewer` ran after T013, the only task
touching a React component. Each should-fix produced its own commit:

| Review | Commit | What it found |
|---|---|---|
| T005 | `73a7578806` | A measured literal pin on B1 cannot fail when the two functions it was measured from regress; replaced with a recomputed formula |
| T007 | `e6845a3d6e` | Repeated three-line setup across three tests, and a subscription that could leak past a failing assertion |
| T009+T010 | `0d9ee14b0a` | A fits-precheck assertion too narrow to catch a sibling finding; a stale `recommendStripCount` name in a comment |
| T013 (react-code-reviewer) | `ab0f3c4921` | The unmount case was missing — a stray reveal timer or settling promise could still fire after unmount |
| T013 unmount test | `e2adeed85e` | The unmount case as written could not fail if the cleanup were deleted. Proven: with the cleanup body commented out, the file fails at the new assertion with `expected 1 to be +0`; restored exactly and green again |

---

## 7. Where measurement disagreed with the plan, and why

Seven items, each with its cause named.

**(a) `spec.md` §Context's 76/96/48 versus measured 66/85/46.** The spec's
figures are the *monotone threshold* — the smallest count above which every
count places every event — not the smallest count that places every event at
all. `baseline.md` §1a proved this: on the three disagreeing templates the
spec's number equals the measured threshold to the strip. A bisection or a
sampled scan cannot return a count below the threshold, because every probe
it takes in the non-monotone band reads as failure. Both numbers answer
different questions; the delivered feature reports the smaller one because
FR-001 asks for the smallest count that places every event, not the smallest
count that reliably does so above some point.

**(b) `tasks.md` T014's expected 85 versus the driver's 80.** Proven by a
throwaway probe (`tmp/probe-t014-video.test.ts`, deleted): the app's boot
preset (B1) carries `video_strips_total = 12` into the smoke driver, while
`baseline.md`'s harness resets it to the store's default (`null`, resolving
to 8). The search's per-candidate config depends on video strip count, so 12
video strips and 8 video strips can produce different answers on the same
board. 80 is correct for the driver's actual config.

**(c) NAC Youth: 66 from a fresh store versus 63 in the driver's accumulated
session state, both placing 24 of 24.** Video strip count is ruled out by the
same probe — a fresh store gives 66 at both 8 and 12 video strips. The cause
is **not isolated**. Candidate fields, per `633d27adb5`'s commit: `dayConfigs`
from boot's B1 preset versus `setDays(4)`'s own defaults, the Admin-gap edit
sequence earlier in the driver, tournament type, and the ROC fencer-count
edit. Recorded as an open backlog item (§9's new entry) rather than guessed
at further.

**(d) `tasks.md` T009's prediction that the fitting-board case would be
red.** It predicted the case would trip on "whichever assertion the current
gate trips." Measured green from the start, in `703f454bef`: the gate already
emits nothing on a fitting board today, so the prediction did not hold and
the measurement is recorded rather than forced red.

**(e) `tasks.md` T012's list of `suggestStripCount` importers.** It named only
`stripSearch.ts` and `analysis.test.ts`. The measured grep (§5, item 2) found
two more: `stripSearch.test.ts` and `store.test.ts`, both FR-007 cross-checks
that T005's and T007's own dispatch instructions require. The plan did not
anticipate its own tests importing the function they cross-check against.

**(f) `research.md` D7's ~2s ledger estimate versus ~0.7s measured.** The
eight searches added to the ledger's wall time cost 0.73s (`b5e0600efc`),
under half the estimate.

**(g) The re-plan hook halted a subagent on T015's annotation.** T015's
measured-outcome annotation (both gate runs' numbers, the delta reconciliation)
is exactly the record-keeping case constitution 1.7.0 carves out — it records
what was measured, it does not change what will be built. The subagent that
wrote it was halted before it could commit, leaving the annotation uncommitted
in the working tree for this task to pick up in §Step 1. Recorded so the next
feature's tasks.md annotates measured outcomes in commit messages and
`baseline.md` where possible, and ticks the checkbox as a small, separate
edit.

---

## 8. What this feature did not fix

- **The `DEADLINE_BREACH` shortfall strips cannot buy.** Unchanged since 011 —
  some templates place fewer events than they have on deadline warnings alone,
  with no ERROR, and no rule in this feature or the last touches the cause.
- **Per-event entry caps.** Named as a lever in the post-schedule finding
  (FR-014) but not modelled. `docs/design/backlog.md` §Per-event entry caps
  are not modelled carries the detail.
- **Hand placements are never checked against the crossover constraint
  graph.** Unrelated to strip counts, found during this feature's
  brainstorming, recorded at `docs/design/backlog.md` §Hand-placed events are
  never checked against the crossover constraint graph.
- **The strip-count scheduling anomaly.** On four of the ten templates a
  strip count above the suggestion places fewer events than the suggestion
  does — Graham's multiprocessing timing anomaly, a known property of the
  greedy list scheduler. `docs/design/strip-count-scheduling-anomaly.md` has
  the mechanism, the literature, and four fix options with their costs; none
  is scheduled. This feature's search is safe against it by construction
  (it scans upward and stops at the first working count), but an organizer
  who adds one strip to the suggested count, or edits the field by hand, is
  not protected.
- **The message-text gate in `postScheduleDiagnostics`.** Still keyed on the
  `RESOURCE_INSUFFICIENT` message prefix, because `Bottleneck` carries no rule
  id. The strip-count number this gate used to guard is gone, but the
  coupling itself remains — `docs/design/backlog.md` §The post-schedule strip
  recommendation is gated on message text.
- **The NAC Youth accumulated-state gap (§7c).** 63 in the smoke driver versus
  66 from a fresh store, both placing 24 of 24. Video strip count is ruled
  out; the cause is not isolated further.

---

## 9. Merge instructions

**Worktree flow.** The user owns the merge and the closing commit. Run from
`/Users/noahlz/projects/piste-planner`, the main checkout — never from this
worktree.

Two things in that checkout's working tree block
`git merge --no-ff --no-commit`, verified now rather than assumed:

**The untracked `specs/012-actionable-strip-suggestion/` directory.**

```
diff -rq /Users/noahlz/projects/piste-planner/specs/012-actionable-strip-suggestion \
         /Users/noahlz/projects/piste-planner-012-actionable-strip-suggestion/specs/012-actionable-strip-suggestion
```

Result: only `tasks.md` and `spec.md` differ between the two copies (the main
checkout's are the pre-branch drafts — unticked tasks, `spec.md` still marked
Draft); `baseline.md` and `handoff.md` exist only on the branch. The branch's
copies are newer and are the ones to keep.

**The modified `docs/design/backlog.md`.**

```
diff /Users/noahlz/projects/piste-planner/docs/design/backlog.md \
     /Users/noahlz/projects/piste-planner-012-actionable-strip-suggestion/docs/design/backlog.md | grep -c '^<'
```

Result: **0** — every line in the main checkout's working copy of
`backlog.md` is present in the branch's copy. The branch's version is a
strict superset (the 188-line addition T001 carried over, plus this feature's
close-out edits), so no content in the main checkout's working copy would be
lost.

Steps:

```bash
cd /Users/noahlz/projects/piste-planner
rm -rf specs/012-actionable-strip-suggestion/         # untracked; branch's copies are newer
git checkout -- docs/design/backlog.md                # branch's copy is a strict superset
git merge --no-ff --no-commit 012-actionable-strip-suggestion

# Gate the MERGED tree before the merge commit is written (constitution §The merge is gated):
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
timeout 600 pnpm --silent test > ./tmp/test.log 2>&1
#   expect: 68 files, 1848 tests, 0 skipped

# Complete the pending merge with cost trailers:
#   /commit-with-costs
```

`commit-with-costs` resolves the session id from the path it runs in. This
feature's orchestrator ran from the main checkout in session
`session_01DWCBQmAE72nB94w9fw5gkm` — run the skill from that same checkout so
the trailer resolves correctly.

No squash. The branch's commits are the working record — the drift counts,
the before-and-after numbers, and the review corrections all live in those
messages and nowhere else.

---

## 10. Resume prompt

```
Read docs/design/backlog.md for what is open. Feature 012 shipped: Suggest
now returns the smallest strip count that places every event (66-85 across
the ten templates, down from 197-268), and the post-schedule finding names
four levers instead of a strip count.

Merge 012 per specs/012-actionable-strip-suggestion/handoff.md §9: remove the
untracked specs/012-actionable-strip-suggestion/ directory, checkout
docs/design/backlog.md, git merge --no-ff --no-commit
012-actionable-strip-suggestion, run tsc -b + lint + the full suite on the
merged tree (expect 68 files / 1848 tests), then complete with
commit-with-costs from the main checkout. No squash.

Then read docs/design/backlog.md's open section for what's next — the
strip-count scheduling anomaly, hand placements never checked against the
crossover graph, and per-event entry caps are the largest open items this
feature's brainstorming raised.
```
