# 019 Default days per template – handoff

**Status: delivered 2026-10-08** on branch `019-default-days-per-template` (worktree
`.claude/worktrees/019-default-days-per-template`, cut from `main` `8de0d5a12b`),
awaiting Task M's merge check and then the user's `merge-with-costs`. Plan:
[`plan.md`](./plan.md). The METHODOLOGY amendment: [`amendment.md`](./amendment.md).
There is no separate spec: the plan carries the owner's rulings R1–R4a.

## Session notes

Planning and implementation ran in one session (`a91cc939-e943-4ff6-a585-c52637ca30a0`),
started from the main checkout. The orchestrator ran one `cd` into the worktree
during planning, so the later workflow scripts sit under the worktree's project
directory
(`~/.claude/projects/-Users-noahlz-projects-piste-planner--claude-worktrees-019-default-days-per-template/`),
while the session transcript stays under the main checkout's
(`~/.claude/projects/-Users-noahlz-projects-piste-planner/`). merge-with-costs
should check both when it resolves the session id.

## What changed

In product terms: picking a template now gives the board enough days to keep the
template's own hard same-day rules. The template raises the day count to the
fewest days its hard pairs need under the board's tournament type, and it never
lowers the count or changes the hours of the days already there. Under NAC, SYC
and SJCC the three K₄ templates (NAC Cadet/Junior, NAC Div1/Junior, NAC
Vet/Div1/Junior) need 4 days and Junior Olympics needs 3. Under ROC, RYC and RJCC,
where Group 1 is soft, only NAC Vet/Div1/Junior needs 3. When an organizer lowers
the days below a minimum of 3 or more, a hint under the Tournament panel's Days
pills says how many days the template needs and which rule needs them. Div 1 and
Junior team events now never share a day at any tournament type (Ops Manual
2026-27 p.20 – Group 1 bullet 1). The engine used to relax the two cross-level
pairs (Div 1 ind ↔ Junior team, Junior ind ↔ Div 1 team) when days ran short and
report it only as an INFO, while the Findings panel flagged the same pairs as
broken. Now the engine breaks them with a WARN, as it already did for NAC
Cadet/Junior, so the engine and the board agree. Nothing on B1–B8 moved.

Headline, before to after (Base is `8de0d5a12b`, After is `ec1ce0d076`, the last
code commit):

| What | Before | After |
|---|---|---|
| Ledger B1–B8 scheduled | 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53 | unchanged |
| ERRORs | 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0 | unchanged |
| Boot footer B1–B8, placed / unplaced | 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0 | unchanged |
| The 10 templates at B1's 4-day settings | – | byte-identical |
| A K₄ template picked on a 3-day NAC, SYC or SJCC board | stays at 3 days | **4 days** |
| Junior Olympics picked on a 2-day national board | stays at 2 | **3** |
| NAC Vet/Div1/Junior picked on a 2-day RYC board | 2 days, 23 placed / 43 unplaced | **3 days, 46 / 20**, no crossover WARN |
| NAC Div1/Junior hand-lowered to 3 days | 6 INFO relaxations, 0 WARNs, 6 Findings rows | **6 WARNs** `HARD_SEPARATION_VIOLATED`, 0 relaxations, the same 6 rows |
| NAC Vet/Div1/Junior hand-lowered to 3 days, 80 strips | 43 placed / 23 unplaced | **41 / 25** |
| Days hint under the Days pills | none | shown below a minimum of 3 or more |
| Ledger snapshot SHA-256 | `903cd991fbca…` | `32a4e0afb45a…` (one field deleted) |
| Unit suite | 89 files / 3031 tests | 93 files / 3133 tests |

The hand-lowered rows are T1 judge J2's re-measurement of the plan's R4
counterfactual. The same counterfactual moved Suggest on hand-lowered boards: NAC
Div1/Junior 77 → 85 strips at 3 days and 114 → 132 at 2 days, NAC Vet/Div1/Junior
255 → 283 at 2 days (Left unfixed item 5). The 2-day RYC row is T2's judge.

What each task does now:

- **Plan and amendment (`dde83bdfa3`, `bf8931c78c`).** The Understand workflow (5
  readers and a critic) found that from boot every template already runs at 4
  days, and that a template reaches 3 days only after a 3-day preset (B4, B5,
  B6), the Days pills or a file. The Measure workflow ran two counterfactuals in
  throwaway worktrees. R4's showed the snapshot changes only by the deleted
  `constraint_relaxation_level` field. R1's showed the raise moves no ledger byte
  and that B4 → NAC Div1/Junior places 0 even at 4 days, on strips. It also
  produced the exact hard-graph chromatic number for every template under each
  type, the hint and smoke design, a claim check, and an amendment drafter and
  checker. A0 commits the owner-approved METHODOLOGY text verbatim before any
  code: the two cross-level pairs hard at every type (R4, R4a), the Relaxable
  tier and §Relaxable Constraints gone, and the template day-count rule in
  §Inputs (R1, R1a).
- **T1 – Div 1 and Junior team never share a day (`2873108b98`).** Day colouring
  never relaxes a hard edge. The level-3 path, the `CONSTRAINT_RELAXED` INFO, the
  `DAY_ASSIGNMENT_RELAXED` rule and `ScheduleResult.constraint_relaxation_level`
  are deleted, with the factory copy and the ledger digest field.
  `INDIV_TEAM_RELAXABLE_BLOCKS` is renamed `INDIV_TEAM_CROSS_LEVEL_BLOCKS`, and the
  pairs stay Infinity at every type, checked before Group 1. The least-bad
  fallback is unchanged. Every store-built "K₄ at 3 days" test board now sets 3
  days after `applyTemplate`, so it keeps its hand-lowered premise once T2 raises
  days.
- **T2 – a template raises the day count (`70cd7d865b`).** `catalogue.ts` gains
  `TEMPLATE_MIN_DAYS` (a national and a regional column for all 10 templates) and
  `templateMinDays`, which picks the column by `GROUP_1_SOFT_TYPES`.
  `applyTemplate` raises `days_available` to the minimum when the board has
  fewer, keeps the existing day windows by index and gives each added day 9:00 to
  19:00. A template that needs no raise leaves days and windows as they were, by
  reference. It never lowers days and never sets the type. A pin test computes
  each template's exact chromatic number through the store path and checks it
  equals both columns.
- **T3 – the template's hint under the day count (`ec1ce0d076`, smoke
  `facb0061d0`).** `TEMPLATE_HINTS` in `catalogue.ts` holds one rule sentence per
  template and column whose minimum is 3 or more, and `TEMPLATE_HINT_GENERIC`
  covers the rest. The store selector `selectTemplateDaysHint`
  (`src/store/templateHint.ts`) returns the text or `null`. It shows only when
  `loadedPresetId` names a template, the days are below that template's minimum
  for the board's type, and every event of the template is still selected.
  `TournamentPanel` shows it as a `[data-days-hint]` paragraph after the
  out-of-range message, and the Day count radiogroup's `aria-describedby` lists
  whichever of the two show. There is no live region. The exact text on NAC
  Cadet/Junior at 3 days: "NAC Cadet/Junior needs 4 days on a NAC board. Cadet
  and Junior events of one weapon and gender may never share a day, and neither
  may a team event and an individual event of the same age group. With fewer days
  some of them share a day, and the Findings panel flags each pair after
  Auto-assign."
- **Task S – live smoke.** T3's two consecutive passes on the final head
  (`facb0061d0`) serve as Task S. No separate commit.
- **Task D – docs (`f2570e0d8a`).** `backlog.md` marks §The store's default day
  count is unsatisfiable for three templates "Fixed by 019" and keeps it with its
  line numbers corrected. It adds six entries, extends four and writes the §What
  019 deliberately left unfixed index. `methodology-reconciliation.md` gains dated
  notes under §1.2.1 and §1.2.2. `competition-planner-workbench.md` marks row 019
  delivered and moves the baseline to after 019. `METHODOLOGY.md` names
  `INDIV_TEAM_CROSS_LEVEL_BLOCKS` in Individual/Team Separation's source line, the
  one follow-up the owner approved with the amendment.
- **Task H – this handoff.**

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 93 files / 3133 tests, all pass (from 89 / 3031), `tmp/**` excluded | `ec1ce0d076` |
| `tsc -b`, lint | clean, clean | every task commit body (T1, T2, T3) |
| Drift ledger snapshot SHA-256 | `903cd991fbca8f50c201092211314e48b275e9aa48db61ec7fb64cc0660107ab` to `32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260` (T1), unchanged through T2 and T3 | the task commit bodies |
| Snapshot move | T1 only: the 230 deleted `"constraint_relaxation_level": 0,` lines (3833 → 3603). The old snapshot without them is byte-identical to the new one | T1 judge J1 |
| B1–B8 scheduled, ERRORs | 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53 and 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0, unchanged | every task commit body |
| Boot footers | 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0, unchanged | T1 judge J1, T2 judge |
| Floors | none moved | – |
| Templates (B1 settings) | all 10 byte-identical through T1 and T2. Boot → any template stays at 4 days | T1 judge J2, T2 judge |
| Template sweeps | `appPathParity` 132, `keptRun` 93, strips 58, unseated 32, unchanged by T2 | `70cd7d865b` |
| B4 and B5 → K₄ templates | 3 → 4 days, matching the R1 counterfactual row for row, with every crossover WARN and hard-pair Finding gone | `70cd7d865b` |
| B6 (ROC) → any template | stays at 3 days, identical to T1 | `70cd7d865b` |
| Chromatic table | exact, Vet co-day groups contracted. National 2 / 4 / 4 / 4 / 1 / 1 / 2 / 2 / 2 / 3, regional 1 / 2 / 2 / 3 / 1 / 1 / 1 / 1 / 1 / 2, in the plan's order | plan §Measurements, pinned in `templateMinDays.test.ts` |
| Live smoke | **pass**, two consecutive full passes with 0 console errors after T1, T2 and T3. T3's pair is on the final head | T3: `facb0061d0`'s body. T1 and T2: smoke agents' reports in no commit (scratchpad `t1/smoke.md`, `t2/smoke.md`, logs `<wt>/tmp/smoke1.log` and `smoke2.log`), no driver change |

Smoke command: `SMOKE_BASE=http://localhost:5188/piste-planner/ timeout 240
node scripts/smoke.mjs`, after `pnpm -C <wt> dev --port 5188 --strictPort`.
What the driver now checks, on top of 018's checks:

1. **The days hint (T3).** One block between `shot('07-team-schedule')` and the
   per-type defaults block, on NAC Cadet/Junior under NAC. At 4 days no hint shows
   and the header reads 4 days. The Day count "3" radio shows the hint naming "NAC
   Cadet/Junior" and "4 days", and the header reads 3 days. Picking NAC Youth
   (minimum 2) removes the hint and leaves the header at 3. Picking NAC
   Cadet/Junior again raises the header to 4, checks the 4 radio, shows no hint
   and draws 24 rows of which 12 are team rows, which tells the board from NAC
   Youth's 24. The block ends where the later steps expect it, on NAC Cadet/Junior
   at 4 days. A screenshot `07c-days-hint` is taken at 3 days. The final run's
   lines:
   - "019 T3: NAC Cadet/Junior at 4 days, no hint"
   - "019 T3: lowered to 3 days, hint shows: NAC Cadet/Junior needs 4 days on a
     NAC board. …"
   - "019 T3: NAC Youth picked, hint gone, header still 3 days"
   - "019 T3: NAC Cadet/Junior picked, raised back to 4 days, 4 radio checked, no
     hint, 24 rows of which 12 team"
2. **Comments.** The five driver comments that said templates never touch the day
   count now say templates never lower days and raise them to at most 4, and that
   the driver lowers days to 3 once, in this block.

### Chain of measurements

Oldest first. Counts are taken from each commit's message body, with `tmp/**`
excluded. Where a body has no count, the row says so and nothing is guessed.

| Step | Commit | Files / tests | Notes |
|---|---|---|---|
| Base | `8de0d5a12b` (main) | 89 / 3031 | 018's merge, re-measured in the plan |
| Plan | `dde83bdfa3` | 89 / 3031 (the baseline it records) | docs only |
| A0 METHODOLOGY amendment | `bf8931c78c` | no count in body | docs only, ledger SHA unchanged |
| T1 | `2873108b98` | 89 / 3037 | snapshot `32a4e0afb45a…`. The message was amended once (decision 13) |
| T2 | `70cd7d865b` | 92 / 3088 | snapshot unchanged |
| T3 | `ec1ce0d076` | 93 / 3133 | snapshot unchanged |
| T3 smoke | `facb0061d0` | no count in body | driver only, two passes |
| Task D | `f2570e0d8a` | no count in body | docs only |
| Task H | – | no run | docs only |

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `8de0d5a12b` (main) | 3031 | – | baseline |
| `2873108b98` T1 | 3037 | +6 | the `dayColoring` (c2) ROC case, the Div1/Junior WARN case in `concurrentScheduler.test.ts`, the crossover guard widened from 3 types to 6 (+5, 3036 at review), then the `appPathParity` broken-pair check run for Div1/Junior too (+1, fix round) |
| `70cd7d865b` T2 | 3088 | +51 | `templateDays.test.ts`, `templateMinDays.test.ts` and `chromatic.test.ts` (all new, 89 → 92 files). 15 store, 6 lookup and 21 pin tests (+42, 91 / 3079 at review), then the exact-search table, the Vet contraction and the unknown-name cases (+9, fix round) |
| `ec1ce0d076` T3 | 3133 | +45 | `templateHint.test.ts` (new, 92 → 93 files) and the panel tests (+14, 93 / 3102 at review), then exact-text pins, the `TEMPLATE_HINTS` cell checks, the preset guard, the mounted removal and the accessible description (+31, fix round) |
| smoke, Task D, Task H | 3133 | 0 | driver and docs only |

The deltas sum to 102 (3031 to 3133). The figures at review come from the
reviewers' and the fix agents' reports, not commit bodies.

## Reviews

The plan got four review lenses with an adversarial verifier per blocker. Every
task got `test-quality-reviewer` (mutation-probed) and a spec review, T3 also
`react-code-reviewer`, and T1 and T2 their drift judges. There are no separate
fix commits: each task's one bundled fix round is folded into its task commit.

- **Plan review (four lenses, no blocker on the plan).** Rulings and test-first: 8
  should-fix items and 9 nits. T1 under-listed the tests that break when
  `relaxations` and the old constant go, J2's grep had no pass condition, R1a's
  column was tested only at NAC and ROC (the likely bug, picking the column with
  `REGIONAL_CUT_TOURNAMENT_TYPES`, which includes SYC and SJCC, went uncaught),
  T3's absent cases passed against the stub, and R4 had no engine-level WARN test.
  Its probe found DSatur clean at every table count for all 10 templates under all
  6 types. Drift and parity: no blocker, 4 should-fix items, and the expected SHA
  recomputed. Store, UI and smoke: no blocker and 4 should-fix items, among them
  that "24 rows" could not tell NAC Cadet/Junior from NAC Youth, and that a raise
  brings back a pin on a lowered-away day (decision 10). Amendment: two must-fix
  items, both upheld by the verifier as filing and citation defects rather than
  blockers – the departure needed its own Appendix B bullet, and Appendix A had to
  cite "Group 1 bullet 1" and flag the regional half as a departure. Every item is
  folded into the plan and the amendment.
- **T1 (test quality 1 minor and 3 nits, spec 1 minor and 4 nits, 2 judges
  accept).** Test quality's mutant that put back the relaxation left
  `appPathParity` green, so the broken-pair parity check now runs for NAC
  Div1/Junior as well as Cadet/Junior. Two nits reworded comments: (c1) breaks
  that pair because every day ties at Infinity and the lowest day wins, and the
  crossover guard's national rows are masked by Group 1. Test (a)'s name no longer
  claims day 0, since nothing asserts the day. Spec's minor (the fallback is
  unchanged except that vertices with cross-level edges now tie and go to day 0)
  is recorded in the commit body. J1 found the snapshot byte-identical apart from
  the field, and footers and parity unchanged. J2 matched every hand-lowered board
  to the counterfactual and found both pairs still hard on a ROC board. Its minor
  (the fallback cannot tell 1 broken pair from 3) is Left unfixed item 6.
- **T2 (test quality 2 important, 2 minor and 3 nits, spec 3 nits, 1 judge
  accepts).** The important ones: swapping the exact search for greedy colouring
  left every test green, so `chromatic.test.ts` now runs graphs where greedy is
  wrong. The added-day test could not catch a mutant that copies the last window,
  so the custom window moved to the last existing day. The Vet contraction had no
  test. The reviewer's example (ROC Div1A/Vet) has nothing to contract, so the
  test uses NAC Vet/Div1/Junior instead, 66 events into 42 vertices. An unknown
  name and `'toString'` now give 0. Two nits reworded (a test name and the
  chromatic helper's self-loop message). The judge found the ledger equal to T1's,
  every boot template at 4 days and the sweeps unchanged.
- **T3 (test quality 3 important, 2 minor and 2 nits, spec 2 minor and 3 nits,
  React 2 important, 1 minor and 3 nits).** The important ones: the preset guard
  did not isolate the id condition, because B1 left 18 of the template's 24 events
  unselected, so it now re-selects them. No test checked the per-template
  sentence, so three exact-text pins and a `TEMPLATE_HINTS` cell check exist now.
  No test checked that the panel subscribes, so a mounted test removes an event
  and expects the hint to go. All three reviewers flagged the vacuous
  `toContain('NAC')`, which now asserts the whole title line. React's minor added
  `toHaveAccessibleDescription`. Five mutants were re-run and each failed a new
  test. Declined: the two copy nits (decision 15), the redundant `hasOwn` guard,
  the `describedBy` construction and a local test helper. Spec's minor about the
  smoke block went to the smoke step, `facb0061d0`.

## Decisions made on the owner's behalf

### Owner rulings and approvals

1. **2026-10-08, rulings R1–R4a** (recorded in the plan). R1 a template raises the
   day count to its hard-rule minimum, keeps the day windows and never lowers. R1a
   the minimum has a national column (NAC, SYC, SJCC) and a regional one (ROC,
   RYC, RJCC), read from the board's type. R2 templates do not set the tournament
   type. R3 no new warning, but a built-in hint under the Days pills when the days
   are below the minimum. R4 Div 1 and Junior team never share a day at any type.
   R4a cite Ops Manual p.20 – Group 1 bullet 1 only.
2. **2026-10-08, the METHODOLOGY amendment approved**, committed verbatim as
   `bf8931c78c` before any code, with the one-line follow-up naming the renamed
   constant (Task D, `f2570e0d8a`).

### Decisions the work made

Each with what it costs if wrong. Decisions 1–12 are the plan's.

1. **The store's initial `days_available` stays 3.** Boot overwrites it, and R1
   raises it on every template that needs more. Cost: a fresh store in tests still
   starts at 3.
2. **The relaxation machinery and `constraint_relaxation_level` are deleted, not
   kept at 0.** Cost: the snapshot SHA moved in a feature whose drift is parity.
   J1 proved the digest otherwise byte-identical.
3. **The constant is renamed, not deleted.** Deleting it would make the pairs soft
   at regional types. Cost: none found.
4. **Every "K₄ at 3 days" test keeps its premise as a hand-lowered board**, the two
   `integration.test.ts` boards included. They are the only checks that a broken
   hard pair reaches the board. Cost: none found. They call `setDays(3)` after
   `applyTemplate`, which no default path does.
5. **The table is written by hand and pinned by an exact chromatic test**, not
   computed at runtime. Cost: a new template needs a hand-written row, and the
   pin fails until it has one (For later features).
6. **The hint needs every template event still selected.** Cost: a board with
   added events keeps the hint, which may then understate the minimum, since an
   added event can only add hard pairs.
7. **Re-picking the loaded template stays a no-op**, and the hint does not tell the
   organizer to re-pick. Cost: no obvious way back to the template's own count
   except the pills (item 2).
8. **Order A0 → T1 → T2 → T3.** Cost: none found. T1 moved every 3-day test board
   before T2, and T2 flipped no test.
9. **The hint's sentences live beside the table in `catalogue.ts`**, and the store
   composes the text. Cost: a copy change edits an engine module, though no
   ledger byte depends on it.
10. **A raise brings back a pin left on a lowered-away day.** A T2 test records it.
    Cost: an organizer who lowered days to drop a hand move sees it come back
    (item 8).
11. **`dayConfigs` changes only on a raise.** Cost: a fresh store's empty window
    list stays empty when a template needs no raise, as before.
12. **The amendment leaves the hint out of METHODOLOGY** (plan review). R3 is UI,
    and the spec names no panel elsewhere. Cost: a reader of the spec alone does
    not learn the hint exists.
13. **T1's commit message was amended once by the orchestrator.** "43/25" became
    "43/23", and a claim that only T2 made true was reworded. The tree is
    unchanged. `2873108b98` is the amended commit, and the pre-amend hash
    `f3a4c4cfd3` appears in the T1 fix report. Cost: none.
14. **The T3 smoke agent added a screenshot, `07c-days-hint`**, beyond its
    instructions. Cost: one more image per run.
15. **The two T3 hint copy nits are left as owner copy**, since both follow the
    plan's wording: "the same age group" in the Div1/Junior sentence, and "a"
    before the type code. Cost: copy that reads slightly wrong (item 9).
16. **The T2 nits were declined**: hoisting the shared type lists and literals
    across two test files, dropping a duplicate `get()` in `applyTemplate`, and
    the judge's optional guard row (a 2-day RYC board keeps NAC Youth,
    Cadet/Junior, Div1/Junior and Junior Olympics at 2). Cost: repeated literals,
    a redundant store read, and that half of the regional column pinned only by
    the judge's probe.
17. **Two T1 nits were declined as out of scope.** The `integration.test.ts`
    helpers still do not assert the cross-level pairs, and test (a) was renamed
    rather than made to assert day 0. Cost: the integration suite would not catch
    a cross-level pair sharing a day, though the colouring and parity tests would.

Deliberate corrections recorded in T1's commit body: the Div1/Junior witnesses in
`dayColoring` and `concurrentScheduler` flipped from 6 relaxations to 6
`HARD_SEPARATION_VIOLATED` WARNs. The `dayColoring` :115 fixture now breaks the
one cross-level pair instead of relaxing it, and a ROC 1-day case pins that the
pair stays hard where Group 1 is soft. The `relaxations.size` assertions went with
the API they guarded. The 3-day K₄ boards call `applyTemplate` before
`setDays(3)`. `expectViolationPairs` and `expectHardSeparationWarns` were
extracted for their two callers each. `appPathParity`'s broken-pair check, vacuous
for Div1/Junior under the relaxation, now runs for it. T2 and T3 record none.

## Left unfixed

Backlog-worthy items are marked with an asterisk and point at their entries, all
indexed under backlog §What 019 deliberately left unfixed.

1. **\*A failed event gets no Findings row and no stated reason.** The run's
   bottlenecks are not kept, and an Unplaced row needs a drawn block. NAC Youth at
   2 days and 80 strips places 13 and leaves 11 unplaced with 0 Blocking and 0
   Unplaced rows. Cost if ignored: an organizer sees events dropped and cannot
   tell why or what to change. An owner call. Backlog §A failed event gets no
   Findings row and no stated reason.
2. **\*Re-picking the loaded template does nothing** (a controlled Radix Select
   fires no `onValueChange`). Cost if ignored: an organizer who lowered days has
   no obvious way back to the template's count except the pills. Backlog
   §Re-picking the loaded template does nothing.
3. **\*`loadedPresetId` survives a file load**, a hand removal and a type change.
   Cost if ignored: the picker names a template the board is not, and the hint can
   describe that template's minimum on a loaded board that still holds all its
   events. Backlog §`loadedPresetId` survives a file load.
4. **\*Lowering days by hand discards every day's custom hours** (`setDays`), while
   the raise keeps them. Cost if ignored: a custom start on day 2 is lost without a
   message when the day count changes. Backlog §Lowering days by hand discards
   every day's custom hours.
5. **\*Suggest ignores broken hard pairs on a hand-lowered board.** It answers 283
   strips for NAC Vet/Div1/Junior at 2 days (255 before R4). Cost if ignored:
   Suggest reads as a clean answer for a board that breaks the template's own
   rules, far past the venue ceiling. Backlog §Suggest ignores broken hard pairs on
   a hand-lowered board.
6. **\*The least-bad fallback is crude.** With R4 it is the only path when days are
   too few. Every day ties at Infinity for a vertex with a hard collision, so day
   0 wins, it cannot tell 1 broken pair from 3, and NAC Vet/Div1/Junior at 3 days
   breaks a same-population Junior ind ↔ Junior team pair. Cost if ignored: a
   hand-lowered board reports breaks a better choice would avoid, picked by
   tie-break order. Backlog §Runtime failure is terminal – day assignment never
   re-colors (extended).
7. **\*A template keeps the board's strips as well as its type** (R2). B4 (SYC, 40
   strips) → NAC Div1/Junior or NAC Vet/Div1/Junior places 0 even at 4 days
   ("D1-M-EPEE-IND requires 45 strips for pools but only 40"). Cost if ignored: an
   empty board, and the hint, which is about days, says nothing. Backlog §A
   template keeps the board's tournament type (extended).
8. **\*A raise brings back a pin left on a lowered-away day** (decision 10). Cost
   if ignored: a hand move the organizer meant to drop comes back. Backlog
   §Picking a preset keeps the pins on events the two boards share (extended).
9. **\*Two hint copy nits** (decision 15). The title line's fixed "a" fits a code
   said as a word ("a NAC") and not one said as letters ("an RYC"), so the owner
   picks the reading or a wording without the article. Cost if ignored: slightly wrong copy in the one place the organizer is told why
   a board breaks the rules. An owner wording call. Backlog §Two hint copy nits
   019 left as owner copy.
10. **\*Ten METHODOLOGY lines the amendment left**, among them :86 and :328 saying
    hard rules fail scheduling where the engine falls back with a WARN, the
    relaxation levels 1–3 the engine no longer uses, and :293 and :1001 not naming
    the cross-level exception to the regional Group 1 penalty. Cost if ignored: the
    spec contradicts itself and the engine. Feature 021. Backlog §Left for 021 by
    019's amendment, under §METHODOLOGY.md and the engine have diverged, and the
    doc is the spec.
11. **Four source comments still name relaxation levels**: `crossover.ts:134`,
    `dayAssignment.ts:5`, `concurrentScheduler.ts:742` and `constants.ts:440`. The
    plan left them for 021, and they have no backlog entry of their own. Cost if
    ignored: a reader may look for a relaxation path that is gone.

### For later features

020 and the features after it measure against the numbers in Measurements.
Templates raise the day count by tournament type through `templateMinDays` in
`src/engine/catalogue.ts`. A new template needs a `TEMPLATE_MIN_DAYS` row and, if
either of its minimums is 3 or more, a `TEMPLATE_HINTS` sentence for that column.
The pin tests in `__tests__/engine/templateMinDays.test.ts` fail until it has
both: the table's keys must equal `TEMPLATES`'s, each row must equal the exact
chromatic number under NAC and ROC, and a cell must carry a sentence exactly when
its minimum is 3 or more. No hard pair is ever relaxed now. When days are too few
the least-bad fallback breaks pairs with a WARN, and the Findings panel lists each
one. The ledger digest no longer has `constraint_relaxation_level`, and
`ScheduleResult` no longer has the field. 018's rules still hold: anything the
engine reads must be in `configKey`, a change to per-event derivation also
changes `__tests__/helpers/scenarios.ts` and `__tests__/store/factoryParity.test.ts`,
and a change to `MAX_FENCERS`, `MIN_FENCERS` or `DAY_HARD_END_MINS` changes the
factory's copy in the same commit.

## Merge

Checked 2026-10-08 with `git merge-tree --write-tree main 019-default-days-per-template`.

- Branch head checked: 356877d787e5b2771af0cda6cb98849485ac3772 (the branch tip before this note).
- Main: 8de0d5a12bd41936935f07e5b57dd2349ebedbed, which has not moved since the branch was cut.
- Merge tree: a9b85e54e2e84befeff5b5e21f28e6da8d2d1964, identical to the branch's own tree.
- Conflicts: none.
- Because the trees are identical, the checks ran in the feature worktree at the branch head (clean status), with `tmp/**` excluded from the suite and lint.
- Full suite: 93 files, 3133 tests, all passing.
- `tsc -b`: clean. Lint: clean.
- Drift ledger snapshot SHA-256: 32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260, byte-identical to the expected value.

The user merges with merge-with-costs. If main moves first, the check is re-run there.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 019 (default days per template) is delivered and merged
into main, and its record is specs/019-default-days-per-template/handoff.md.

Next is roadmap feature 020, re-run on parameter change:
docs/design/competition-planner-workbench.md §Roadmap row 020, and
docs/design/backlog.md §"Changing a parameter should re-run the engine, with a
working indicator". 020 re-runs the engine, debounced, when an input changes,
and shows a working indicator after a delay. 017's stale banner and its
configKey (the canonical serialization of the engine's inputs, compared with
the kept run's) are the hook for knowing when a re-run is due. Its drift is
expected to be none, measured against the ledger 019 left: B1-B8 scheduled 24 /
24 / 24 / 24 / 12 / 51 / 18 / 53, ERRORs 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0,
snapshot SHA-256
32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260, 93 files /
3133 tests, boot footers 24/0, 24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0.
Picking a template now raises the day count (templateMinDays in catalogue.ts),
so a re-run triggered by a template pick runs at the raised count. If a change
touches per-event derivation, list __tests__/helpers/scenarios.ts and
__tests__/store/factoryParity.test.ts among its editable files and change the
factory's copy in the same commit.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch (020-...). Plan 020 yourself: no Spec Kit, choose the planning approach,
and keep the constitution's guardrails (drift ledger, test-first, live smoke,
git ownership). The user merges with merge-with-costs and makes the closing
commit with commit-with-costs. Agents commit only inside the worktree, and
never push, merge or make the closing commit.
```
