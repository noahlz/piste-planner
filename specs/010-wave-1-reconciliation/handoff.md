# Handoff: 010-wave-1-reconciliation

**Branch**: `010-wave-1-reconciliation`, off `main` at `a2dc363e45`. Worktree
flow (constitution Git Ownership table) — subagents committed each checkpoint
to this branch. The user makes the closing commit.

Seven independent corrections against
[`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md)
§Recommended sequence, Wave 1: two restore boards that scheduled nothing (R1,
R2), one makes a silent hard-constraint violation loud (R7), one stops a
cosmetic field from discarding a tournament (R3), and three make the engine
apply the penalty the specification states instead of the one it had been
applying (L1, L9, L3).

## 1. B1–B8, before and after the whole feature

| Scenario | Before | After |
|---|---:|---:|
| B1 | 24 | 24 |
| B2 | 24 | 24 |
| B3 | 24 | 24 |
| B4 | 0 | 0 |
| B5 | 12 | 12 |
| B6 | 44 | **45** |
| B7 | 18 | 18 |
| B8 | 52 | 52 |

Only B6 moved, raised by L9, and its floor was raised to match in the same
step (`c5a589ce13`) so a later regression back to 44 could not pass the gate
silently.

## 2. The ten templates, before and after

From `baseline.md` §3 (before) and its after-R1 table (after — no later item
moved a template count). Two changed.

| Template | Placed @ suggested (before → after) | Placed @ 80/12 (before → after) |
|---|---|---|
| NAC Youth | 0 → 0 | 22 → 22 |
| NAC Cadet/Junior | 0 → 0 | 24 → 24 |
| **NAC Div1/Junior** | 0 → **13/24** | 0 → **24/24** |
| **NAC Vet/Div1/Junior** | 0 → 0 (still `feasibility-strip-hours`) | 0 → **45/66** |
| ROC Div1A/Vet | 12 → 12 | 12 → 12 |
| ROC Div1A/Div2/Vet | 16 → 16 | 18 → 18 |
| ROC Mega | 0 → 0 | 42 → 42 |
| RYC Weekend | 12 → 12 | 18 → 18 |
| RJCC Weekend | 6 → 6 | 12 → 12 |
| Junior Olympics | 0 → 0 | 18 → 18 |

`NAC Div1/Junior` goes from empty to 24/24 clean at 80/12, and reaches 13/24
at its own suggested strip count. `NAC Vet/Div1/Junior` reaches 45/66 at 80/12
but stays at zero at its suggested 45 strips — R1's two `indiv-team-same-day`
errors are gone there, but `feasibility-strip-hours` sits underneath them and
belongs to Wave 3's R5, not this feature.

## 3. One row per item, with the drift it moved

| Item | Commit | Drift |
|---|---|---|
| R1 delete `indiv-team-same-day` | `5a3a1a6826` | nothing moved |
| R7 collect fallback violations | `b0d965aaff` | nothing moved |
| R7 emit them as WARNs | `bfda6b4bdf` | nothing moved |
| R2 scope per-event findings | `01379cd03d` | nothing moved |
| R3 coerce the team cut | `51d834341c` | nothing moved |
| L1 wire `PROXIMITY_3_PLUS_DAYS` | `39911b6940` | day assignments on B1/B2/B3/B7/B8; B5/B6 byte-identical |
| L9 remove the Y8→Y10 penalty | `2bacf2aa8e` | B6 44→45, errors 10→9; also removed the derived Y8↔Y12 edge |
| L3 apply `SOFT_SEPARATION_PAIRS` | `2799e0b49b` | nothing moved — see §4 |

## 4. Two things this feature learned that outlive it

**B1–B8 never enter the DSatur least-bad-color fallback.** Proved two
independent ways: reconstruction from the returned day map (no hard-edge
violation, no relaxation, no Veteran Co-Day break on any of the eight, in
either phase) and V8 statement coverage, which showed 0 executions of the
whole no-valid-color block across 896 vertex colourings on the ledger. The
defect R7 exists to report was structurally invisible to the drift ledger —
the ledger could stay green forever while that block silently broke a hard
edge, because it never ran at all. R7's own verification had to come from the
templates instead (`NAC Cadet/Junior`, 6 least-bad violations at 3 days —
`baseline.md` §2).

**L3's green ledger is not evidence L3 is correct.** `SOFT_SEPARATION_PAIRS`
carries three pairs. DIV1 appears in B1/B2/B7/B8 and DIV2/DIV3 in B3/B6, and
those two sets never intersect, so DIV1↔DIV2 and DIV1↔DIV3 have **zero
occurrences** across all eight scenarios — unit-tested only, never exercised
by the ledger. The third pair, DIV1↔CADET, occurs 18 times (12 in B2, 6 in
B7) and all 18 were already on different days at the old weight of 0.8, so
raising it to 5.0 only made an already-rejected placement more expensive. A
byte-identical snapshot after a 6x weight change is the expected result of
this specific structure, not proof the lookup fired correctly — that proof is
in the per-pair probe `2799e0b49b`'s commit message carries, not in the
ledger.

**The honest blemish.** L1 raised B1's peak referee demand: total 194 → 202,
peak sabre 64 → 76. No event was lost, so it did not breach the gate, but the
same tournament now wants more referees to run it — a real operational cost
of applying a rule the engine had been silently ignoring, accepted per FR-015
rather than tuned away. And B3 moved 17 events to different days for no
measurable proximity gain: its constraint structure cannot bring either
gap-3+ pair within 2 days, so the new penalty term just flips DSatur's argmin
among near-tied colours — a lateral reshuffle, not an improvement.

## 5. The verification record

Gate run **twice on the finished branch**, identical both times: `tsc -b`
clean, `lint` clean, **1821 tests passed / 67 files**. Baseline was 67 files /
1799 tests; the +22 closes exactly as 24 tests added minus 2 deleted (the two
`indiv-team-same-day` tests R1 removed with the rule), with no test skipped
and no assertion weakened.

Live smoke: **SMOKE PASS, 0 console errors**. The driver's new
`NAC Div1/Junior` step measures **24/24** in the running app at 80 strips /
12 video, matching the engine measurement in §2 exactly. The existing boot and
`ROC Div1A/Vet` steps still pass.

## 6. The merge

Land with:

```
git merge --no-ff --no-commit 010-wave-1-reconciliation
```

then run `tsc -b`, `lint`, and the full suite **on the merged tree** before
completing the pending merge with `commit-with-costs` (constitution §Git
Ownership — the merge is gated, not just the branch).

`git diff main...HEAD --stat` shows 28 files touched. One conflict is certain,
the rest auto-merge:

- **`docs/design/backlog.md` — certain conflict, keep this branch's side.**
  This branch added three closed sections (Wave 1 of the methodology
  reconciliation, plus whatever T024 appended) on top of content that arrived
  at `516ecb797a` (T001) carrying `main`'s own uncommitted edits at the time
  this branch was cut. `main` has not been touched since, so there is nothing
  on `main`'s side to reconcile against beyond that starting point — the
  merge will show a conflict only if something else has landed on `main` in
  the meantime. If so, keep this branch's Wave 1 closure and re-apply any
  intervening `main` edits by hand; do not let either side's prose silently
  drop.
- **The `516ecb797a` carry-forward — not a conflict, but the user should know
  it lands.** That commit brought three files onto this branch that were
  **uncommitted on `main`** when the branch was cut: `docs/design/
  methodology-reconciliation.md` (untracked on `main`), and edits to
  `backlog.md` and `methodology-reconciliation-prompt.md`. Merging this
  branch is what commits those to `main` for the first time. If the user
  independently committed or changed those files on `main` since, expect a
  conflict there too, resolved the same way as above.
- **Everything else in the diff is source and test files this feature alone
  touched** (`src/engine/*`, `src/store/buildConfig.ts`,
  `__tests__/engine/*`, `scripts/smoke.mjs`, plus this feature's own `specs/`
  tree) — `main` has no competing edits to any of them, so these auto-merge
  clean.

## 7. What is left open

`docs/design/backlog.md` §Wave 1 of the methodology reconciliation carries
the full record of what this feature deliberately did not fix — point there
rather than restating it here. Headline: **Part 3 (the eight time-of-day
penalty weights) is still undecided**, and the product owner directed on
2026-09-05 that **the next session plans the audit's R5** — demoting
`feasibility-strip-hours` from a blocking ERROR to a WARN. That is why four
templates (`NAC Youth`, `NAC Cadet/Junior`, `ROC Mega`, `Junior Olympics`)
and `NAC Vet/Div1/Junior` still place zero at the app-suggested strip count.
The audit's **L5** — `suggestStrips` recommending one strip per pool of the
largest event while ignoring every other event on the day — is the cause
underneath that symptom, not R5 itself.

## 8. Resume prompt

```
Branch 010-wave-1-reconciliation is complete: 1821/67 passing (was 1799/67
on main), tsc clean, lint clean, live smoke SMOKE PASS with NAC Div1/Junior
measured at 24/24. Full record in
specs/010-wave-1-reconciliation/handoff.md.

Land it:

  git merge --no-ff --no-commit 010-wave-1-reconciliation

Predicted conflict: docs/design/backlog.md — keep this branch's Wave 1
closure section. The merge also commits three files this branch carried from
main's uncommitted state at the time it was cut: docs/design/
methodology-reconciliation.md (new), and edits to backlog.md and
methodology-reconciliation-prompt.md. Run tsc -b / lint / the full suite on
the merged tree before completing the pending merge with commit-with-costs
(constitution's merge gate) — do not squash.

Next session: plan the audit's R5 (docs/design/methodology-reconciliation.md
§1.3, line 328) — demote feasibility-strip-hours from a blocking ERROR to a
WARN — together with L5 (same document §2.1, line 353): suggestStrips
recommends one strip per pool of the largest event and ignores every other
event on the day, which is why NAC Youth, NAC Cadet/Junior, ROC Mega, Junior
Olympics and NAC Vet/Div1/Junior still place zero at their app-suggested
strip counts (specs/010-wave-1-reconciliation/baseline.md §3 has the measured
numbers per template). L5 changes strip counts on every scenario, not just
the ones that empty today, so it needs its own drift review against B1–B8
and probably its own feature rather than riding in on R5's.
```
