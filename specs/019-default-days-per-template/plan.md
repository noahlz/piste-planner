# 019 Default days per template – plan

> **For agentic workers:** the orchestrator writes no code. Each task is one or two subagent dispatches
> of 2–4 steps, then its review wave (test quality, spec, drift judges, React where UI changed), one
> bundled fix round, then a live-smoke run in its own subagent. Planning and implementation run in this
> one session, driving the worktree with absolute paths.

**Goal:** picking a template gives the board enough days to keep the template's own hard same-day
rules, the Tournament panel says so when the days are lowered below that, and Div 1 and Junior team
events never share a day.

**Sources:** roadmap row 019 (`docs/design/competition-planner-workbench.md:288`), backlog §The
store's default day count is unsatisfiable for three templates (`backlog.md:662`). The Understand
workflow (5 readers and a critic), the Measure workflow (two counterfactuals in throwaway worktrees, a
hint and smoke design, a claim check, an amendment drafter and checker) and the plan review (four
lenses, an adversarial verifier per blocker) are summarised under Measurements. Probes sit git-ignored
in `<wt>/tmp/probes/`. The METHODOLOGY amendment is [`amendment.md`](./amendment.md).

## Owner rulings (2026-10-08, this session)

| # | Ruling |
|---|---|
| R1 | **A template raises the day count to its hard-rule minimum.** A table for all 10 templates gives the fewest days their hard same-day rules need. Picking a template raises the board's days only when it has fewer, keeps the existing day windows, and never lowers. |
| R1a | **By the board's type.** The table has a national column (NAC, SYC, SJCC, where Group 1 is hard) and a regional one (ROC, RYC, RJCC, where it is soft). The raise and the hint read the board's type. |
| R2 | **Templates do not set the tournament type.** Backlog §A template keeps the board's tournament type stays open. |
| R3 | **No new warning, but templates carry built-in hints.** Under the Tournament panel's Days pills, shown only when the board's days are below the loaded template's minimum. |
| R4 | **Div 1 and Junior team never share a day, full stop.** Both cross-level pairs (Div 1 ind ↔ Junior team, Junior ind ↔ Div 1 team) lose the level-3 relaxation. With too few days the engine treats them like every other hard pair. Source: Ops Manual 2026-27 p.20 – Group 1 bullet 1. The 2026-27 Athlete Handbook §2.14 has no same-day rule. |
| R4a | **Cite Group 1 bullet 1 only.** Bullet 3 covers team ↔ individual in the same age level at a NAC, which this cross-level pair is not. |

The owner approves [`amendment.md`](./amendment.md) before Task A0 commits it. No code task starts
before that commit.

## Global constraints

- `<wt>` = `/Users/noahlz/projects/piste-planner/.claude/worktrees/019-default-days-per-template`,
  branch `019-default-days-per-template`, cut from `main` `8de0d5a12b`. Agents commit there only, one
  commit per task plus one per smoke-driver change. Never push, merge, rebase or make the closing
  commit. The user merges with `merge-with-costs`.
- Baseline (018's handoff, re-measured in this worktree): 89 files / 3031 tests with `tmp/**`
  excluded, `tsc -b` and lint clean, ledger B1–B8 scheduled 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53,
  ERRORs 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0, snapshot SHA-256
  `903cd991fbca8f50c201092211314e48b275e9aa48db61ec7fb64cc0660107ab`
  (`shasum -a 256 <wt>/__tests__/engine/__snapshots__/driftLedger.test.ts.snap`), boot footers 24/0,
  24/0, 24/0, 24/6, 12/0, 51/3, 18/0, 53/0.
- `vitest.config.ts` does not exclude `tmp/`. Every full-suite run passes `--exclude 'tmp/**'`.
- Commands, never `cd`:
  - `timeout 300 pnpm -C <wt> --silent test --exclude 'tmp/**' > <wt>/tmp/test.log 2>&1`
  - `timeout 180 pnpm -C <wt> exec vitest run <file> > <wt>/tmp/<name>.log 2>&1`
  - `timeout 180 pnpm -C <wt> exec tsc -b > <wt>/tmp/tsc.log 2>&1`
  - `timeout 120 pnpm -C <wt> --silent lint --ignore-pattern 'tmp/**' > <wt>/tmp/lint.log 2>&1`
  - Live app: `pnpm -C <wt> dev --port 5188 --strictPort`, then
    `SMOKE_BASE=http://localhost:5188/piste-planner/ timeout 240 node <wt>/scripts/smoke.mjs`.
  - Read logs only on failure.
- **Test-first.** Each behaviour test fails first on its assertion (stub new exports with their declared
  signatures first), and the dispatch records the failure reason. Tests marked *guard* pass before and
  after by design.
- `src/engine/` stays pure. `as const` objects with derived unions. Every loop bounded, the test-side
  chromatic search included (an iteration cap that throws).
- **Factory copy.** T1 deletes a `ScheduleResult` field that per-event derivation writes
  (`derive.ts:166`), so its factory copy (`__tests__/helpers/factories.ts:183`) changes in the same
  commit. `__tests__/helpers/scenarios.ts` and `__tests__/store/factoryParity.test.ts` join T1's files
  to be checked. Neither references the field, so no change is expected there.
- Each task ends green on the full suite, `tsc -b` and lint. Its commit body records the snapshot SHA,
  files / tests counts, the drift it measured and any deliberate correction.
- **Floors.** No task moves a floor. A count below a floor halts the task.
- **Live smoke** after every user-visible task (T1, T2, T3), in its own Sonnet subagent: extend
  `scripts/smoke.mjs` in place (never rewrite), repair locators until two consecutive passes, commit only
  when the driver changed ("019 Tn: smoke …"). The smoke subagent never edits the Suggest pin at
  `smoke.mjs:1167` ("measured, not adjustable").
- **Drift review per engine or store task** (T1, T2): read-only judges of at most four items each, run in
  parallel. A counterfactual or control run goes in a detached throwaway worktree that the judge removes.

## Measurements the plan rests on

- **Who gets 3 days today.** Boot loads B1 (4 days), and `applyTemplate` (`store.ts:389-402`) touches
  neither days nor type nor strips, so from boot every template already runs at 4. A template reaches 3
  days after a 3-day preset (B4, B5, B6), through the Days pills, or through a file. The store's
  initial 3 (`store.ts:218`) shows for at most one render before boot overwrites it, and tests pin it
  (`store.test.ts:26`).
- **Hard-graph chromatic number** (exact, co-day groups contracted, R4 applied; `chiByType.out.txt`,
  `graph.test.ts`). Group 1 is the only type-dependent hard rule, so NAC = SYC = SJCC and ROC = RYC =
  RJCC.

  | Template | National | Regional |
  |---|---|---|
  | NAC Youth | 2 | 1 |
  | NAC Cadet/Junior | 4 | 2 |
  | NAC Div1/Junior | 4 | 2 |
  | NAC Vet/Div1/Junior | 4 | 3 |
  | ROC Div1A/Vet | 1 | 1 |
  | ROC Div1A/Div2/Vet | 1 | 1 |
  | ROC Mega | 2 | 1 |
  | RYC Weekend | 2 | 1 |
  | RJCC Weekend | 2 | 1 |
  | Junior Olympics | 3 | 2 |

  No template or scenario needs 5. B2, B7 and B8 need 3 and have 4. The review's probe
  (`reviewTablePin.test.ts`) found DSatur with no violation at every table count, for all 10 templates
  under all 6 types, at 0, 40 and 80 strips.
- **Today at 3 days under NAC** (`templateDays.test.ts`): NAC Cadet/Junior breaks 6 hard pairs on Day 1
  (6 WARNs `UNAVOIDABLE_CROSSOVER_CONFLICT`, 6 non-dismissable Findings rows). NAC Div1/Junior and NAC
  Vet/Div1/Junior relax 6 Div 1 ind ↔ Junior team pairs (INFO only), and the Findings panel still shows
  the 6 pairs as non-dismissable hard-separation rows: the engine and the board disagree. Junior
  Olympics breaks 6 pairs at 2 days. All three K4 templates are clean at 4.
- **R4 counterfactual** (`cfRelax.*`, relaxation off, return value kept): ledger SHA unchanged. Deleting
  the `constraint_relaxation_level` field as well gives SHA
  `32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260`, and the old snapshot minus its 230
  `"constraint_relaxation_level": 0,` lines is byte-identical to it (3833 → 3603 lines). The digest
  carries no INFO counts or rule ids, so deleting the INFO and renaming the constant move no bytes (drift
  lens). The counterfactual's "2 tests fail" undercounts T1, because it kept the `relaxations` return
  value. The 10 templates at B1's settings do not move. At hand-lowered days: Div1/Junior 3 days X0 R6
  → X6 R0 (F6 unchanged), Suggest 77 → 85, 2 days 114 → 132, Vet/Div1/Junior 2 days 255 → 283. The
  fallback then breaks other pairs, some same-population (Junior ind ↔ Junior team on Vet/Div1/Junior
  at 3 days). Deleting the constant outright would make the pairs soft at ROC, RYC and RJCC
  (`crossover.ts:229` runs before the Group 1 test), so it stays as a hard block under a new name.
- **R1 counterfactual** (`cfRaise.*`, national column only, relaxation on): ledger SHA unchanged, 6 tests
  fail – the store-built "K4 at 3 days" witnesses, whose helpers set 3 days before `applyTemplate`
  (`dayColoring.test.ts:581`, `concurrentScheduler.test.ts:626`, `appPathParity.test.ts:453`). Boot →
  any template stays 4. B5 → Div1/Junior 3 → 4 days, 24/0. B4 → Div1/Junior or Vet/Div1/Junior still
  places 0 at 4 days (strip shortfall: "D1-M-EPEE-IND requires 45 strips for pools but only 40"), so the
  preset's strips and type, not days, decide that path. Custom hours survive the raise. A 5-day board
  stays 5. Its B6 (ROC) rows used the national column, so under R1a every B6 → template path stays at
  3 days.
- **Hint plumbing** (`hint-smoke` report). `loadedPresetId` is written only by `applyTemplate` and
  `applyPreset`. A file load leaves it stale, as do hand removals and type changes. A `#config=` link
  boots a fresh store with it `null`. Re-picking the loaded template does not fire `onValueChange` (Radix
  controlled Select, probe `repick.test.tsx`), so only picking another template and back re-applies it.
  The Days section (`src/components/workbench/panels/TournamentPanel.tsx:100-126`) shows the
  out-of-range message (`:123-125`) only at days outside 2–4.
- **Smoke.** Every template step runs at boot's 4 days (`smoke.mjs:379-385`), so R1 moves no pin. The
  only 3-day preset (B4, `:1786`) is last with no template after it. Five comments say `applyTemplate`
  never touches days (`:379-381`, `:946-948`, `:1037-1038`, `:1053-1054`, `:1300-1302`). No pin exists
  before `:1462`'s first Move day. The driver's `% 4` assumption is at `:1641` and the Suggest pin at
  `:1167`.
- **Plan review.** No blocker on the plan. Two confirmed must-fixes on the amendment (its Appendix B
  filing and Appendix A's citation), both folded in. The should-fix items are folded into the tasks
  below.

## Tasks

### A0: METHODOLOGY amendment (docs, owner-approved text)

Apply [`amendment.md`](./amendment.md)'s Blocks 1–9 to `METHODOLOGY.md` verbatim, in their numbered
order (bottom of the file first, so every line number holds), and commit them alone. Commit: "019 A0:
METHODOLOGY amendment (owner-approved)".

### T1: Div 1 and Junior team never share a day (R4, engine)

- **Intent.**
  - Day colouring never relaxes a hard edge. Delete the level-3 path in `dayColoring.ts`:
    `findRelaxableEdges`, the relaxed branch, the `relaxations` map and its return, and `colorPenalty`'s
    `relaxedEdges` parameter. The least-bad fallback stays as it is.
  - Delete what only the relaxation fed: the `CONSTRAINT_RELAXED` INFO (`concurrentScheduler.ts:328-345`)
    and the `relaxations` destructure (`:302`), the `CONSTRAINT_RELAXED` cause and
    `DAY_ASSIGNMENT_RELAXED` rule (`types.ts:129`, `:160`) with their `bottleneckInvariants.ts:15` row,
    and `ScheduleResult.constraint_relaxation_level` (`types.ts:383`) with its writers
    (`concurrentScheduler.ts:334`, `:492`, `derive.ts:166`), the factory copy (`factories.ts:183`) and the
    ledger digest field (`driftLedger.test.ts:220`, `:346-348`).
  - Rename `INDIV_TEAM_RELAXABLE_BLOCKS` and its predicate to names without "relaxable". The pairs stay
    Infinity at every tournament type, checked before Group 1.
  - Reword every comment and docblock that says these pairs relax or names the deleted pieces:
    `crossover.ts:82-88`, `:200`, `constants.ts:632-638`, `constraintGraph.ts:43`, `dayColoring.ts:344`,
    `derive.ts:17`, `concurrentScheduler.ts:350`, and in tests `dayColoring.test.ts:72-77`, `:102`,
    `:552-561`, `derive.test.ts:70`, `integration.test.ts:58-60`, `:88-90`, `:147-148`, `:158`, and the test
    names at `constraintGraph.test.ts:57`, `:84`, `:101`, `crossover.test.ts:354`, `:426-428`,
    `placementRules.test.ts:50`, `:107`.
  - Every store-built "K4 at 3 days" board – the witness helpers (`dayColoring.test.ts:578-585`,
    `concurrentScheduler.test.ts:623-630`, `appPathParity.test.ts:451-457`) and the two
    `integration.test.ts` tests at `:446-458` and `:468-480` – sets a literal 3 days after
    `applyTemplate`, a hand-lowered board, so each keeps its premise through T2. Correct their "as boot
    does" and "default day count (3)" comments to say so.
- **Tests first** (red, each on its assertion).
  - NAC Div1/Junior on a hand-lowered 3-day board: `assignDaysByColoring` returns six violations (the
    `dayColoring.test.ts:622-639` witness, renamed).
  - The same board through `scheduleAllConcurrent` gives six WARN `HARD_SEPARATION_VIOLATED` /
    `UNAVOIDABLE_CROSSOVER_CONFLICT` bottlenecks, each naming both ids (the pairs in `cfRelax.out.txt`,
    "NAC Div1/Junior|3|@80"). Today it gives INFO relaxations. This is R4's user-visible half: the engine
    and the board now agree.
  - The `:115` fixture (Div 1 ind, Junior team and Cadet in 2 days) breaks a pair instead of relaxing
    one. Built at ROC on 1 day, it gives one violation on Div 1 ind ↔ Junior team.
  - *Guards*: the existing `crossover.test.ts:354` case, renamed and extended from the three regional
    types to all six, shows both pairs are Infinity everywhere. `constants.test.ts:68-86` keeps its three
    assertions under the new name, the "not Vet/Vet" guard included. NAC Cadet/Junior's six pairs hold
    under the moved helpers.
- **Tests that flip.** `dayColoring.test.ts:115`, `:622-639`. The `relaxations` destructures and
  `.size === 0` assertions at `dayColoring.test.ts:45/50`, `:64/68`, `:143/148`, `:282/285` and
  `:645/695` are deleted (each premise is "no violation", which the tests already assert or which
  `violations` states). `constants.test.ts:3` and `:68-86` (the rename). `derive.test.ts:89`.
  `integration.test.ts`'s helpers (`:63`, `:93`, `:126`, their 12 call sites, the `>= 3` skips at `:74`,
  `:103` and the check at `:147-155`). The snapshot.
- **Ledger.** The snapshot changes only by the deleted field: expected SHA `32a4e0afb45a…`. No floor
  moves.
- **Drift review (2 judges).** J1: the old snapshot with every `"constraint_relaxation_level": 0,` line
  removed is byte-identical to the new one, B1–B8 counts and ERRORs and boot footers unchanged,
  `factoryParity` and `appPathParity` green. J2: the 10 templates at B1's settings unchanged, the three
  K4 templates and Junior Olympics at 2 and 3 days against the counterfactual table with every newly
  broken pair explained, both pairs still hard on a ROC board, and
  `grep -rnE 'RELAXABLE|Relaxable|findRelaxableEdges|relaxedEdges|relaxations|constraint_relaxation_level|CONSTRAINT_RELAXED|DAY_ASSIGNMENT_RELAXED' <wt>/src <wt>/__tests__`
  returns nothing. Comments about relaxation levels may remain for 021 (`crossover.ts:134`,
  `concurrentScheduler.ts:765`, `dayAssignment.ts:5`, `constants.ts:440`).
- **Smoke.** Run it. No driver change is expected.

Commit: "019 T1: Div 1 and Junior team never share a day".

### T2: a template raises the day count (R1, R1a, store)

- **Intent.**
  - `catalogue.ts` gains the minimum-days table above, keyed by template name with a national and a
    regional column, and a pure lookup that takes a template name and a tournament type and picks the
    column by `GROUP_1_SOFT_TYPES` (`constants.ts:477`) – not `REGIONAL_CUT_TOURNAMENT_TYPES`, which
    `fencerDefaultsFor` uses next door and which includes SYC and SJCC. Look names up with
    `Object.hasOwn`.
  - `applyTemplate`, still one `set()`, raises `days_available` to the minimum for the board's type when
    the board has fewer. Only then does it touch `dayConfigs`: one window per day, existing windows kept
    by index, default windows (`DAY_START_MINS`, `DAY_END_MINS`) for the rest. A template that needs no
    raise leaves `days_available` and `dayConfigs` exactly as they were (same references). It never
    lowers and never touches the type.
- **Tests first** (store, red unless marked).
  - Over all six types on a 3-day board, NAC Cadet/Junior gives 4 days at NAC, SYC and SJCC (red) and
    stays at 3 at ROC, RYC and RJCC (*guard*), with `tournament_type` unchanged. A lookup unit test with
    the same six rows.
  - A 2-day RYC board then NAC Vet/Div1/Junior gives 3. A 2-day NAC board then Junior Olympics gives 3.
  - A custom window on day 2 survives a raise, and the added day gets the default window.
  - A fresh store (3 days, no windows) then NAC Cadet/Junior has 4 days and 4 windows.
  - A pin left on day index 3 from a 4-day board lowered by hand to 3 is back in range after a raise to
    4, and the next run honours it. This records the behaviour the raise brings (decision 10).
  - *Guards*: a 4-day board keeps its days and its windows by reference (`toBe`). A 5-day board stays 5.
    A fresh store then RYC Weekend keeps 3 days and its empty `dayConfigs`. No template lowers days.
    R2's existing guard is `Header.test.tsx:83-95`.
- **Table pin.** One test computes, through the store path and `buildConstraintGraph`, the exact
  chromatic number of each template's hard graph (Vet co-day groups contracted, bounded search that
  throws) under NAC and under ROC, and asserts it equals both columns. It also checks SYC and SJCC equal
  NAC and RYC and RJCC equal ROC, that the table's keys equal `TEMPLATES`'s, and that
  `assignDaysByColoring` at the table's count returns no violation.
- **Tests that flip.** None expected: T1 moved every 3-day board.
- **Ledger.** Byte-identical to T1's.
- **Drift review (1 judge, 4 items).** Ledger SHA equals T1's. Boot → each of the 10 templates stays 4
  days and the template sweeps (`appPathParity`, `keptRun`, `strips`, `unseated`) are unchanged. B4 (SYC)
  and B5 (SJCC) → the K4 templates and Junior Olympics against the R1 counterfactual table, re-measured
  with R4. B6 (ROC) → each template stays at 3 days, and a RYC board then each NAC template raises only
  where the regional column asks.
- **Smoke.** Run it. No driver change is expected.

Commit: "019 T2: a template raises the day count".

### T3: the template's hint under the day count (R3, store and UI)

- **Intent.**
  - Each template's built-in hint – one plain sentence naming the rule that needs its days – sits beside
    the table in `catalogue.ts`, for every template and column whose minimum is 3 or more (national: the
    three K4 templates and Junior Olympics, regional: NAC Vet/Div1/Junior). The other cells, which only a
    file loaded after a template pick can reach, use one generic sentence. The engine already owns rule
    text (`validation.ts:431-437`, `placementRules.ts:61`), and the store composes copy that names UI
    (`derived.ts` `NO_ROOM_MESSAGE`).
  - A pure store selector returns the hint text or `null`. It shows only when `loadedPresetId` names a
    template, `days_available` is below that template's minimum for the board's type, and every event of
    the template is still selected (guards the stale id after a file load or a hand removal). Text:
    "\<template\> needs \<N\> days on a \<type\> board." then the template's sentence, then "With fewer
    days some of them share a day, and the Findings panel flags each pair after Auto-assign."
  - `TournamentPanel` shows it as a sibling paragraph after the out-of-range message in the Days section,
    outside the radiogroup's items, with `data-days-hint` and the help-text style `mt-2 text-[12.5px]
    leading-normal text-neutral-700` (`:95`, `:124`). The radiogroup's `aria-describedby` lists the ids of
    whichever of the two messages show (the `useId` pattern of `SettingsPanel.tsx:51-68`). No live region.
    It subscribes through a selector that returns the string.
  - Proposed sentences (no semicolons joining clauses, ` – ` for asides):
    - NAC Cadet/Junior, national: "Cadet and Junior events of one weapon and gender may never share a
      day, and neither may a team event and an individual event of the same age group."
    - NAC Div1/Junior and NAC Vet/Div1/Junior, national: the same with Div 1 and Junior.
    - Junior Olympics, national: "Cadet and Junior events of one weapon and gender may never share a
      day, and Junior's individual and team events may never share one either."
    - NAC Vet/Div1/Junior, regional: "Veteran age-group events of one weapon and gender run on one day,
      and neither the Veteran Combined nor the Veteran team event may join them or each other."
- **Tests first** (red against a stub that returns `null`).
  - NAC Cadet/Junior then 3 days: the hint names "NAC Cadet/Junior", "4 days" and NAC.
  - A RYC board, NAC Vet/Div1/Junior, 2 days: the hint names 3 days.
  - NAC Cadet/Junior on a RYC board at 3 days shows none, and switching the type to NAC shows it (the
    selector follows `tournament_type`). The reverse removes it.
  - At 1 day (set through a file load or `setState`) the out-of-range message and the hint both show, in
    that order, and the radiogroup is described by both.
- **Guards** (present except one condition, so each fails if the selector ignores that condition):
  NAC Cadet/Junior, then `applyPreset('B1')`, then 3 days. NAC Cadet/Junior, then a file with other
  events at 3 days. NAC Cadet/Junior at 3 days with one event removed. NAC Cadet/Junior at 4 days.
- **Reviews.** Test quality, spec, `react-code-reviewer`.
- **Smoke.** One block, inserted after `shot('07-team-schedule')` (`smoke.mjs:1317`) and before the
  per-type defaults block (`:1319`), on NAC Cadet/Junior at 4 days: no hint. Click the 3 pill (the
  `Day count` radiogroup's "3" radio): the hint names "NAC Cadet/Junior" and 4 days, and the header
  (`[data-summary]`) reads 3 days. Pick NAC Youth (minimum 2): wait for the hint to detach, and the header
  still reads 3. Pick NAC Cadet/Junior: the header reads 4, the 4 radio is `aria-checked`, no hint, 24
  schedule rows of which 12 are team rows (`[data-schedule-row$="-TEAM"]`, which tells the board from NAC
  Youth's 24). The block ends on NAC Cadet/Junior at 4 days under NAC, which `:1336-1379`, `:1423` and
  `:1641` assume. Reword all five comments (`:379-381`, `:946-948`, `:1037-1038`, `:1053-1054`,
  `:1300-1302`): templates never lower days and raise them to at most 4, and the driver lowers days to 3
  once, in the 019 hint block, which restores 4 before the per-type step.

Commit: "019 T3: the template's hint under the day count".

### Task S: the final live smoke

Two consecutive full passes on the final head, 0 console errors.

### Task D: docs

`backlog.md`: mark §The store's default day count is unsatisfiable for three templates "Fixed by 019"
(kept, correcting its stale lines). Add entries for what 019 leaves:

- a failed event gets no Findings row and no stated reason (the claim check's draft);
- the template keeps the board's strips as well as its type (extend that entry with B4 → 0/24);
- re-picking the loaded template does nothing;
- `loadedPresetId` survives a file load, so the picker label goes stale;
- lowering days by hand discards every day's custom hours (`setDays`);
- Suggest counts placements and overruns but not broken hard pairs on a hand-lowered board;
- with R4, the least-bad fallback breaks other and sometimes same-population pairs when days are too
  few (under §Runtime failure is terminal);
- a raise brings back a pin the organizer left on a lowered-away day (extend §Picking a preset keeps the
  pins);
- the amendment's "left for 021" list (under §METHODOLOGY.md and the engine have diverged);
- a §What 019 deliberately left unfixed index.

`methodology-reconciliation.md` §1.2.1 and §1.2.2: a note that 019 gives templates their days and
removes the relaxation. `competition-planner-workbench.md`: row 019 delivered with the new baseline.
`METHODOLOGY.md` Block 6's "(see `crossover.ts`, `constants.ts`)" gains the renamed constant, a
one-line follow-up the owner approved with the amendment.

### Task H: handoff

`specs/019-default-days-per-template/handoff.md` in 018's shape: what changed, measurements and
chain, reviews, decisions made on the owner's behalf with their cost, left unfixed, resume prompt for
the next feature.

### Task M: the merge check

`git merge-tree --write-tree main 019-default-days-per-template`. If main has not moved the tree equals
the branch's, and the branch's own checks cover it. Otherwise check out the merged tree in a detached
throwaway worktree and run the full suite, `tsc -b`, lint and the ledger there.

## Decisions made on the owner's behalf

1. **The store's initial `days_available` stays 3.** Boot overwrites it, and R1 raises it on every
   template that needs more. Cost: a fresh store in tests still starts at 3.
2. **The relaxation machinery and `constraint_relaxation_level` are deleted, not kept at 0.** Cost: the
   snapshot SHA moves in a feature whose drift is parity, and J1 proves the digest is otherwise
   byte-identical.
3. **The constant is renamed, not deleted.** Deleting it would make the pairs soft at regional types.
4. **Every "K4 at 3 days" test keeps its premise as a hand-lowered board** (T1), the two
   `integration.test.ts` boards included. They are the only checks that a broken hard pair reaches the
   board.
5. **The table is written by hand and pinned by an exact chromatic test**, not computed at runtime. The
   owner chose a table, and no engine code searches the graph.
6. **The hint needs every template event still selected.** Cost: a board with added events keeps the
   hint, which may then understate the minimum, since an added event can only add hard pairs.
7. **Re-picking the loaded template stays a no-op**, and the hint does not tell the organizer to
   re-pick. Backlog.
8. **Order A0 → T1 → T2 → T3.** T1 settles the engine and moves every 3-day test board before T2's store
   change.
9. **The hint's sentences live beside the table in `catalogue.ts`** ("templates carry built-in hints"),
   and the store composes the text.
10. **A raise brings back a pin left on a lowered-away day.** `setDays` keeps placements and
    `buildPinnedPlacements` skips a pin whose day is out of range, so after a raise that day is in range
    again and the next run honours the pin. Cost: an organizer who lowered days to drop a hand move sees
    it come back. A T2 test records it, and the backlog entry on preset pins gains it.
11. **`dayConfigs` changes only on a raise.** Cost: a fresh store's empty window list stays empty when a
    template needs no raise, as today.
12. **The amendment leaves the hint out of METHODOLOGY** (plan review). R3 is UI, and the spec names no
    panel elsewhere.
