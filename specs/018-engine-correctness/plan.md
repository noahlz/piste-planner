# 018 Engine correctness – plan

> **For agentic workers:** the orchestrator writes no code. Each task is one or two subagent dispatches
> of 2–4 steps, then its review wave (test quality, spec, drift judges, React where UI changed), one
> bundled fix round, then a live-smoke run in its own subagent. Planning and implementation run in this
> one session from the main checkout, driving the worktree with absolute paths.

**Goal:** an event whose last phase runs past the day's 22:00 hard end is placed with a warning instead
of dropped, Div 1 promotes 75 % at a NAC, and a share link or saved file can no longer carry a fencer
count the engine cannot size.

**Sources:** roadmap row 018 (`docs/design/competition-planner-workbench.md:284`), backlog §Day-end
overrun (`backlog.md:305`), §Policy tables (Div 1 row, `:520`), §A shared URL with a fencer count of 0
or 1 (`:1571`). The Understand workflow (7 readers and a critic) and the plan review (an amendment
drafter and checker, three lenses) are summarised under Measurements. Probes sit git-ignored in
`<wt>/tmp/probes/`.

## Owner rulings (2026-10-07, this session)

| # | Ruling |
|---|---|
| R1 | **Overrun, last phase only.** An event's last phase may end past the day's hard end if it starts before the hard end and ends by midnight of that day. It is placed on the first attempt that fits and carries a WARN. Every other phase keeps today's rule. Earlier owner ruling 2026-10-06: "place with a WARN … not dropped". |
| R2 | **Suggest sizes for 22:00.** The strip-count search counts an event that ends past the hard end as not placed, so Suggest still answers the strips at which every event ends by 22:00. |
| R3 | **WARN in the engine and a Findings row.** `scheduleAll` emits one WARN per overrunning event, and one pure check over the drawn board gives the Findings panel a Warning row per event ending past the hard end, hand-moved events included. |
| R4 | **Div 1 cut 25 %** (75 % advance) at NAC, per the 2026-27 Athlete Handbook p.37 (Div I National Championships, NACs and July Challenge). Cadet and Junior stay at 20 %. Regional types stay 100 %. |
| R5 | **Fencer count bounds 2 to 336.** "Only solve for real tournaments." The minimum stays 2 because B8's actual V80 events have 2–5 fencers and D1-M-FOIL-TEAM has 4 teams. The maximum is 336 for every event, the Handbook §2.2.5 (printed p.15) NAC cap for Div I, Junior and Cadet (Elite 112 + Challenger 224). |
| R6 | **Refuse out-of-range counts at load.** A link or file whose count is outside 2–336 or not a whole number is refused with a reason. A newly added event starts at its default count, never 0. Engine guards stay as a backstop. |
| R7 | **A refused link says why on the board.** Boot keeps the refusal reason in the store, and a dismissable notice at the top of the board says the link couldn't be opened, why, and that B1 is shown instead. It covers every refused link, not only counts. |

The owner amends METHODOLOGY first (Task A0, text approved 2026-10-07). No code task starts before that
commit.

## Global constraints

- `<wt>` = `/Users/noahlz/projects/piste-planner/.claude/worktrees/018-engine-correctness`, branch
  `018-engine-correctness`, cut from `main` `d4f545736c`. Agents commit there only, one commit per task
  plus one per review-fix round and one per smoke-driver change. Never push, merge, rebase or make the
  closing commit. The user merges with `merge-with-costs`.
- Baseline (017's handoff, re-measured in this worktree): 87 files / 2795 tests with `tmp/**` excluded,
  ledger B1–B8 scheduled 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53, ERRORs 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0,
  snapshot SHA-256 `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06`
  (`shasum -a 256 <wt>/__tests__/engine/__snapshots__/driftLedger.test.ts.snap`), boot footers 24/0,
  24/0, 24/0, 21/9, 12/0, 45/9, 18/0, 53/0.
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
- `src/engine/` stays pure. `as const` objects with derived unions. Every loop bounded.
- **Factory copy.** `__tests__/helpers/factories.ts` copies `MAX_FENCERS`, `MIN_FENCERS` (`:66-67`) and
  `DAY_HARD_END_MINS` (`:20`, `:53`). A task that changes one changes the factory in the same commit, and
  `__tests__/store/factoryParity.test.ts` passes there. T4 touches `deriveEventSchedule`, so
  `__tests__/helpers/scenarios.ts` and `factoryParity.test.ts` join T4's files.
- Each task ends green on the full suite, `tsc -b` and lint. Its commit body records the snapshot SHA,
  files / tests counts, the drift it measured and any deliberate correction.
- **Floors.** T2 raises the B4 and B6 floors with dated entries (`SCHEDULED_FLOORS` and the second copies
  at `integration.test.ts:282`, `:350`). No task lowers a floor. A count below a floor halts the task.
- **Live smoke** after every user-visible task (T1, T2, T3, T4), in its own Sonnet subagent: extend
  `scripts/smoke.mjs` in place (never rewrite), repair locators until two consecutive passes, commit only
  when the driver changed ("018 Tn: smoke …"). The smoke subagent never edits the Suggest pin at
  `smoke.mjs:1166` ("measured, not adjustable"). If a drift judge measures a new answer, the orchestrator
  records it as a deliberate correction in that task's commit and the pin takes the judge's number.
- **Drift review per fix** (T1, T2, T4): read-only judges of at most four items each, run in parallel.
  A counterfactual or control run goes in a detached throwaway worktree that the judge removes.

## Measurements the plan rests on

- **Overrun.** The hard end binds only in `tryAllocate` (`concurrentScheduler.ts:1250`), in four
  comparisons: the staged fits-in-day check `:1269`, the staged defer `:1275`, the post-fit check
  `:1292` (`SAME_DAY_VIOLATION`) and the miss-defer `:1331`. Two failed attempts drop the event
  (`:1089-1139`). Rollback deletes every bottleneck an attempt raised (`resources.ts:126-131`), so a WARN
  raised inside an attempt is erased. All 18 B4/B6 drops are day-end losses (14 TIME, 4 post-fit
  overrun). Termination rests on `maxIter` and `MAX_DEFERS_PER_PHASE`, not the hard end. The terminal
  node is always a DE (`successor_index === -1`, `:649-653`): `DE_SINGLE`, or `DE_R16` when staged.
- **Counterfactual R1** (throwaway patch, last phase only, starts before the hard end, ends by midnight):
  B4 21 → 24, B6 45 → 51, ERRORs 9 → 6 and 9 → 3, nothing else scheduled moves. B4 referee peaks
  88/80/80 → 88/96/94, B4 boot footer peak 88 → 96. `daySummaryPeaks` B4 152/168/190 → 152/228/230, B6
  112/106/118 → 132/126/131. `warnCountsByCause` with the new WARN: B4 `DEADLINE_BREACH` 9 → 6 and
  `SAME_DAY_VIOLATION` +3 (CDT-W-FOIL 23:10, CDT-W-SABRE 23:15, Y14-W-EPEE 23:30), B6 `DEADLINE_BREACH`
  9 → 7 and `SAME_DAY_VIOLATION` +7 (the six new events and VET-M-SABRE-IND-VCMB, which now ends 22:30).
  Without R2 Suggest moved B2 77 → 75 and B5 29 → 28. 29 tests in 11 files failed.
- **Div 1 at 25 %** (ledger-factory probe and a full suite under a mocked 25): no scheduled, ERROR, day,
  pool-start or bracket-size change. The snapshot moves on B1, B2, B7 and B8 only: R16 and total-end
  times, B7 WARNs 3 → 4 (a new first-day WARN), B2 `stripRecommendation` 77 → 75 (its floor), seven B8
  day-1 VET events' R16 100–160 min later, and B8 day 1 `peak_saber_refs` 56 → 60. B3–B6 are
  byte-identical. NAC Vet/Div1/Junior Suggest stays 103 and the B1 boot peak stays 210 (store-path probe).
  15 tests in 7 files fail.
- **Fencer count.** `serialization.ts:258` refuses only non-numbers and negatives. A count of 0 or 1
  reaches `computePoolStructure` (`pools.ts:25-27`, which throws) via `analysis.ts:130` /
  `derive.ts:92`, and a fresh page shows the error boundary. 1.5 gives NaN, `1e999` (Infinity) throws at
  `validation.ts:247`, NaN slips `validation.ts:149`. `defaultConfigForId` (`store.ts:309-320`) starts an
  added event at 0. A refused `#config=` link logs `console.error` and boots B1 (`boot.ts:28-31`,
  `:45-46`), with no UI reason. A refused file shows its reason in the export popover
  (`ExportPopover.tsx:57-59`). Both default tables cover all 120 catalogue ids, max 310.

## Tasks

### A0: METHODOLOGY amendment (docs, owner-approved text)

The amendment text the owner approves is committed verbatim, alone, before any code. It covers the
overrun (§Inputs, Single-Day Fit, Same-Day Completion with a one-line definition of "last phase", the
defer rule, `SAME_DAY_VIOLATION` at ERROR and WARN, Phase 5, Timing Constants with a midnight row,
Strip Count Suggestion), Div 1 (the cuts table split, the NAC row, the NAC defaults bullet) and the
fencer bounds (2 to 336, §Fencer Count Bounds, Appendix A, the S8 sources row). The 4:00 PM pool cutoff,
flight B's note and the `'TIME'` label stay as written.

Commit: "018 A0: METHODOLOGY amendment (owner-approved)".

### T1: Div 1 promotes 75 % at a NAC (R4)

- **Intent.** `DEFAULT_CUT_BY_CATEGORY[DIV1]` becomes a 25 % cut. The regional override keeps Div 1 at
  100 % elsewhere. Update the comments that cite 20 % for Div 1 (`constants.ts:166-172`, `:643`), the
  stale "B2 … floor 75, answer 77" comment (`stripSearch.test.ts:71-72`) and the `refs.test.ts` MOVED
  comment.
- **Tests first.** The pin in `constants.test.ts:122-138` splits Div 1 (25) from Cadet and Junior (20)
  and fails first. A test pins B1 D1-M-EPEE-IND's DE field at 233 of 310 in a 256 bracket (was 248).
- **Tests that flip** (full suite under a mocked 25): `buildConfig.test.ts:165-166`, `:547` and the six
  Div 1 rows of `buildConfig-preShrink-nac-vet-div1-junior.json` (lines 13, 63, 113, 163, 213, 263),
  `refs.test.ts:329` row `['B8', 1, …]` (sabre 56 → 60), `segments.test.ts:143` (B1, B2, B7, B8 hashes),
  `findings.test.ts:845` (its premise, D1-M-EPEE's derived end making the day late, is gone: give it a
  new trigger such as a later start, never a number swap), `findings.test.ts:862` (1185 → 1165),
  `footerMetrics.test.ts:479` (1130 → 1110), and the four snapshots.
- **Ledger.** Re-run `driftLedger.test.ts` and accept the snapshot only after the drift review. Expected:
  exactly the Div 1 moves above. No floor moves.
- **Drift review (3 judges).** J1: B1 and B2 digest diff against the prediction. J2: B7 and B8, including
  B7's new first-day WARN, the B8 VET knock-on and the B8 sabre peak, each explained by a cause. J3:
  B3–B6 byte-identical, `appPathParity` and `factoryParity` green, boot footers unchanged, the
  NAC Vet/Div1/Junior Suggest answer and the B1 boot peak measured on the store path.
- **Smoke.** Run it. No driver change is expected.

Commit: "018 T1: Div 1 promotes 75 % at a NAC".

### T2: the last phase may run past the hard end (R1, R2, engine)

- **Intent.**
  - A day-ceiling helper beside `dayHardEnd` (`types.ts:598-603`), for the scheduler's axes only: with a
    `dayConfigs` entry, the next multiple of 1440 above `dayStart(d)`, and without one,
    `dayStart + (1440 − DAY_START_MINS)` (the ledger's axis). Nothing on the store's clock axis calls it.
  - In `tryAllocate`, the event's last phase (`successor_index === -1`) fits when it ends by the hard end
    (today's rule), or when it starts before the hard end and ends by
    `min(max(ceiling, hardEnd), latest_end)`. Every other phase keeps "ends by the hard end". All four
    comparisons use the rule, and both defer comparisons also require the deferred start to be before
    the hard end. `latest_end` stays a hard per-event limit. The `'TIME'` / `'STRIPS'` label in
    `resources.ts:256-260` is left as is (INFO only, outside the digest) and recorded.
  - A pure exported engine function
    `(schedule: Record<string, ScheduleResult>, config: TournamentConfig, labelOf = (id) => id) => Bottleneck[]`
    names every placed event whose last phase ends past `dayHardEnd(r.assigned_day, config)`. The last
    phase's end is `de_round_of_16_end ?? de_end`. Each WARN: rule `phase-overruns-day-end` (reused),
    cause `SAME_DAY_VIOLATION`, severity WARN, `phase: Phase.POST_SCHEDULE`, `competition_id: id`,
    `subjects: [id]`, `day`, `delay_mins` = end − hard end, and a message naming `labelOf(id)` and the
    estimated finish as a clock time (`clockOnDay`). It reads only `dayHardEnd`, so it works on every
    axis. `scheduleAll` calls it after scheduling, beside `postScheduleWarnings`, outside any attempt.
  - Pinned events go through the same gates, so a pinned last phase past 22:00 is claimed and warned,
    no longer an ERROR, a `PINNED_UNCLAIMED` and an unseated block.
  - The strip-count search (`stripSearch.ts:210-224`) counts the union of overrunning and unseated events
    as not placed, one decrement per event. That `placed` is Suggest's progress number, not the footer's.
- **Tests first** (the Opus dispatch orders the steps: engine tests red, engine change green, then the
  Suggest test, now red, then the R2 change). In `dayHardEnd.test.ts`: a last phase that starts before
  22:00 and ends 23:15 is placed with one WARN carrying 23:15 (`:176` becomes this positive case). A
  pinned last phase past 22:00 is claimed with a WARN. The ceiling on both scheduler axes. A staged R16
  may overrun. *Guards*: a last phase that would start at or after 22:00 fails, one that would end past
  midnight fails, pools ending past 22:00 fail, staged prelims ending past 22:00 fail, `latest_end`
  below the hard end binds. `stripSearch`: a count whose only shortfall is an overrun does not pass.
- **Tests that flip** (counterfactual LAST log plus the lens review): `driftLedger.test.ts` (B4, B6
  digests, B4's exact pin `:423` and its name `:420`, "B4's 9 ERRORs" `:413-414` → 6, dated entries in
  the `:375-390` history and the `:177-180` day-peaks docblock, B2 and B5 only if R2 fails to hold
  them), `refs.test.ts:335` (B4 days 1 and 2), `regionalGroup1Window.test.ts:198-221` (new trigger:
  `latest_end: dayHardEnd(0, config)` on `long`), `stripSearch.test.ts:271` (its oracle at `:286-292`
  counts overrun events as not placed), `:497` and `:503-521` (re-measure under R2),
  `unseated.test.ts:107` (pin-all 12 → 18, 37 → 44), `appPath.test.ts:97`, `:208`,
  `segments.test.ts:143`, `appPathParity.test.ts:201`, `:213`, `:433`, `:556`, `:579` (88 → 96),
  `derived.test.ts:201-213` (switch to B4's last-day message), `store.test.ts:465`. A test whose premise
  changed gets a new premise that still exercises its rule, and the commit names each.
  `bottleneckSubjects.test.ts` runs the invariants on every B1–B8 bottleneck, so the WARN must name its
  id as a token (`bottleneckInvariants.ts:89-100`). Consider adding the rule to the day-scoped set
  (`bottleneckSubjects.test.ts:107-120`).
- **Ledger and floors.** Expected: the counterfactual numbers above, with B2 at its post-T1 75 and B5 at
  29, and `stripRecommendation` re-measured on all eight (R2 could raise an answer where an attempt-2
  rescue becomes an attempt-1 overrun). B4 74 and B6 63 expected unchanged. Raise both floors to 24 and
  51. `SCENARIOS_WITH_DAY_SUMMARY` stays `['B4','B6']`.
- **Drift review (5 judges).** J1: B4 – every newly placed event (last phase starts before the hard end
  and ends by midnight), its WARN, the referee peaks and `daySummaryPeaks`. J2: B6 – the same, plus
  VET-M-SABRE-IND-VCMB and VET-M-EPEE-IND-VCMB, which moved. J3: B1, B2, B3, B5, B7, B8 unchanged, all
  eight `stripRecommendation` answers, and a control in a throwaway worktree with the `stripSearch.ts`
  hunk reverted, showing R2 is what holds B5 (and B2 if it separates). J4: the 10 templates through the
  app path at B1's settings, before and after, NAC Vet/Div1/Junior's 8 losses and its Suggest answer.
  J5: why JR-M-SABRE-IND, JR-W-SABRE-IND and VET-M-FOIL-IND-VCMB stay lost on B6 though they overrun by
  30, 36 and 5 minutes.
- **Smoke.** Run it. No driver change is expected from T2 alone (the grid check reads the template at its
  Suggest count, where R2 rules out overruns).

Dispatch split: an Opus dispatch for the engine change and its new tests, then a Sonnet dispatch for the
flipped pins and the ledger, then the commit. Commit: "018 T2: the last phase may run past the hard end".

### T3: the overrun on the board (R3, store and UI)

- **Intent.**
  - `placementFindings` (`src/store/derived.ts:283-306`) calls T2's function on the drawn board with
    `clockAxisConfig` and `competitionLabel`, as it does `firstLastDayWarnings`, so the panel gets one
    Warning row per event ending past the hard end, run-placed and hand-moved alike. Dismissable, like the
    late-finish row. The producer list at `derived.ts:687-690` gains it.
  - `axisSpan` (`Canvas.tsx:274-286`) also takes the drawn blocks. When the latest block end passes the
    hard end, the axis runs to that end rounded up to the hour (`ceil(end / 60) × 60`), capped at 30:00
    (06:00 next morning), and tick labels past 24:00 read as wrapped clock times ("01:00"), matching the
    engine's `formatClockMins`. Fit day rescales.
- **Tests first.** On B4 after a run: one row per event T2's function names (the set T2's J1 measured),
  each with its finish. A placement moved by `updatePlacement` to a later `start_time` whose last phase
  then ends past 22:00 gives the row, and restoring the start clears it (the UI has no time-drag).
  `Canvas.test.tsx:283-310` gains the grown-axis case and the cap. *Guard*: the default 09:00–22:00 axis.
- **Reviews.** Test quality, spec, `react-code-reviewer`.
- **Smoke.** The driver gains a B4 check, reached through `choosePreset('B4')` (boot opens B1): after the
  auto-run the overrun rows show, and the existing block-inside-grid check (`smoke.mjs:1224-1234`) is
  generalised in place to every block on the board.

Commit: "018 T3: the overrun on the board".

### T4: fencer counts the engine can size (R5, R6)

- **Intent.**
  - `MAX_FENCERS` becomes 336 (`constants.ts:126`, and `factories.ts:66` in the same commit).
    `MIN_FENCERS` stays 2.
  - Load (`serialization.ts:258`) refuses a count that is not a whole number or lies outside
    `MIN_FENCERS`–`MAX_FENCERS`, with a reason naming the event and the bounds. Files already show their
    reason (`ExportPopover.tsx:57-59`). For links (R7), `bootstrap` (`boot.ts:28-31`) stores the reason
    in a new store field before falling back to B1, and a dismissable notice at the top of the center
    view (beside 017's stale banner region, never inside it) shows it until dismissed or until the next
    load succeeds. The `console.error` stays.
  - `addCompetition` takes its count from the table for the current tournament type: NAC →
    `NAC_FENCER_DEFAULTS`, every type in `REGIONAL_CUT_TOURNAMENT_TYPES` (ROC, RYC, SYC, RJCC, SJCC) →
    `REGIONAL_FENCER_DEFAULTS`. A test pins that both tables give every catalogue id a default in
    2–336 (measured 120/120, max 310), so `?? 0` can never fire.
  - The fencer-count input (`EventsPanel.tsx:137`) gains `max={MAX_FENCERS}`.
  - Engine backstop: one predicate for "this count can be sized" (a whole number inside the config's
    `MIN_FENCERS`–`MAX_FENCERS`), used by `fencer-count-bounds` (`validation.ts:149-153`, so NaN and
    Infinity raise it) and replacing the ad-hoc filters at `analysis.ts:56`, `capacity.ts:112`,
    `stripSearch.ts:122`, `:200`. It guards every unguarded pool-math caller: `analysis.ts:130`, `:156`,
    `derive.ts:92`, `:293`, `flighting.ts:38-39`, `:96`, `:166`, `validation.ts:247`, and the
    `poolCountFor` callers `stripBudget.ts:70`, `:141`. `refs.ts:24` takes no config, so it is guarded at
    its callers. An unsizeable event is skipped, never thrown on: `deriveEventSchedule` returns no result
    for it, so the drawn board counts it not placed.
- **Tests first.** The first red test: a `#config=` payload with `fencer_count` 0 is refused by
  `deserializeState` with a reason (today it loads). Then 1, 1.5, 337 and `1e999` refused. *Guard*: 2
  and 336 accepted. `initialAnalysis` with a count of 0 does not throw. `addCompetition` gives a non-zero
  in-range count. `validateConfig` raises `fencer-count-bounds` for NaN and Infinity without throwing.
- **Tests that flip:** `validation.test.ts:238-250` (500 is now an ERROR), `stripBudget.test.ts:88` (490)
  if `recommendRefCount` gains the predicate, the stale `capacity.test.ts:751` comment.
- **Drift review (2 judges).** J1: snapshot byte-identical, B1–B8 and templates unchanged (no count
  exceeds 320), `factoryParity` green. J2: every pool-math caller of `fencer_count` is guarded or
  provably guarded upstream (grep), with `concurrentScheduler.ts:417` and `:1801` named.
- **Reviews.** Test quality, spec, `react-code-reviewer`.
- **Smoke.** A link with a count of 0, opened on its own page (the main page fails on any
  `console.error`, `smoke.mjs:122`, `:1716`), boots a working B1 shell with no error boundary and no
  `pageerror`, and shows the refusal notice naming the event. Dismissing it removes it.

Commit: "018 T4: fencer counts the engine can size".

### Task S: the final live smoke

Two consecutive full passes on the final head, 0 console errors.

### Task D: docs

`backlog.md`: mark the three entries "Fixed by 018" (kept, as 017 did), and the two fencer-count filter
entries T4 closes (`:724-735`, `:1145`). Narrow the Div 1 bullet and the `validation.ts` note's
"Cadet, Junior and Div 1". Add entries for what 018 leaves: the unenforced 4:00 PM pool cutoff,
`memoizeOnDeps` caching a throw (`derived.ts:84-85`), the `validation.ts` cut-share mismatch, the dev
tool `asciiLaneRenderer.ts:64`, `:129-131` clipping at the hard end, every Veteran age group sharing one
default count (a NAC V80 starts at 120), the late-finish row's unwrapped "25:00" labels, the `'TIME'`
label in the overrun window, and a `§What 018 deliberately left unfixed` index.
`competition-planner-workbench.md`: row 018 delivered, with the new baseline.

### Task H: handoff

`specs/018-engine-correctness/handoff.md` in 017's shape: what changed, measurements and chain,
reviews, decisions made on the owner's behalf with their cost, left unfixed, resume prompt for 019.

### Task M: the merge check

`git merge-tree --write-tree main 018-engine-correctness`. If main has not moved the tree equals the
branch's, and the branch's own checks cover it. Otherwise check out the merged tree in a detached
throwaway worktree and run the full suite, `tsc -b`, lint and the ledger there.

## Decisions made on the owner's behalf

1. **The WARN's finish is the last phase's end**, the quantity the hard end has always checked. Cost:
   five placed events already end past 22:00 only by their gold/bronze tail (B2 ×1, B4 ×1, B6 ×3) and
   still get no hard-end WARN. The per-day late-finish row and `day-ends-past-target` count the tail.
2. **`latest_end` stays a hard per-event limit.** It is `Infinity` on every app and ledger path, so only
   tests see it.
3. **Order T1 → T2 → T3 → T4.** T1 is the smallest drift and gives T2 a settled ledger. T4 is expected
   to move nothing.
4. **The 4:00 PM pool cutoff stays unenforced and as written.** Enforcing it would drop pools that start
   after 16:00 today (B4 16:05, B6 16:25). Backlog.
5. **`validateSameDayCompletion`** (no callers, and its 780-minute window now disagrees with §Single-Day
   Fit) is left for 021's dead-code sweep.
6. **A last phase whose ready time equals the hard end exactly** still places when it ends by the hard
   end (a zero-length DE), since the rule keeps today's "ends by the hard end" branch.
7. **The overrun row is dismissable**, like the late-finish row.
8. **The axis cap is 30:00** and labels past midnight wrap. Cost: a crafted link that starts a placement
   after 06:00 the next morning still draws past the axis.
9. **Default table by type**: SYC and SJCC use the regional table, decided here because no template uses
   them.
