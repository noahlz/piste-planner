# 015 Ledger converges with the store – plan

> **For agentic workers:** the orchestrator writes no code. Each task below is
> one subagent dispatch, or one workflow phase when ultracode is on. Start from
> [`sessions/S1.md`](./sessions/S1.md).

**Goal:** the drift ledger's competition factory builds every B1–B8 event by
the same per-tournament-type rules the app ships. Those rules are the regional
cut override, the per-type DE mode and the per-type referee policy. The ledger
then measures the tournament the app runs, the three FR-004a parity exceptions
close, and the ledger is re-baselined once, on purpose, with every moved
number explained.

**Why:** [`backlog.md` §The drift ledger's factory does not apply the store's
per-type resolutions](../../docs/design/backlog.md#the-drift-ledgers-factory-does-not-apply-the-stores-per-type-resolutions).
The factory derives `cut_mode` and `de_mode` per event and leaves `ref_policy`
unresolved, while `buildConfig.ts` resolves all three per tournament type.
So the ledger has been measuring a configuration the app never runs. On the
three regional scenarios (B4, B5 and B6), it is also a configuration the
engine's own `regional-cut-override` rule flags.

**Roadmap:** [`competition-planner-workbench.md` §Roadmap row
015](../../docs/design/competition-planner-workbench.md). 017, 018, 019 and 023
are each measured against this ledger and wait on it.

**Branches:** the plan was written and measured on `015-ledger-convergence`
(worktree `.claude/worktrees/015-ledger-convergence`, cut from `main` at
`24d19f7ed6`). Implementation runs in its own worktree,
`015-ledger-convergence-impl`, cut from `main` after the plan branch merges.

## Baseline (measured 2026-10-05 at `24d19f7ed6`)

- 77 files / 1794 tests pass.
- Drift ledger snapshot SHA-256
  `5483c40c1349944b6ac26659406b39bb84fef9091c2e259c7f0e36920520d0b6`.
- Ledger scheduled B1–B8: 24 / 24 / 24 / 17 / 12 / 45 / 18 / 52.
- App path placed B1–B8: 24 / 24 / 24 / 18 / 12 / 40 / 18 / 53.

## What planning measured

Every number in this section comes from throwaway Vitest probes run against
`24d19f7ed6`. The probes were written, run and deleted. Independent agents
re-wrote the B4, B6 and B8 probes from scratch and reproduced every count.

### B4's 18-vs-17 – isolated

Five `Competition` fields differ between the two B4 builds: `ref_policy` (30
of 30 events), `latest_end` (30), `cut_mode` and `cut_value` (the 12 Y14 and
Cadet events) and `de_mode` (the 6 Cadet events, which the factory stages
because Cadet video is REQUIRED and the app runs single-stage at an SYC). Of
`TournamentConfig`, only `dayConfigs` differs.

| Start | Swapped in from the other path | Scheduled |
|---|---|---:|
| ledger | – | 17 |
| ledger | `ref_policy` / `latest_end` / config, each alone | 17 |
| ledger | `cut_mode` + `cut_value` | 19 |
| ledger | `de_mode` | 20 |
| ledger | cut + `de_mode` | **18** |
| app | – | 18 |
| app | `ref_policy` / `latest_end` / config, each alone | 18 |
| app | cut | 20 |
| app | `de_mode` | 19 |
| app | cut + `de_mode` | **17** |

**Cut alone does not account for the +1.** Cut and DE mode together are
necessary and sufficient, from both directions, and each alone overshoots.
The two effects partly cancel. The app places CDT-M-FOIL, CDT-M-SABRE,
Y12-M-FOIL and Y12-W-EPEE (all IND) where the ledger places CDT-W-FOIL,
CDT-W-SABRE and Y14-M-FOIL, four in and three out. So `PARITY_EXCEPTIONS.B4`
named the right owner and the wrong cause. Both fields are in this entry's
scope, and B4 needs no other owner.

### Each rule's effect, all eight scenarios

The scheduled count with each rule applied to the current factory. CUT is the
regional override, DE the per-type DE mode, REF the per-type referee policy.

| | Type | None | CUT | DE | REF | CUT+DE | All three | App path |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| B1 | NAC | 24 | 24 | 24 | 24 | 24 | 24 | 24 |
| B2 | NAC | 24 | 24 | 24 | 24 | 24 | 24 | 24 |
| B3 | NAC | 24 | 24 | 24 | 24 | 24 | 24 | 24 |
| B4 | SYC | 17 | 19 | 20 | 17 | 18 | **18** | 18 |
| B5 | SJCC | 12 | 12 | 12 | 12 | 12 | 12 | 12 |
| B6 | ROC | 45 | 43 | 42 | 45 | 40 | **40** | 40 |
| B7 | NAC | 18 | 18 | 18 | 18 | 18 | 18 | 18 |
| B8 | NAC | 52 | 52 | 53 | 52 | 53 | **53** | 53 |

Events each rule changes: CUT changes 12 on B4, 12 on B5 and 18 on B6, and none
at a NAC. DE changes 12 / 12 / 24 / 6 / 12 / 12 / 0 / 41. REF changes every
event and moves no count in any combination.

- **B6, 45 → 40.** CUT alone takes it to 43 and DE alone to 42. Eight events
  leave: VET-M-EPEE-IND-VCMB, VET-W-EPEE-IND-VCMB, Y12-M-FOIL-IND,
  Y12-M-SABRE-IND, Y12-W-SABRE-IND, D2-M-EPEE-IND, D2-M-SABRE-IND and
  D2-W-EPEE-IND. Three arrive: D1A-W-FOIL-IND, JR-M-EPEE-IND and
  JR-W-SABRE-IND. The all-advance brackets cost the strip-hours the 20% cut
  hid.
- **B8, 52 → 53**, from DE alone. JR-W-EPEE-IND is placed.

With all three rules applied, the converged ledger equals the app path on all
eight scenarios.

### What else moves in the digest

| | errorCount | stripRecommendation | daySummaryPeaks | Events changed |
|---|---|---|---|---:|
| B1 | – | – | – | 13 / 24 |
| B2 | – | – | – | 14 / 24 |
| B3 | – | 71 → 68 | – | 24 / 24 |
| B4 | 13 → 12 | – | 86/182/98 → 86/156/162 | 15 / 21 |
| B5 | – | 28 → 32 | – | 12 / 12 |
| B6 | 9 → 14 | 60 → 65 | 170/220/194 → 92/107/95 | 47 / 48 |
| B7 | – | – | – | **0 / 18** |
| B8 | 1 → 0 | 69 → 51 | emits none | 48 / 53 |

`warnCountsByCause` moves on B2, B4, B6 and B8, and `refRequirementsByDay` on
B1, B2, B4, B6 and B8. B7's digest is byte-identical. Under convergence, B8
places every event, so it no longer emits a `Day N refs:` summary line, and
only B4 and B6 do.

`refRecommendation` does not move, because the digest passes a fixed 2 refs
per pool (`AUTO_REFS_PER_POOL`). Resolved by policy (D5), only B6 changes,
from `{three_weapon 66, foil_epee 2}` to `{33, 1}`.

### What still differs after convergence

- **`latest_end`**: the factory has 9999 and the app has Infinity, on every
  event. Setting it to Infinity in the factory leaves the full digest
  byte-identical on all eight, per-event times included.
- **`dayConfigs`**: the factory has `[]` and the app has 1440-spaced windows.
  This is the only `TournamentConfig` key that differs on any scenario.
- Competition id sets and order are identical on all eight.

### Blast radius

With the converged factory in place and nothing else changed, 12 tests fail
in four files:

| File | Test | Moves because |
|---|---|---|
| `driftLedger.test.ts` | B1–B6 and B8 digests (7 snapshots) | the table above |
| `driftLedger.test.ts` | B4 pin, `toBe(17)` at :273 | B4 → 18 |
| `driftLedger.test.ts` | B6 floor, 45 | B6 → 40 |
| `integration.test.ts:324` | B6 floor, `>= 44` | B6 → 40 |
| `stripSearch.test.ts:110` | B1 `range.floor` pin, 36 | → 35. The ceiling pin at :111 did not run |
| `bottleneckSubjects.test.ts:78` | B5 `initialAnalysis` warnings non-empty | converged B5 emits none |

`appPathParity.test.ts` stays green only because its ledger table is typed by
hand. Once `LEDGER_SCHEDULED_COUNTS` holds the real counts, its consistency
test requires all three exceptions to go. `appPath.test.ts`'s `BASELINE` pins
the app path, which does not change.

## Expected outcome

- Ledger B1–B8: **24 / 24 / 24 / 18 / 12 / 40 / 18 / 53**, equal to the app
  path on all eight. `PARITY_EXCEPTIONS` is empty.
- Floors: B4 17 → 18 and B8 52 → 53 are raises. **B6 45 → 40 is a deliberate
  floor lowering.** Its one precedent is Ruling 11, which accepted B4's
  15 → 0 with its cause recorded. D4 writes down the rule that admits it.
- Nothing under `src/` changes, so the app is unchanged and the live smoke's
  numbers match 014's.

## Decisions

**D1 – The rules converge and their sources stay apart.** 008's research D2
holds: two books written from one source are one book.

- The factory imports `REGIONAL_CUT_OVERRIDES` and
  `REGIONAL_CUT_TOURNAMENT_TYPES` from `src/engine/constants.ts`. These are
  engine data tables, from the module the factory already imports
  `DEFAULT_CUT_BY_CATEGORY` from, and the engine's own `regional-cut-override`
  rule reads them too. The override step itself is written in the factory's
  own words.
- The factory transcribes its own per-type table of DE mode and referee
  policy from the spec, `git show
  0ab5bd2dc9:specs/004-p3-workbench-shell/data-model.md` §Per-type default
  table. It never imports `src/store/typeDefaults.ts` or any `src/store`
  helper. If the table were shared, a wrong row would move the ledger and the
  app together, and parity would not catch it.
- The docblock above `buildCompetitions` grows to name all four
  deliberate copies: the team cut and the three per-type rules.

Cost if wrong: a wrong entry in the shared engine tables moves both paths
together, and parity cannot see it. That was already true for
`DEFAULT_CUT_BY_CATEGORY`, and the validation rule reads the same tables.

**D2 – The factory takes the tournament type.** The signature becomes
`buildCompetitions(fencerCounts, tournamentType)`, with the type required. All
15 call sites, in six files, pass it: `driftLedger.test.ts:123`, `integration.test.ts` (8
sites, :168–:362), `resources.test.ts:486`, `bottleneckSubjects.test.ts:48`,
`stripSearch.test.ts:34` and `pinnedScheduling.test.ts:37, :180, :259`. Team
events take the per-type DE mode like individual events, as `buildConfig.ts`
does, so NAC team DEs become STAGED in the ledger. Whether a team DE should
stage at all is 023's question. The factory also sets `latest_end: Infinity`,
measured as byte-identical, so no `Competition` field is left differing.

**D3 – A field-level parity test, written first.** This is a new file,
`__tests__/store/factoryParity.test.ts`. Before each scenario it resets the
store exactly as `runAppPath` does (`useStore.setState(useStore.getInitialState(),
true)`), because `applyPreset` only calls setters and would otherwise carry
state from one scenario into the next. It then calls `applyPreset(id)` and
`buildTournamentConfig(useStore.getState())`, and never `runScheduleAll`.
For each of B1–B8 it checks the factory against that app-path build:

- the same competition ids, in the same order
- every `Competition` field equal, with no allowlist
- every `TournamentConfig` key equal except `dayConfigs`, which is allowlisted
  with its reason. The ledger keeps the engine's own day axis, and
  converging it would rewrite every time in the snapshot for no behavior
  change (006's whole-config swaps moved no count).

For each scenario the test collects **every** differing field, iterating the
union of both objects' keys, and reports them all in one message. Each entry
gives the field, its first differing event id and the two values formatted
with `String()`, because `JSON.stringify` prints Infinity as null. A test that
stopped at the first difference would show only `ref_policy` on B4, so the
red-run check below could not be made. The test is written before the factory
changes.
Against the current factory it must fail on exactly these fields:

- `ref_policy` and `latest_end` on all eight scenarios
- `de_mode` on all but B7
- `cut_mode` and `cut_value` on B4, B5 and B6 only

It sees differences the count check cannot, such as `ref_policy`, which
moves no count, and pairs that cancel at the count, as B4's cut and DE mode
do. The count-level parity test stays, because it alone covers the placement
filter and the day axis.

**D4 – The re-baseline is one commit, with the floor rule amended.** The
`SCHEDULED_FLOORS` docblock gains the case it never named. A floor may be
lowered only when the ledger's own inputs were wrong, and only when all four
of these hold:

- the old count was measured on a configuration the app never runs
- the new count equals the app path's measured count
- `factoryParity.test.ts` passes in the lowering commit, which proves the
  inputs now match. A count can match by coincidence, as B4's cut and DE mode
  showed when they cancelled.
- the lowering commit records both counts and the isolation beside the floor

The `driftLedger.test.ts` header gains one sentence after its drift-gate
paragraph, because constitution III says to follow the header. The sentence
says the one admitted lowering is the input-correction case in the
`SCHEDULED_FLOORS` docblock. B6's dated entry cites this plan's tables (CUT 43,
DE 42, both 40) and the eight-out, three-in event list. The same commit holds:

- the snapshot
- B4's and B8's raises
- the B4 pin: 18 exactly, and its comment's "13 ERRORs" becomes 12
- `SCENARIOS_WITH_DAY_SUMMARY` set to `['B4', 'B6']`. In its docblock, B4's
  peaks 86 / 182 / 98 become the re-measured 86 / 156 / 162. B8 joins the
  group that places every event and emits no summary line, with 015 named as
  the reason it moved.
- `integration.test.ts`: B4's floor (:270) 17 → 18, B6's floor (:324) 44 → 40
  with its :323 comment citing the D4 rule, and B8's floor (:371) 52 → 53 with
  its :369 comment rewritten
- `stripSearch.test.ts`: the B1 `range.floor` and `range.ceiling` pins
  (:110–:111), plus the docblock's numbers (:28–:30: floor, ceiling, answer,
  placed counts and the scan length), all re-measured. `range.floor` is a
  strip count, not a scheduled-count floor, so it may go down.
- `appPathParity.test.ts`:
  - `PARITY_EXCEPTIONS` emptied, with the header and seam docblocks rewritten
    to say all eight agree
  - `LEDGER_SCHEDULED_COUNTS` stops being a hand-typed copy. A new
    per-scenario test asserts it against the live ledger count
    (`scheduleAll` over `buildCompetitions(fencerCounts, tournamentType)` and
    `tournamentConfig`). The table was typed by hand, which is why three
    stale exceptions stayed green.
- `appPath.test.ts`: rewrite the B4 account (:52–:58) and the :64 row comment
  to say the ledger now reads 18 too, and add a dated 015 line after :46
  saying B6's gap closed. `BASELINE` values do not change.
- `validation.test.ts:62–66` and `store.test.ts:435–438`: each gets one dated
  015 line giving the converged ledger's figures. The counts in the
  validation comment are re-measured. The existing history stays as written.

The exception mechanism and its consistency test stay, for the next gap. The
commit message lists before and after for every scenario's count, errorCount
and stripRecommendation, plus the snapshot SHA, and quotes Task 1's two
logs.

**D5 – `refRecommendation` follows the resolved policy.** The digest derives
refs per pool from the competitions' own `ref_policy`, through the engine's
`resolveRefsPerPool(policy, 1).refs_per_pool` (`src/engine/pools.ts:166`, the
same call `StripsPanel.tsx:178` makes). The result is `recommendRefCount`'s
second argument. The digest asserts that the policy is uniform across the
scenario, and `AUTO_REFS_PER_POOL` and its docblock go.
Only B6 moves. `dayPeakRefDemands` already reads `comp.ref_policy` and needs no
edit.

**D6 – B5's analysis warnings are pinned as absent.** Converged B5 raises no
`initialAnalysis` warning. The per-scenario non-empty guard in
`bottleneckSubjects.test.ts` takes an explicit list,
`SCENARIOS_WITHOUT_ANALYSIS_WARNINGS = ['B5']`, which asserts exactly zero for
those scenarios and non-empty for the rest. That keeps both directions
pinned and checks every warning B1–B8 emits. The zero assertion's message
reads: "B5 now emits initialAnalysis warnings. Confirm they are expected,
then remove B5 from SCENARIOS_WITHOUT_ANALYSIS_WARNINGS. The invariant loop
checks them." The list's comment says why B5
is in it.

**D7 – Out of scope:**

- *`dayConfigs`* stays as the ledger's day axis (D3).
- *Team DE modelling*, which is 023. 015 only makes the ledger stage NAC team
  DEs the way the app already does. 023's scope text and the backlog's
  team-events entry both say "the ledger factory forces team events
  SINGLE_STAGE" (`competition-planner-workbench.md:287`, `backlog.md:1141`).
  Task 4 corrects both.
- *RYC and the regional cut.* `REGIONAL_CUT_TOURNAMENT_TYPES` is ROC, SYC,
  RJCC and SJCC, with no RYC. The backlog entry's field table says
  "ROC/RYC/RJCC". 015 copies the engine's set unchanged. The handoff records
  the mismatch for the owner, because Y14 at an RYC still cuts 20% on both
  paths.
- *B6 places 40 of 54 in the app.* It is now the ledger's number too. This is
  existing product behavior that 015 makes visible, not something 015 caused.

## Tasks

After every task, the orchestrator records the test-count chain and the
snapshot SHA in `<wt>/tmp/015-ledger.md`, and the handoff transcribes them.

### Task 1 – the parity test, red, then the factory (coder-sonnet)

Files: new `__tests__/store/factoryParity.test.ts`,
`__tests__/helpers/scenarios.ts`, and the 15 call sites in D2. If the store
reset is factored into a helper, `__tests__/helpers/appPath.ts` joins the list.

1. Write the D3 test. Run it and save the output to
   `<wt>/tmp/015-task1-red.log`. Confirm it reports exactly the predicted
   scenario × field set. If it reports anything else, halt.
2. Converge the factory per D1 and D2, and update the call sites. The parity
   test passes.
3. Run the full suite and save the failing-test list to
   `<wt>/tmp/015-task1-blast.log`. The failures must be exactly §Blast radius,
   and nothing else. Any other failure is a halt.

No commit. A red intermediate commit would reach `main` through a non-squash
merge, so the tree goes to Task 2 uncommitted. If Task 2 halts, the session
stops with the tree uncommitted and reports both logs.

### Task 2 – the re-baseline (coder-opus)

Files: `driftLedger.test.ts` and its snapshot, `integration.test.ts`,
`stripSearch.test.ts`, `bottleneckSubjects.test.ts`, `appPathParity.test.ts`,
`appPath.test.ts`, `validation.test.ts` (comment only) and `store.test.ts`
(comment only).

1. Apply D5. Re-take the ledger snapshot for `driftLedger.test.ts` alone. Diff
   it scenario by scenario against §What else moves. B7 must be untouched,
   and any count or scalar that differs from the tables is a halt.
2. Apply D4 to the ledger file: floors, the amended docblock and header, the
   B4 pin and the day-summary list.
3. Apply D4 to the other files, including the live `LEDGER_SCHEDULED_COUNTS`
   check, and D6 to `bottleneckSubjects.test.ts`.
4. Run the full suite, `tsc -b` and lint. Record the snapshot SHA. Commit,
   with a message that carries the D4 record.

**Commit point:** one commit holding Tasks 1 and 2.

### Review wave

These run in parallel and are read-only. Their findings go to one bundled
fix dispatch.

- **Spec and quality** against this plan, one pass.
- **`test-quality-reviewer`** on every test edit (constitution II).
- **Drift audit (judge-opus).**
  - Every moved number has its cause recorded.
  - The only floor lowered is B6's, under the D4 rule.
  - No file under `src/` changed: `git diff main -- src/` is empty.
  - The factory imports nothing from `src/store`.
  - Mutation check: in a scratch copy, drop each of the three rules from the
    factory in turn, and the field-level test goes red naming that field.
    Then restore `latest_end: 9999`, and it goes red on `latest_end`.

### Task 3 – live smoke (subagent, `live-smoke` skill)

Start a dev server from the implementation worktree on its own port. The
smoke must pass with 014's numbers: B1 boots to 24 rows, the footer reads
`19 placed · 5 unplaced · 0 pinned`, and Suggest gives 15 / 66 / 80 / 48.
Nothing under `src/` changed, so any difference is a halt.

### Task 4 – docs and handoff (coder-sonnet)

- `backlog.md`: remove the closed entry, as 014 removed its own. Correct the
  team-events line (`:1141–:1142`) and drop or update its `scenarios.ts:66-68`
  citation.
- `competition-planner-workbench.md`:
  - row 015 marked delivered
  - "Where it stands" and the baseline line updated to after-015 counts
  - the 023 scope sentence (`:285–:288`) corrected, with its `scenarios.ts`
    citation dropped or updated
- `specs/015-ledger-convergence/handoff.md`, in the 014 handoff's shape:
  - what changed
  - measurements and the test-count chain
  - reviews
  - decisions made on the owner's behalf, each with its cost
  - what was left unfixed:
    - RYC is missing from the regional cut set
    - B6 places 40 of 54
    - `src/store/buildConfig.ts:232` cites `scenarios.ts:69`, which goes stale.
      It is left alone because `src/` is out of scope.
  - **for later features:** `factoryParity.test.ts` goes red on any
    store-side change to per-event derivation. A feature that changes
    `TYPE_DEFAULTS`, `defaultCutForEntry` or `buildCompetitions` must change
    the factory's own copy in the same commit. It must also list
    `scenarios.ts` and `factoryParity.test.ts` among its editable files.
    023, which changes the team-event DE rule, and 018, which changes the
    policy tables, are both exposed.
  - the merge check

**Commit point:** docs and handoff.

### Task 5 – merge-tree check (orchestrator)

Put `git merge-tree` output in a detached throwaway worktree, then run
`tsc -b`, lint and the full suite there. Record the result in the handoff.
The user merges with `merge-with-costs`.

## Halts

- The field-level test's red run fails on a field or scenario this plan does
  not predict.
- Converged counts differ from 24 / 24 / 24 / 18 / 12 / 40 / 18 / 53, or B7's
  digest moves.
- A scheduled-count floor, in `SCHEDULED_FLOORS` or `integration.test.ts`,
  would drop on any scenario but B6, or B6 would drop below 40.
  `stripSearch.test.ts`'s `range.floor` is a strip count, re-measured under
  D4, and is not covered by this halt.
- `PINNED_APP_PATH_COUNTS` or `appPath.test.ts`'s `BASELINE` would move.
- Any file under `src/` changes.
- In Task 1 step 3, a test fails that §Blast radius does not list. In Task
  2, a test fails outside the files and pins that D4, D5 and D6 name.

## Re-measuring

If `src/` or `__tests__/` has moved since `24d19f7ed6`, re-run this plan's
probes before Task 1. Write one throwaway Vitest file under the worktree's
`tmp/` and run it with `pnpm -C <wt> exec vitest run tmp/<file>`. It applies
CUT, DE and REF as separate transforms over `buildCompetitions`' output, runs
`scheduleAll` for none, each rule, CUT+DE and all three, and compares the
result with `runAppPath`. Delete it afterwards. Any number that moves replaces
the one in the tables before any task runs.
