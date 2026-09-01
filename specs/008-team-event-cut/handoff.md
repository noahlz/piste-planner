# Handoff: 008-team-event-cut

**Branch**: `008-team-event-cut`, off `main` at `e56a491acb`. Worktree flow
(constitution Git Ownership table) — subagents committed each checkpoint to
this branch. The user makes the closing commit.

The defect: `defaultConfigForId` (`src/store/store.ts:219`) derived a
competition's cut from `DEFAULT_CUT_BY_CATEGORY` with no `event_type ===
TEAM` branch, so a team event reached the engine carrying a percentage cut,
tripped the `cut-on-team` BINDING error, and one BINDING error discarded the
entire tournament's schedule. The fix is `defaultCutForEntry`
(`src/store/competitionDefaults.ts`), called from `defaultConfigForId`.

## 1. Before and after, all eight reference tournaments

| Scenario | Selected | Before placed | After placed | Ledger |
|---|---:|---:|---:|---:|
| B1 | 24 | 24 | 24 | 24 |
| B2 | 24 | **0** | **24** | 24 |
| B3 | 24 | 24 | 24 | 24 |
| B4 | 30 | 16 | 16 | 0 |
| B5 | 12 | 12 | 12 | 12 |
| B6 | 54 | 43 | 43 | 44 |
| B7 | 18 | 18 | 18 | 18 |
| B8 | 53 | **0** | **53** | 52 |

B2 and B8 both now place their full selected count. B4 and B6 are 006's
pre-existing FR-004a exceptions, unmoved and out of scope. B8 keeps an
exception for its +1 over the ledger — the gap closes only on the
conjunction of the ledger's `de_mode` and `strips_allocated` defaults
together (`b8-residual.md`), and `appPathParity.test.ts`'s `closedBy`
assertion for B8 names `004 US4`, not this feature.

## 2. Before and after, all ten templates

Measured with `baseline.md`'s exact sequence from a freshly reset store.

| Template | Selected | Strips | Before | After | Team? |
|---|---:|---:|---:|---:|---|
| NAC Youth | 24 | 39 | 9 | 9 | no |
| NAC Cadet/Junior | 24 | 39 | **0** | **10** | yes |
| NAC Div1/Junior | 24 | 45 | 0 | 0 | yes |
| NAC Vet/Div1/Junior | 66 | 45 | 0 | 0 | yes |
| ROC Div1A/Vet | 12 | 15 | 11 | 11 | no |
| ROC Div1A/Div2/Vet | 18 | 15 | 12 | 12 | no |
| ROC Mega | 42 | 20 | 0 | 0 | no |
| RYC Weekend | 18 | 20 | 8 | 8 | no |
| RJCC Weekend | 12 | 19 | 5 | 5 | no |
| Junior Olympics | 18 | 39 | **0** | **9** | yes |

Two of the four team-bearing templates recovered, not four — the feature
predicted four and measurement corrected it (T022). No template without a
team event moved. Partial recovery is normal for these 3-day NAC templates:
`NAC Youth` places 9 of 24 with no team events at all.

## 3. What this feature knowingly did not fix

`docs/design/backlog.md` §Team events block their whole tournament carries
the full record. One line each, no detail restated here:

- `ROC Mega` places 0 with no team event — a strip-hour capacity shortfall
  from `suggestStrips()` under-recommending, unrelated to this fix.
- `NAC Div1/Junior` and `NAC Vet/Div1/Junior` stay at 0 — gated by
  `indiv-team-same-day`, a different BINDING rule, not `cut-on-team`.
- `catalogue.ts:217`'s comment above `NAC Vet/Div1/Junior` states the wrong
  selected-count arithmetic (says 36, measures 66).
- B8's +1 over the drift ledger, attributed to 004 US4, not this feature.
- B4 and B6, 006's pre-existing FR-004a exceptions, out of scope.
- The deliberate duplication between the store's `defaultCutForEntry` and
  the drift ledger's own factory in `scenarios.ts` — kept separate on
  purpose (research.md D2), not unified.

## 4. The two predicted merge conflicts, and which side to keep

Both are against `004-p3-workbench-shell`, where another session is live.

- **`docs/design/backlog.md`** — §Team events block their whole tournament
  exists on that branch in **open** form and on this branch in **closed**
  form. It is not on `main`. **Keep this branch's closed form**
  (research.md D6 chose this conflict deliberately over an unwritten
  obligation: a predicted conflict written down is cheaper than a correction
  someone has to remember to make later).
- **`src/store/store.ts`** — 004's S6 is editing a different region of the
  same file. This feature's change there is small and localized:
  `defaultConfigForId` now calls `defaultCutForEntry` from
  `src/store/competitionDefaults.ts` instead of reading
  `DEFAULT_CUT_BY_CATEGORY` directly, plus the import swap. **Keep both
  sides** — the regions do not overlap semantically. Verify the merged file
  still imports `defaultCutForEntry` and still calls it inside
  `defaultConfigForId`.

Land by `git merge --no-ff --no-commit`, completed by `commit-with-costs`,
never squashed.

## 5. The verification record

- Suite: `main` **1274 passed / 55 files** → **1566 passed / 57 files**, two
  consecutive agreeing runs, 0 skipped. Reconciled file by file in T017's
  commit `181eae4699` (+288 `competitionDefaults.test.ts`, +3
  `CompetitionOverrides.test.tsx`, +1 `store.test.ts`; the two parity files'
  counts unchanged at 17 and 11 — pin values moved, no assertion added or
  weakened).
- `tsc -b` clean, `lint` clean.
- Drift ledger byte-identical to `main`; `git diff --stat main --
  src/engine/` empty. **No engine file was touched.**
- Live: `SMOKE PASS`, 0 console errors, boot 24, `ROC Div1A/Vet` 12,
  `NAC Cadet/Junior` 15 at 39 suggested strips (measured in the driver's
  accumulated session state, not from a fresh boot).

## 6. The three tasks added after implementation began

None of these is a change of approach — each is a correction the
constitution's mid-implementation re-planning rule does not cover, because
none revised `tasks.md`'s plan, only its record of measured fact.

- **T020** — a second site pinning B2/B8
  (`__tests__/helpers/appPath.test.ts`) that the task list had missed.
- **T021** — `file:line` citations that this feature's own T014 invalidated
  by inserting a comment block above `buildCompetitions`, plus stale ones
  inherited from 006.
- **T022** — the four-templates outcome claim, falsified by measurement
  after T016 had already committed it to the backlog.

## 7. Resume prompt

```
Branch 008-team-event-cut is complete and gated: 1566/57 passing (was
1274/55 on main), tsc clean, lint clean, drift ledger byte-identical to
main, live smoke SMOKE PASS. Full record in
specs/008-team-event-cut/handoff.md.

Land it:

  git merge --no-ff --no-commit 008-team-event-cut

Two predicted conflicts:

1. docs/design/backlog.md — §Team events block their whole tournament.
   Keep THIS BRANCH's closed form (not 004-p3-workbench-shell's open form).
2. src/store/store.ts — 004's S6 touches a different region. Keep BOTH
   sides. Verify the merged file still imports defaultCutForEntry from
   ./competitionDefaults.ts and defaultConfigForId still calls it.

Then run commit-with-costs using the PROJECT session id (never a
worktree's) to complete the merge commit with cost trailers. Do not squash.
```
