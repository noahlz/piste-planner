# 021 METHODOLOGY reconciliation – plan

> **For agentic workers:** the orchestrator writes no code. Each task is one to three subagent dispatches
> of 2–4 steps, then its review wave (test quality, spec, drift judges where the engine moved, React
> where UI changed), one bundled fix round, then the live smoke where the task changes what the app
> shows, then its commit inside the worktree. A task split into several commits runs this cycle once
> per commit, so every commit body carries its own judges' verdicts. Planning and implementation run in
> this one session, driving the worktree from the main checkout with absolute paths.

**Status:** draft, 2026-10-08. Waits on the owner's approval of [`amendment.md`](./amendment.md). The owner
answered the first draft's Open items 1, 3 and 7 and confirmed the Y10↔Div 3 scope (O7–O10), and the
amendment's four remaining notes are settled by their defaults unless the owner objects (see
[Notes for the owner](#notes-for-the-owner)). No code task starts before A0 commits it.

**Goal:** METHODOLOGY.md and the engine say the same thing. The spec is amended only where an owner
ruling or a default below gives the reason, and everywhere else the engine moves to the spec: the
retired time-of-day weights and the dead code go, the waits the spec describes really bind, weapon
balance and the Y8/Y10 bonus are scored, and the 4:00 PM cutoff and video-strip preservation are
enforced as written.

**Sources:** roadmap row 021 (`docs/design/competition-planner-workbench.md`), backlog §METHODOLOGY.md
and the engine have diverged, §Dead code held back from the 2026-09-01 sweep, §Calibration debt,
`docs/design/methodology-reconciliation.md`. The audit (32 agents, 16 groups, every item verified) is
condensed in [`audit.md`](./audit.md), and the rulings and defaults it led to are in
[`decisions.md`](./decisions.md), both beside this plan. The amendment carries every ruling and default
that changes the spec, and this plan cites audit items by id. Where a verifier corrected an item, the
correction wins. Audit probe logs sit git-ignored in `<wt>/tmp/021-audit/`.

## Owner rulings (2026-10-08, this session)

Full text in `decisions.md` and in the amendment's blocks.

| # | Ruling | Task |
|---|---|---|
| O1 | **Vet co-day order.** Age-banded Vet bands of one gender and weapon start oldest first with a 60-minute stagger: each younger band's pools become ready 60 minutes after the next-older band's pools start. Strict end-to-end serialization leaves the spec. The 2-hour offset applies to Vet Combined only, and Vet 60/70/80 lose it. The wait must really bind. Unsourced, listed in Appendix B. *Superseded in part by O13: Vet Combined's offset is retired too.* | T6 |
| O2 | **4:00 PM pool cutoff** stays as Piste Planner's own unsourced rule: an event whose first pool phase (pools or Flight A) starts later than day start + 7 hours is placed with a WARN carrying the start. Nothing is dropped or moved. | T7 |
| O3 | **Day count.** Day assignment uses every day the organizer chose. The inert Phase 1 pass, `chromaticN`, `capacityDemandedDays`, `CAPACITY_TARGET_FILL` and `MAX_EXPANDED_DAYS` go. The calibration scenario is not added, and the backlog item closes with a written record. | T2, D |
| O4 | **Weapon balance.** No day holds only one weapon class. Day-level, both genders and team events pooled, flat 0.5. Skipped when the tournament lacks a class entirely. O7 settles the reading. | T4 |
| O5 | **Video strip count** is any count from 0 to the strip total at any type, default 8 at a NAC. Doc only. | A0 |
| O6 | **Y8 with Y10.** A −0.4 same-day bonus for Y8↔Y10 of the same weapon and gender, and for Y10↔Div 3. The term needs its own lookup, because the constraint graph drops weight-0 edges. *O12 lowers the bonus to −0.3.* | T5 |
| O7 | **Weapon balance reads "keeps"** (second round). The owner: "whichever option avoids having a day where only epee is scheduled on that day (we need to balance ROW weapons with epee)". An event that leaves its day one-class pays +0.5 (the first event on an empty day, and every later same-class event on a day that still holds one class), an event that brings the missing class earns −0.5, and an event on a day holding both classes pays 0. Chosen on the 49-board probe (see Measurements). | T4 |
| O8 | **An unplaced predecessor** (second round). The wait lapses: the waiting event's pools are ready as if the event waited on did not exist, from day start or any other floor that applies to it, such as the regional Group 1 window. One identical clause in amendment Blocks 44, 88, 83 and 66. | T6a |
| O9 | **Y10↔Div 3** (second round). Same weapon and gender, as drafted. | T5 |
| O10 | **The cutoff on the board** (second round). The store's board check emits `pool-start-after-cutoff` for engine-placed and hand-moved events, as drafted. | T7 |
| O11 | **The Veteran co-day is not a departure** (owner annotation). Veteran age bands are one event split by age band, so the manual's adjacent-age rule never applies. Doc only: amendment Blocks 90, 85 and 3. | A0 |
| O12 | **The Y8↔Y10 and Y10↔Div 3 bonus is −0.3** (2026-10-10, METHODOLOGY follow-up A1). B6 places 53 at −0.05 through −0.3 and 51 at −0.4. T5 runs last. | A1, T5 |
| O13 | **The Vet Combined start offset is retired** (2026-10-10, A1). No Veteran event has a fixed start offset. B6 places 53 only at offset 0. T6b becomes a pure removal of the never-read `earliest_start_offset` field. | A1, T6b |

Standing decisions that bind every task: no hard pair is ever relaxed (019), no backwards compatibility,
the engine follows the 2026-27 Ops Manual's planning figures, and every METHODOLOGY text change is
owner-approved before its commit.

## Global constraints

- `<wt>` = `/Users/noahlz/projects/piste-planner/.claude/worktrees/021-methodology-reconciliation`,
  branch `021-methodology-reconciliation`, cut from `main` `5edbdf7712`. Agents commit there only, at the
  commit points each task names. Never push, merge, rebase, `reset --hard`, delete branches or make the
  closing commit. The user merges with `merge-with-costs`.
- **Plan commit first.** Before A0, the orchestrator commits `specs/021-methodology-reconciliation/`
  (this plan and the approved amendment) as "021 plan: METHODOLOGY reconciliation", its body recording
  the baseline below. Every judge and the handoff diff from that commit.
- **Baseline** (measured in the worktree, 2026-10-08): 96 files / 3252 tests, `tsc -b` and lint clean,
  ledger SHA-256 `32a4e0afb45abfbf8239f7bdbc15dda9eb1487c959893442b6029a6d0998b260`, B1–B8 scheduled
  24 / 24 / 24 / 24 / 12 / 51 / 18 / 53, ERRORs 0 / 0 / 0 / 6 / 0 / 3 / 0 / 0, boot footers 24/0, 24/0,
  24/0, 24/6, 12/0, 51/3, 18/0, 53/0.
- **Commands**, never `cd`. Read logs only on failure.
  - suite: `timeout 300 pnpm -C <wt> --silent test --exclude 'tmp/**' > <wt>/tmp/<name>.log 2>&1`
    (`vitest.config.ts` does not exclude `tmp/`, and probes live there)
  - one file: `timeout 180 pnpm -C <wt> exec vitest run <file> > <wt>/tmp/<name>.log 2>&1`
  - `timeout 180 pnpm -C <wt> exec tsc -b > <wt>/tmp/tsc.log 2>&1`
  - `timeout 120 pnpm -C <wt> --silent lint --ignore-pattern 'tmp/**' > <wt>/tmp/lint.log 2>&1`
  - ledger SHA: `shasum -a 256 <wt>/__tests__/engine/__snapshots__/driftLedger.test.ts.snap`
  - live app: `pnpm -C <wt> dev --port 5190 --strictPort`, then
    `SMOKE_BASE=http://localhost:5190/piste-planner/ timeout 240 node <wt>/scripts/smoke.mjs`
- **Test-first** (constitution II). Each behaviour test fails first on its assertion, with new exports
  stubbed at their declared signatures so the failure is an assertion and not an import, and the
  dispatch records the red reason. Tests marked *guard* pass before and after by design. A pure deletion
  has no red step: its proof is the suite, `tsc -b` and lint green with the symbol gone and a grep
  that finds no reference.
- **Engine rules.** `src/engine/` stays pure. `as const` objects with derived unions, never enums. Every
  loop has a direct bound or a max-iteration guard that throws (constitution IV), T6's re-check
  included.
- **020's rules for later features.** Anything the engine reads stays in `configKey`. Tests that call
  `bootstrap` clear `VIEW_STATE_STORAGE_KEY` per test. Store writes go through actions. A smoke step
  that edits an input calls `settleBoard`. A per-event derivation change also changes
  `__tests__/helpers/scenarios.ts` and `__tests__/store/factoryParity.test.ts`. Removing a
  `TournamentConfig` field changes `types.ts`, `constants.ts`, `buildConfig.ts`,
  `__tests__/helpers/factories.ts` and `buildConfig.test.ts` in one commit (audit P3), and a removed
  `Competition` field also leaves the `buildConfig-preShrink-nac-vet-div1-junior.json` fixture and its
  docblock (024's precedent). No 021 task adds an engine-read store field, so `selectConfigKey`'s memo
  deps (`configKeyDeps`) and the `inputEdits.ts` proxy list stay as they are. A task that finds it needs
  one stops and reports.
- **Drift ledger** (constitution III). Run `__tests__/engine/driftLedger.test.ts` after every engine
  change and follow its header. A floor may rise deliberately when packing improves, with a dated entry.
  A floor may drop only under one of the two admitted lowerings (input correction, policy amendment)
  and with the owner's sanction. **A drop halts the task, and it goes to the owner.** The ledger also
  holds two two-way pins: B4's exact `toBe(24)` and `SCENARIOS_WITH_DAY_SUMMARY = ['B4', 'B6']`, which
  is asserted in both directions. A task that moves either one updates that assertion in the same commit
  with a dated entry like the existing ones (events in and out, equal to the app path). A B4 drop halts
  like a floor drop.
- **New rule ids.** `pool-start-after-cutoff` (T7) gets the new `BottleneckCause.POOL_START_AFTER_CUTOFF`
  and `vet-co-day-split` (T6c) gets `BottleneckCause.VET_CO_DAY_SPLIT`, so the ledger's
  `warnCountsByCause` and every judge key on the same names. Each new rule also takes a row in
  `__tests__/helpers/bottleneckInvariants.ts`'s `CAUSE_OF_RULE` (tsc forces it), and its findings must
  pass `checkInvariants` (the owner and every competition id the message names are in `subjects`).
  `vet-co-day-split` joins `bottleneckSubjects.test.ts`'s day-scoped list if its owner is a day.
- **Drift reviews.** Read-only judges of at most four items each, run in parallel (Sonnet). A
  counterfactual or control run that needs a code change gets a judge of its own and runs in a detached
  throwaway worktree that the judge removes. Every drift task's J1 also reports B1–B8
  `stripRecommendation` before and after, and confirms that a scheduled count moving alongside it has
  one named cause, not the Suggest search (the ledger header halts on that pairing otherwise). Referee
  fields (`refRequirementsByDay`, `daySummaryPeaks`) are expected churn and need no prediction. Then `dev-workflow:test-quality-reviewer` after test edits and
  `dev-workflow:react-code-reviewer` after React edits (both Sonnet), and a spec review of the diff
  against the amendment.
- **Commit bodies** record: files / tests counts, `tsc -b` and lint, the ledger SHA, B1–B8 scheduled
  and ERRORs, B1–B8 `stripRecommendation` before and after (53 / 75 / 73 / 74 / 29 / 63 / 82 / 56 at
  base), per-scenario drift and its cause (events in and out where a count moves), the judges and
  their verdicts, and any deliberate correction, in the shape of 018 T2 (`31ce0c3017`), 019 T1
  (`2873108b98`) and 024 group B (`e9cf15518c`, a Before/After table).
- **Live smoke** (constitution VI), in its own Sonnet subagent with the `live-smoke` skill, after every
  task that changes what the app shows (T3–T8, and T6c's Findings row). The smoke runs after the fix
  round and before the task's commit, and a driver change or pin update goes into that same commit, with
  the store-path measurement in its body. Extend `scripts/smoke.mjs` in place, never rewrite, and update
  it in the same task that reshapes the UI. The driver's measured pins are: the B1 boot footer
  "24 placed · 0 unplaced", the B1 peak referees 210, SC-008's Suggest 103 for NAC Vet/Div1/Junior, the
  B4 overrun trio with exact end times (CDT-W-FOIL-IND 23:10, CDT-W-SABRE-IND 23:15, Y14-W-EPEE-IND
  23:30), the B4 block ending after 22:00, the B1 headline move's "23 placed · 1 unplaced" (D1-M-EPEE-IND
  finds no room on the next day), NAC Vet/Div1/Junior's block ending after 19:00, and the row counts
  12 / 24 / 66 / 24. The smoke subagent never edits a pin or "repairs" one as a locator. When one moves,
  it reports the number, the orchestrator measures it through the store path to name the task and cause,
  and a dispatch updates the pin with a dated `[M]` comment.

## Measurements the plan rests on

Each is the audit's `[M]` figure at `5edbdf7712` (verifier's figure where it corrected the auditor).

- **Time-of-day constants are inert** (W2, K3). Setting `SAME_TIME_WINDOW_MINS`, `EARLY_START_THRESHOLD`
  and `THRESHOLD_MINS` to 9999 left B1–B8 output byte-identical (`G01v-verify.log`). The 8 time-of-day
  keys, the `LAST_DAY_REF_SHORTAGE_*` trio and five time-of-day `BottleneckCause` members have no reader
  (W2, LR, UX-dead-enum-members). 8 of 20 `PENALTY_WEIGHTS` keys are read (PW).
- **Test-count arithmetic** (P3, DS, V2, D2d). `keptRun.test.ts`'s `it.each(configFields)` loses one case
  per removed `TournamentConfig` field, and its `it.each(competitionFields)` loses one per removed
  `Competition` field (2 in T1b-1, 2 in T3-2). `daySequencing.test.ts` holds 14 tests (one file). The
  `validateSameDayCompletion` describe holds 4. `stripBudget.test.ts` holds 9 `recommendRefCount` cases,
  and `sizeableCount.test.ts`'s `recommendRefCount` case is an `it.each` over the 7 `UNSIZEABLE` values,
  so T1c drops 9 + 7 = 16. Each commit records its count chain.
- **The ledger digest carries 8 `refRecommendation` blocks** (D2d). Deleting the field changes the SHA
  while no scheduling number moves.
- **Day count** (CAL-P1, CAL, CAL-CAP). `chromaticN` equals `days_available` in all 48 B1–B8 rows at 2–4
  days and in 140 of 144 template rows (the 4 exceptions: RJCC Weekend at 5 days). Fill 0.2–1.0 changes
  no day map and no count. Exact hard chromatic numbers are 2 / 3 / 2 / 2 / 2 / 1 / 3 / 3, below every
  native day count. At 5 days B5 and B7 use 4 today. The ledger is unchanged under "use every day".
- **Weapon balance** (WB, WB-M, then the O7 probe). The audit's delta-form probe took B6 51 → 53 scheduled,
  ERRORs 3 → 1. Size-weighting loses a B6 event. B4's 24 scheduled events hold three per-gender
  single-class days that the coloring of all 30 hides (its 6 ERRORed events drop out), so single-class
  days are measured on the scheduled output. The O7 probe then measured three variants – none (no term),
  delta and keeps – on 49 boards: B1–B8, and each of the 10 templates at NAC 4 days, ROC 4 days and its
  `TEMPLATE_MIN_DAYS` where that is not 4 (templates on 80 strips, video strips at the type default,
  days set before `applyTemplate`). The term was injected through a `vi.mock` wrapper around
  `saberPileupPenalty`, with the event itself excluded from the day state, and measured on `scheduleAll`'s
  output over the assigned days of placed events. The baseline matches the audit's G02 none run.
  - No variant leaves an all-épée pooled day on any board. Pooled one-class days: none 7 (all ROW),
    delta 1 (all ROW, RJCC Weekend at ROC 4 days, day 3, which delta creates), keeps 0. Keeps won on
    that one day. Delta was ahead on the next tiebreak, which was not reached: per-gender one-class days
    none 51, delta 34, keeps 40 (épée-only 6 / 5 / 5).
  - Scheduled and ERRORs over all 49 boards: none 1050 / 107, delta and keeps 1055 / 102. The gains are B6
    (+2) and NAC Vet/Div1/Junior (+2 at NAC 4 days, +1 at ROC 4 days). Events moved against none: delta
    374, keeps 378. No board's pooled count got worse under keeps.

  | Board | none sched/ERR, pooled, per-gender | delta: pooled, per-gender, moved | keeps: pooled, per-gender, moved |
  |---|---|---|---|
  | B1 | 24/0, 0, 2 | 0, 2, 10 | 0, 2, 10 |
  | B2 | 24/0, 0, 1 | 0, 0, 11 | 0, 1, 0 |
  | B3 | 24/0, 0, 0 | 0, 1, 17 | 0, 1, 17 |
  | B4 | 24/6, 0, 3 (M épée incl.) | identical | identical |
  | B5 | 12/0, 0, 2 | 0, 3 (W épée), 6 | 0, 3 (W épée), 6 |
  | B6 | 51/3, 0, 0 | 53/1: 0, 0, 35 | 53/1: 0, 0, 40 |
  | B7 | 18/0, 1 ROW (day 3), 2 | 0, 2, 12 | 0, 2, 12 |
  | B8 | 53/0, 0, 0 | 0, 0, 41 | 0, 0, 41 |
  | NAC Vet/Div1/Junior @NAC 4 | 60/6, 0, 0 | 62/4: 0, 0, 29 | 62/4: 0, 0, 49 |
  | NAC Vet/Div1/Junior @ROC 4 | 61/5, 0, 1 | 62/4: 0, 0, 30 | 62/4: 0, 0, 43 |
  | ROC Div1A/Vet @NAC 4 and @ROC 4 | 12/0, 2 ROW, 5 | 0, 0, 9 | 0, 0, 9 |
  | ROC Div1A/Div2/Vet @NAC 4 and @ROC 4 | 18/0, 0, 2 | 0, 1, 13 | 0, 4 (W épée), 12 |
  | RYC Weekend @ROC 4 | 18/0, 2 ROW, 6 | 0, 3, 11 | 0, 4, 15 |
  | RJCC Weekend @ROC 4 | 12/0, 0, 4 | 1 ROW (day 3), 4, 10 | 0, 4, 8 |
  | NAC Youth @NAC 4 | 24/0, 0, 2 | 0, 1, 15 | 0, 0, 11 |
  | NAC Youth @ROC 4 | 24/0, 0, 2 | 0, 3, 18 | 0, 3, 18 |
  | Cadet/Junior @ROC 4 | 24/0, 0, 0 | 0, 0, 10 | identical |
  | ROC Mega @ROC 4 | 42/0, 0, 0 | 0, 0, 30 | 0, 0, 30 |
  | RYC Weekend @NAC 4 | –, 0, 2 | 0, 2, 11 | 0, 2, 11 |
  | RJCC Weekend @NAC 4 | –, 0, 4 | 0, 2, 7 | 0, 2, 8 |
  | Junior Olympics @NAC 4 | –, 0, 2 | 0, 3, 13 | 0, 2, 3 |
  | Junior Olympics @ROC 4 | –, 0, 3 | 0, 2, 14 | 0, 2, 14 |

  Sched/ERR is shown where the probe reported it, and it is unchanged by either term unless the row gives
  a new figure. Identical in all three variants: Cadet/Junior and Div1/Junior @NAC 4 (24/0), Div1/Junior
  @ROC 4 (24/0), ROC Mega @NAC 4 (42/0), and every template at its `TEMPLATE_MIN_DAYS` (NAC Youth @NAC 2
  13/11, @ROC 1 7/17, Cadet/Junior and Div1/Junior @ROC 2 19/5, Vet/Div1/Junior @ROC 3 46/20, ROC Mega
  @NAC 2 38/4 and @ROC 1 19/23, RYC Weekend @ROC 1 16/2, ROC Div1A/Vet 12/0, and the rest).
- **Y8/Y10** (L9b). `getProximityWeight(Y8, Y10)` = 0 and Y10–Div 3 = 0 at all six types: nothing scores
  either pair. No count or day-map probe exists for T5. The ledger snapshot also limits where it can act:
  B3 holds no Y8 and no Div 3, and no B1–B8 scenario holds a Div 3 event, so only B4 and B6 (6 Y8 and
  6 Y10 each) can move, and the Y10↔Div 3 half runs only on the templates.
- **Vet waits never bind** (DS-EDGE, L13, R9). B8: 60 same-day age-banded pairs, 0 ordered, 21 start
  younger first, 0 `CROSS_EVENT_DEPENDENCY_DELAY`. NAC Vet/Div1/Junior on B1's board: 0 of 60, 35
  inverted. Each sibling's first phase is seeded at day start and popped before the older sibling's
  last phase is RUNNING, and nothing re-queues it. Ind→team on a 1-day board: Div 1 M Foil individual
  and team both start at 0 against a required ≥ 500. A 60-minute stagger prototype kept B8 at 53 and
  moved Suggest for NAC Vet/Div1/Junior 103 → 110, measured at `7975e4efea`, before 018–020, so T6
  re-measures it.
- **Vet start offset** (L8). 25 of 35 scheduled old-Vet events start before day start + 120 (B1 3, B6 3,
  B8 19). +120 on all four bands kept every count and moved 8 / 37 / 42 events on B1 / B6 / B8, while +60
  dropped B6 to 50 (4 ERRORs), so B6 is sensitive to Vet start times. O1 keeps the offset for Vet
  Combined only, and every measurement predates T4 and T5, which repack B6, so T6 re-measures. *Superseded
  by O13: re-measured at T4's head, B6 kept 53 only at offset 0, so the Vet Combined offset is retired.*
- **Co-day splits** (R7b). Unpinned runs never split (0 of 6138 probes). A pin splits silently: v40 pinned
  with Vet team on day 0 sends v50 to day 2 with no violation and no WARN.
- **Pools after 4:00 PM** (K2). B4: Y12-M-SABRE-IND at 16:05. B6: CDT-W-FOIL-IND at 16:25, JR-W-EPEE-IND and
  Y12-W-EPEE-IND at 17:35, VET-M-SABRE-IND-VCMB at 20:25. No flight starts after 16:00 anywhere. NAC
  Vet/Div1/Junior on B1's board has 5 (16:05–16:45).
- **Video preservation** (V26). No B1–B8 day holds a single event. Mid-day pool phases on video strips:
  B1 0, B2 4, B3 2, B4 8, B5 0, B6 15, B7 0, B8 3. The literal every-day rule drops B4 24 → 20 and B6 51 → 49.
  Scoped to days with a required video phase, counts and ERRORs hold and video delay sums move B2
  187 → 232, B3 566 → 441, B8 1444 → 1449 minutes.
- **Flighting** (PT-22, PT-23, L15, R4). B1–B8 hold no flighted event. Flight B's gap is 30–34 minutes,
  never 15. `FLIGHT_B_DELAYED` fires on 12 of 18 single-event runs with no contention (every run whose
  Flight A ends off a 5-minute slot). A flighted 200-fencer event on 20 strips is an ERROR today and
  places with halving (Flight A 15 strips, B 14). A flighting group on B1 empties the board (0 / 24), and
  no app path can form one.
- **Unreachable rules** (R6b, V2). The catalogue has 96 individual keys with one event each, so the
  same-population count rule fires only below 1 day, which `days-available-bounds` already catches.
  `validateSameDayCompletion` fires on 0 of 239 events.

## Plan review (2026-10-08)

Four lenses read the draft against decisions.md, the amendment, the audit and the source at `5edbdf7712`:
owner rulings (14 findings), engine mechanism (14), drift and ledger (11), UI and smoke (9). Each finding
went to a verifier. 48 findings: 7 must-fix, 29 should-fix, 12 nits. 42 were confirmed and 6 partly
confirmed (rulings-9, drift-4, drift-8, ui-smoke-5, ui-smoke-6, ui-smoke-8). None was refuted.

Folded, all 48 in whole or in part:

- **Must-fix.** T4's second test now pays 0 under the delta form, and the O4 row states the delta
  (rulings-1, drift-2), both since replaced by the owner's "keeps" reading (O7). A0 waits on the
  owner's answers to the amendment's Open items (answered as O7–O10), and the lapse question moved from the plan's own decisions to the owner (rulings-2). T6a's mechanism is fixed – a
  held set, release on the anchor's placement or permanent failure, and a post-loop assertion – because a
  same-time re-queue spins on B8 and a placement-time floor starves silently
  (mechanism-t6a-requeue-spins, -held-starvation). The ledger table compares T2 and T3 against T1c's SHA
  (drift-1). T6, T1b and T3 run a review and judge per commit (drift-3).
- **Should-fix.** The cutoff WARN follows the overrun WARN's store path, and the amendment puts the
  cutoff on the hand-move lists for the owner (rulings-3, mechanism-t7-board-path, ui-smoke-1). T6
  gains a test that rejects serialization, the anchor and missing-band cases, a late-arriving older
  band, emission of `cross-event-dependency-delay`, the floor on `EventState` for retries, edge anchors,
  a named stagger constant and the `applyCrossEventEdges` wiring (rulings-4, -5, -7,
  mechanism-t6a-retry-interplay, -edge-anchor). T6b tests a non-first, non-9:00 day and a retry (rulings-8).
  T6c makes the row undismissable in `derived.ts` with a store test and a smoke check (rulings-6,
  mechanism-t6c-dismiss-and-board, ui-smoke-2). T4 and T5 pin O4's and O6's scope and both directions
  (rulings-9, rulings-10). T8 rewrites the restored cases for video days, adds boundary and pin cases,
  says where the day facts come from and lists the backstop (rulings-11, mechanism-t8-predicate-inputs).
  T1b-1, T2 and T3-2 list their unlisted breaks (mechanism-t1b1-unlisted-breaks, -t2-scheduler-guard,
  -t3-2-unlisted-breaks). Global constraints add the two-way ledger pins, `stripRecommendation`
  reporting, the smoke order and every measured smoke pin (drift-5, drift-4, drift-7, ui-smoke-4).
  Judges stay at four items, with control runs on judges of their own (drift-6). B6 is named a T6 risk
  (drift-8). T5 is marked unmeasured, probed first and limited to B4 and B6 (drift-9). T3 gets concrete
  smoke steps (ui-smoke-3), T8 a smoke step (ui-smoke-5), and every task a Review line (ui-smoke-6,
  drift-12).
- **Nits.** Flight A contention and ordering cases (rulings-12), A0 names all 97 blocks (rulings-13),
  named causes and `CAUSE_OF_RULE` rows (rulings-14, mechanism-new-rules-invariants), the Vet team
  counterpart in Task D (mechanism-t6-vet-team-counterpart), the `CATEGORY_START_PREFERENCE` site and
  guard (mechanism-t6b-constants-site), the count chain (mechanism-count-chain), Task M's `commit-tree`
  and `pnpm install` (drift-11), a live stagger check (ui-smoke-7), the store-field line (ui-smoke-8), and
  the `dayOf` docblock (ui-smoke-9).

Declined in part, on the verifiers' notes:

- rulings-12: no `calculateFlightedStrips` test. It splits strips by the role its caller assigns, and the
  suggestion test already covers the caller.
- drift-4: no prediction for `refRequirementsByDay` and `daySummaryPeaks`. The ledger header treats
  referee changes as expected churn.
- drift-8: no extra J3 count or halt note. A drop already halts under Drift ledger, and J1 reports counts.
- ui-smoke-8: `invalidState.test.tsx`'s direct `setState` stays. It predates 020, and 020's rule covers
  new writes.
- ui-smoke-6: its premise that the header was the only cover. Global constraints already require the
  reviewers, so the per-task Review lines are for consistency.

## Design in brief

Three phases. **Paperwork first:** A0 puts the owner-approved text into METHODOLOGY.md alone, so every
later commit is checked against a fixed spec. **Then parity work that moves no scheduling number**
(T1a–T3): retire the time-of-day config, delete dead engine code and wire the two unread constants,
drop `recommendRefCount` from the ledger in a commit of its own so its SHA change is isolated, drop the
inert day-count pass, then fix flighting, which no ledger scenario exercises. **Then one drift-moving
rule per commit** (T4–T8), in an order that keeps each drift attributable: the two day-assignment terms
(T4 weapon balance, T5 the Y8/Y10 bonus) separately, then the within-day waits (T6), then the WARN that
reads the final pool starts (T7), then video preservation (T8). Each drift task's judges compare
against the previous task's head, with a control run where a mechanism must be isolated.

| Task | Ledger expectation |
|---|---|
| A0, T1a, T1b | Byte-identical to the base SHA (`32a4e0af…`). Any change halts the task for diagnosis. |
| T1c | SHA changes. The old snapshot minus its 8 `refRecommendation` blocks equals the new one byte for byte. |
| T2, T3 | Byte-identical to T1c's recorded SHA (named in T1c's commit body). Any change halts the task for diagnosis. |
| T4 | Day maps move on 6 of 8 scenarios (B2 and B4 unmoved). B6 rises to 53 (ERRORs 3 → 1), other counts hold. Measured for the keeps reading (O7). |
| T5 | Unmeasured. Day maps can move on B4 and B6 only (see Measurements). Counts must hold. |
| T6 | Pool starts move on B8 (stagger). Counts must hold, and B6 and B8 are the risks. T6b (redefined by O13) is byte-identical to T6a's commit. |
| T7 | `warnCountsByCause` gains the new cause on B4 and B6 (1 and 4 at base, re-measured on T6's head). Counts, ERRORs and every time unchanged. |
| T8 | Times move on days with a required video phase (B2, B3, B8 at base). Counts must hold. WARN counts may move. |

T4–T8 may also move B1–B8 `stripRecommendation`, which every drift J1 reports (see Global constraints).

## Tasks

### A0: METHODOLOGY amendment (docs, owner-approved text)

- **Before A0.** The owner's answers O7–O10 are in the K cluster files and in `amendment.md` (O7's
  "keeps" in Blocks 69 and 16, O8's lapse clause in Blocks 44, 66, 83 and 88, O10's four hand-move clauses
  kept), and `tmp/021-amend/apply.py` re-ran clean. The orchestrator records O7–O10 and the four notes'
  defaults in the plan commit's body. If the owner objects to a note's default, the K cluster files change,
  `apply.py` re-runs clean and `amendment.md` is regenerated before A0 applies anything. Note 4 can change
  Blocks 52 and 10 once T8 measures, as a one-line follow-up.
- **Intent.** Apply `amendment.md`'s blocks to `<wt>/METHODOLOGY.md` verbatim, in their numbered order
  (bottom of the file first, so every line number in the amendment holds), and commit them alone. That is
  all 97 blocks, including O5 and every default's doc half (1–14), the new §When Days Are Too Few (`#when-days-are-too-few`) with the TOC and every anchor that pointed at
  §Constraint Relaxation, and §Retired Time-of-Day Preferences (`#retired-time-of-day-preferences`).
- **Checks.** A grep finds no remaining `#constraint-relaxation` anchor. The diff touches only
  `METHODOLOGY.md`. Ledger unchanged (no code).
- **Model.** Sonnet, high effort (mechanical, but bottom-up order matters).
- **Commit:** "021 A0: METHODOLOGY amendment (owner-approved)".

### T1a: retire the time-of-day weights and the dead config fields (defaults 1, 13)

- **Intent.** Delete the 8 time-of-day `PENALTY_WEIGHTS` keys and their comments, the
  `LAST_DAY_REF_SHORTAGE_*` trio, and the five orphan `BottleneckCause` members of those rules
  (`SAME_TIME_CROSSOVER`, the three `SCHEDULED_8AM_*`, `INDIV_TEAM_ORDERING`). Delete
  `SAME_TIME_WINDOW_MINS`, `EARLY_START_THRESHOLD`, `MAX_RESCHEDULE_ATTEMPTS`, `THRESHOLD_MINS` and
  `LATEST_START_MINS` with their `TournamentConfig` fields, following the P3 file set. Keep
  `LATEST_START_OFFSET` (T7 reads it), `MORNING_WAVE_WINDOW_MINS` (T8 wires it), `INDIV_TEAM_MIN_GAP_MINS`,
  `REGIONAL_GROUP_1_WINDOW_MINS` and the Y8/Y10 comparator key (the live parts of the retired rules, W3).
- **Sites.** `src/engine/constants.ts`, `src/engine/types.ts`, `src/store/buildConfig.ts`,
  `__tests__/helpers/factories.ts`, `__tests__/store/buildConfig.test.ts`. The "seven" wording: fix only
  the present-tense clauses that say config reads all seven from `constants.ts` (`buildConfig.ts` already
  lists eight names), and leave the comments that describe the retired 013 settings slice as history
  (K3's correction).
- **Checks.** Suite, `tsc -b`, lint. Tests fall by 5 (`keptRun.test.ts` `configFields`), recorded. A grep
  for every deleted name in `src`, `__tests__` and `scripts` finds nothing. `serialization.test.ts`'s
  inert `THRESHOLD_MINS` key may stay. Ledger byte-identical.
- **Review.** Test quality, spec. No drift judge beyond the SHA and the grep.
- **Model.** Sonnet, high effort.
- **Commit:** "021 T1a: retire the time-of-day weights and their dead config".

### T1b: delete dead engine code and wire two unread constants (defaults 10, 13, R6b)

Two dispatches, each its own commit, to stay within the step cap.

- **T1b-1 – deletions.** `src/engine/daySequencing.ts` and its test, then `Competition.optional` (read
  only there), `proximityPenalty` with `PROXIMITY_PENALTY_WEIGHTS`, `individualTeamProximityPenalty`
  (then the `ScheduleResult` import in `crossover.ts` if unused), `SchedulingError`,
  `isRegionalQualifier` with `REGIONAL_QUALIFIER_TYPES`, `genderEquityAllowableDiff` with
  `GENDER_EQUITY_CAP_VIOLATION`, `dayRemainingCapacity`, `weightedStripHours`, `peakConcurrentStrips`,
  `findDayForTime`, the remaining never-emitted `BottleneckCause` members and `Phase.SCHEDULING`
  (UX-dead-enum-members, minus T1a's five and minus the flighting members T3 owns),
  `de_round_of_16_requirement` with `DeStripRequirement` (fixture JSON included),
  `ScheduleResult.conflict_score` and `accepted_warnings` (factory copy included), `validateRefConfig`,
  `RefPolicy.AUTO`, the unreachable same-population count block in `validation.ts`,
  `validateSameDayCompletion` with its tests, and the five unread `CAPACITY_PENALTY_CURVE` members (the
  constant's comment names the live curve: 0 up to fill 0.85, linear to 3.0 at 1.0, then 3.0 + 10 per
  unit past 1.0, capped at 20.0). Leave `validateFlightingGroup` and `flighting_group_id` to T3.
  Knock-on sites: `makeCompetition`'s default `ref_policy` in `factories.ts` becomes `RefPolicy.TWO`, with
  a comment that behaviour is unchanged (`resolveRefsPerPool` and `peakPoolRefDemand` treat every policy
  but `ONE` as 2 per pool). `derive.test.ts`'s `EXCLUDED_DIAGNOSTIC_FIELDS` (type-checked with
  `satisfies`) loses `conflict_score` and `accepted_warnings`, and the `AcceptedWarning` interface goes
  with its only user.
- **T1b-2 – wiring and comments.** Move `INDIV_TAIL_MINS` and `TEAM_TAIL_MINS` beside `tailEstimateMins`
  in `types.ts` (the import-cycle reason, like `DAY_AXIS_SPACING_MINS`) and have it read them.
  `flagFlightingCandidates` takes `(competitions, config)`, computes each event's cap with its own
  `max_pool_strip_pct_override`, and analysis Pass 1 (`initialAnalysis`) iterates its result in place of
  the inline check. Source comments: the four relaxation comments (`crossover.ts` "hard at every
  relaxation level", the `dayAssignment.ts` header, the `concurrentScheduler.ts` relaxation note, the
  Vet↔Division comment in `constants.ts`), the fencer-default provenance comment (C2), and the
  `concurrentScheduler.ts` comparator docblock that names `daySequencing.ts` and overstates the Y8/Y10 key.
- **Tests first.** `flagFlightingCandidates`: a per-event override flags an event the global cap would
  not, and unflags one it would (red against the old signature). Analysis Pass 1's warnings and
  suggestions on B1–B8 and the 10 templates are identical before and after (*guard*). `tailEstimateMins`
  tests stay green (*guard*).
- **Tests that change.** `invalidState.test.tsx`'s list-item count goes 4 → 3 with its comment.
  `validation.test.ts`'s same-population cases and field assertion go. `bottleneckSubjects.test.ts` takes
  another policy rule as its example. `analysis.test.ts`'s gender-equity cases go.
  `concurrentScheduler.test.ts` and `buildConfig.test.ts` drop the round-of-16 field.
  `stripBudget.test.ts` and `sizeableCount.test.ts` move to the new signature. Deleted with their
  symbols: the `proximityPenalty` and `individualTeamProximityPenalty` describes (`crossover.test.ts`),
  the `dayRemainingCapacity` and `weightedStripHours` describes (`capacity.test.ts`),
  `peakConcurrentStrips` (`resources.test.ts`), the `findDayForTime` describe (`dayHardEnd.test.ts`),
  `isRegionalQualifier` (`analysis.test.ts`), `pools.test.ts`'s `AUTO` case, `typeDefaults.test.ts`'s
  "never AUTO" case, `buildConfig.test.ts`'s `comp.optional` assertion, and 2 `keptRun.test.ts`
  `competitionFields` cases.
- **Checks.** Suite, `tsc -b`, lint, a grep per deleted name over code (comments excluded: T1b-2 fixes
  `concurrentScheduler.ts`'s "daySequencing.ts rule 1", and historical comments such as
  `appPathParity.test.ts`'s and `helpers/appPath.test.ts`'s `findDayForTime` and `constants.ts`'s
  `REGIONAL_QUALIFIER_TYPES` are reworded or left as history and listed in the commit body),
  `factoryParity` green. Ledger byte-identical. The commit bodies record the count chain (−14 for
  `daySequencing`, −4 for `validateSameDayCompletion`, the describes above, and the rest as measured) and
  that default 13 overrides backlog §Dead code's "unused exports stay as evidence" for these symbols.
- **Review.** Test quality and spec after each dispatch, before its commit. The judge (SHA,
  `factoryParity`, the analysis guard, and the grep) runs before each of the two commits, and each body
  carries its verdict. A defect found after a commit gets its own "021 T1b: fix …" commit with its own
  measurements.
- **Model.** Opus, medium effort (wide but mechanical). Both dispatches.
- **Commits:** "021 T1b: delete the dead engine code" and "021 T1b: wire the tail constants and
  flagFlightingCandidates, fix stale comments".

### T1c: delete `recommendRefCount` and its ledger field

- **Intent.** Delete `recommendRefCount` and the "recommend ref counts" phrase in `stripBudget.ts`, then
  the imports it alone used (`peakDeRefDemand`, `DeMode`, `Weapon`). Keep `peakDeStripDemand`. In
  `driftLedger.test.ts`, drop `refRecommendation`, `scenarioRefsPerPool` and its docblock, and the
  `resolveRefsPerPool` import if unused. Drop the 9 `stripBudget.test.ts` cases and the
  `sizeableCount.test.ts` `it.each` (7 cases), −16 in all.
- **Checks.** A judge removes the 8 `refRecommendation` blocks from the T1b snapshot and diffs it against
  the new one: byte-identical. Record the new SHA in the commit body. T2 and T3 compare against it.
- **Review.** Test quality, spec.
- **Model.** Sonnet, high effort.
- **Commit:** "021 T1c: drop recommendRefCount and its ledger field".

### T2: use every day the organizer chose (O3)

- **Intent.** `assignDaysByColoring` colors once, at `days_available`. Delete the Phase 1 pass,
  `chromaticN`, `capacityDemandedDays`, `CAPACITY_TARGET_FILL` and `MAX_EXPANDED_DAYS`, and rewrite the
  `dayColoring.ts` header and the expansion comments to say so, and the `dayOf` docblock in
  `src/store/derived.ts`, which says `config.days_available` carries the scheduler's compacted count. A
  grep for "compact" over `src/engine` and `src/store` then finds no stale claim. The load-balance terms
  now run in the one pass. Placing T2 before T4 and T5 means the new terms are added to one pass, not two.
- **Tests first.** RJCC Weekend at NAC through the store at 5 days (`setDays` accepts it) uses 5 days, red
  today (one of CAL-P1's four exceptions). B5 at 5 days uses 5, red today (4). *Guard:* B1–B8 at native
  days unchanged.
- **Tests that change.** The `dayColoring.test.ts` compaction cases rewrite to "uses every day", and the
  `capacityDemandedDays` cases go (the probe failed 4 there). `concurrentScheduler.test.ts`'s "two
  concurrent STAGED events emit independent per-strip DE_ROUND_OF_16 intervals" case (the probe's fifth
  failure) builds `smallConfig({ days_available: 2 })` and guards that both events share a day, so it
  moves to `days_available: 1`. The commit records the count chain.
- **Review.** Test quality, spec.
- **Checks.** Ledger byte-identical to T1c's SHA (CAL-P1 measured it). One judge: SHA, the 10 templates at their
  `TEMPLATE_MIN_DAYS` and at 4 days unchanged, and the boards at 5 days that do change (B5, B7, RJCC)
  listed in the commit.
- **Smoke.** Run once. No driver change expected (the app offers 2–4 days).
- **Model.** Opus, high effort.
- **Commit:** "021 T2: day assignment uses every day".

### T3: flighting follows the spec (default 12)

Two dispatches, each its own commit.

- **T3-1 – behaviour.** The strip precondition halves for a flighted event (`ceil(pools / 2)`, L15).
  Flight A → Flight B waits `FLIGHT_BUFFER_MINS` alone, at every site that places or derives Flight B
  (`concurrentScheduler.ts`'s main loop and pinned path, `derive.ts`), and the comment that claims so
  becomes true. `FLIGHT_B_DELAYED` measures from Flight B's own unblocked ready time. `compareNodes`
  gains a key putting Flight A after Y8/Y10 and before video-required, with its docblock (L11b).
  `suggestFlightingGroups` and `calculateFlightedStrips` flight the larger event.
- **T3-2 – the group path goes** (R4). Delete `flighting_group_id`, `is_priority`, the
  `flighting-group-strips` rule, `validateFlightingGroup` and the enum members only it emits, and the
  group branches in `derive.ts` and `concurrentScheduler.ts`. `MULTIPLE_FLIGHTED_SAME_DAY` stays,
  because analysis Pass 3 emits it too. Both fields go from `Competition` and from `ScheduleResult`
  (`types.ts`, the scheduler's and `derive.ts`'s writes, `makeScheduleResult`, and `derive.test.ts`'s
  type-checked `DERIVED_FIELDS`). Field removal follows the Global constraints file set, plus
  `scenarios.ts` and `factoryParity.test.ts` (per-event derivation), `viewEquivalence.test.tsx` and
  `bottleneckInvariants.ts`. Test sites: `derive.test.ts`'s test built on `flighting_group_id` alone,
  `placementRules.test.ts`'s override (an excess-property error), `validation.test.ts`'s
  flighting-group-strips cases, `flighting.test.ts`'s `validateFlightingGroup` describe,
  `sizeableCount.test.ts`'s two `it.each` blocks over the 7 unsizeable values (14 tests),
  `buildConfig.test.ts`'s three assertion sites, and 2 `keptRun.test.ts` `competitionFields` cases, all
  in the count chain. `buildConfig.ts`'s comment that "flighting-group validation still do" reads
  `strips_allocated` is rewritten.
- **Tests first (T3-1).** A flighted 200-fencer event on 20 strips raises no strip ERROR and places, while
  unflighted it still errors. One flighted event alone on a day emits no `FLIGHT_B_DELAYED` and its
  Flight B starts 15 minutes after Flight A, snapped. Under contention – strips sized so only one of the
  two first phases fits at day start – a flighted event whose Flight A asks for fewer strips than a
  co-day event takes day start and the co-day event waits (passing without the key only when both fit).
  A Y8 or Y10 first phase still beats Flight A under the same contention (the key sits third). The
  suggestion names the larger event as flighted.
- **Checks.** Ledger byte-identical to T1c's SHA (no flighted event in B1–B8). Two judges, before each
  commit: J1 the SHA and a grep for the deleted names, J2 the behaviour cases re-run on a NAC template
  with one event flighted. Each commit body carries its judge's verdict, and a defect found after the
  T3-1 commit gets its own "021 T3: fix …" commit.
- **Review.** Test quality, spec, React if `DetailStrip` or the Findings text changes.
- **Smoke.** `FLIGHT_B_DELAYED` never reaches Findings (the store keeps no scheduler bottlenecks), so no
  row check. Add two steps on a board the driver already loads. (1) Select the strictly largest event,
  press "Flight" in the Selected-event strip, call `settleBoard`, then read its `FLIGHT_A` and `FLIGHT_B`
  blocks' `data-start` and assert Flight B starts at Flight A's end + 15, snapped. (2) L15: lower the
  strips until that event's `resource-precondition-strips` Blocking row appears (asserting on that
  event's row only, and never calling `settleBoard` while Blocking), press Flight, and assert the row
  clears and Auto-assign is enabled.
- **Model.** Opus, high effort.
- **Commits:** "021 T3: flighting follows the spec" and "021 T3: delete the flighting-group path".

### T4: weapon balance (O4, O7, drift)

- **Intent.** The goal is that no day holds only one weapon class (foil and sabre versus épée, all events
  of both genders and teams). A `colorPenalty` term in `dayColoring.ts` beside the cross-weapon term,
  applied at every type, in the "keeps" reading (O7): for the candidate day with the event added, +0.5
  when the day holds one class only, −0.5 when the event brings the missing class to a day that held only
  the other, and 0 when the day already held both. Skipped when the tournament lacks a class. Reads
  `WEAPON_BALANCE`, with its comment reworded to the amendment.
- **Tests first.** An épée event offered a ROW-only day and a mixed day prefers the ROW-only day (−0.5). A
  ROW event offered a ROW-only day pays +0.5 (the day stays one-class), red against a stub that returns 0
  for it (the delta reading). The first event on an empty day pays +0.5. An event offered a day already
  holding both classes pays 0. An all-ROW tournament gets no term (*guard* against the stub that returns
  0, paired in the same `it` with a red case). O4's scope (both genders and teams pooled), with cases a
  per-gender or teams-excluded variant fails: a men's épée event offered a day holding only a women's ROW
  event earns −0.5 (per-gender would pay +0.5), a ROW individual offered a day holding only an épée team
  event earns −0.5 (teams-excluded would pay +0.5), and a women's ROW event offered a day of a men's ROW
  and a men's épée event pays 0 (per-gender would pay +0.5 for the first women's event).
- **Ledger.** Expected under keeps (the O7 probe at `5edbdf7712`, which T1a–T3 leave byte-identical):
  scheduled B1–B8 = 24 / 24 / 24 / 24 / 12 / 53 / 18 / 53 and ERRORs = 0 / 0 / 0 / 6 / 0 / 1 / 0 / 0. The
  only change from today is B6 going from 51/3 to 53/1. Every other count matches baseline, and no count
  falls below the floors 24 / 24 / 24 / 24 / 12 / 51 / 18 / 53. The delta reading gives the same counts.
  Day maps move on B1 (10 events), B3 (17), B5 (6), B6 (40), B7 (12) and B8 (41), and B2 and B4 stay
  identical to baseline. No pooled one-class day remains, and B7's all-ROW day 3 clears. Per-gender
  one-class days: 2 / 1 / 1 / 3 / 3 / 0 / 2 / 0. Raise the B6 floor to 53 with a dated entry (decision 4
  below). Any drop halts.
- **Drift review (4 judges, a fifth if needed).** J1: counts, ERRORs, floors and boot footers through
  `appPath`, plus `stripRecommendation`. J1b: B6 events in and out, and the floor-raise entry. J2:
  single-class days per scenario on the scheduled output, pooled and per gender, before and after (B4's
  three hidden ones included), against the O7 probe table in Measurements. J3: a control run with the term off (T3's head) attributes every moved day map to the term,
  and names any scenario whose churn the term does not explain. J4 if needed: the 10 templates and the
  strip Suggest for NAC Vet/Div1/Junior.
- **Review.** Test quality, spec.
- **Smoke.** The B1 peak-referee pin (210), Suggest (103) and the B1 headline move's "23 placed ·
  1 unplaced" may move. Follow the pin rule above.
- **Model.** Opus, high effort.
- **Commit:** "021 T4: weapon balance".

### T5: the Y8/Y10 and Y10/Div 3 same-day bonus (O6, O9, drift)

- **Intent.** A `colorPenalty` term of −0.4 for a candidate day that holds the event's Y8↔Y10 partner or
  its Y10↔Div 3 partner, each of the same weapon and gender. The lookup works from either side of a
  pair, because DSatur may color either event first. It reads its own lookup, since the constraint graph
  holds no weight-0 edge. The value is a named constant beside the other bonuses.
- **Before code.** Probe the term on T4's head in a throwaway worktree and record B4 and B6 counts and
  day maps. The prediction is otherwise unmeasured.
- **Tests first.** A Y8 event offered its Y10's day and another day picks the Y10's day, and a Y10 offered
  its Y8's day does the same (reverse direction). The same both ways for Y10↔Div 3. A Y8 of another
  weapon, and a Div 3 of another weapon or gender, get no bonus (*guards* paired with red cases).
- **Ledger.** Day maps can move on B4 and B6 only (B3 holds no Y8, and no scenario holds a Div 3). Counts
  must hold, measured against T4's head. A rise gets a floor raise with a dated entry as in decision 4,
  and a drop halts and goes to the owner. B4's exact pin follows the Drift ledger rule.
- **Drift review (3 judges).** J1: counts, ERRORs, floors, boot footers, `stripRecommendation`. J2:
  same-day Y8↔Y10 and Y10↔Div 3 pairs per scenario and on NAC Youth and RYC Weekend, before and after.
  J3: a control run (term off) in a throwaway worktree attributing every move.
- **Review.** Test quality, spec.
- **Smoke.** As T4, plus the B4 overrun trio and the B4 block after 22:00, since B4's day map can move.
- **Model.** Opus, high effort.
- **Commit:** "021 T5: Y8 with Y10 and Y10 with Div 3 share a day".

### T6: the Vet co-day order and the ind→team wait bind (O1, O8, defaults 8, 9)

Three dispatches, each its own commit, so each drift has one cause. Each runs its own review wave, fix
round and smoke before its commit (see the header).

- **T6a – the waits bind.** The younger band's pools may not start before the next-older present band's
  first pool phase (`POOLS`, or `FLIGHT_A` when flighted) starts + 60. The team event's pools may not
  start before its same-category individual's last phase ends + `INDIV_TEAM_MIN_GAP_MINS`. The mechanism
  is fixed here, and the dispatch writes its design down before coding:
  - *Edges.* Each cross-event edge carries an anchor (first-pool-start or terminal-end) and a gap. A Vet
    band's edge points to the next-older band present on that day only, not to every older band, and its
    gap is a named constant `VET_STAGGER_MINS` (60) in `constants.ts`, the Appendix A "Vet co-day stagger"
    row. It follows `REGIONAL_GROUP_1_WINDOW_MINS`'s precedent: if that one is a `TournamentConfig` field,
    the stagger becomes one too, with the P3 file chain and one more `keptRun` `configFields` case. The
    wiring stays in or under `applyCrossEventEdges`, which Blocks 44 and 88 name. If it cannot, the task
    stops for a one-line amendment follow-up.
  - *Held set.* A successor whose same-day predecessor is unpinned and pending is kept out of `ready`.
    A plain re-queue at the same `ready_time` is ruled out: `compareNodes` has no state that changes
    between iterations, so the larger younger band is re-picked every time and the loop throws on B8
    (probe: "exceeded max iterations (4768)"). Advancing through the defer path is ruled out too, since
    it spends `defer_count` and trips `MAX_DEFERS_PER_PHASE` into a false retry.
  - *Release.* A held node goes to `ready` when its predecessor's anchor phase is placed (its floor is
    then the anchor + gap) or when the predecessor is `permanently_failed`. Then the wait lapses (O8):
    its floor is whatever it would be with no predecessor – day start, or any other floor that applies,
    such as the regional Group 1 window. A pinned predecessor is placed before the loop by `preclaimPinnedEvents`, so
    its floor is set at seeding and nothing is held. A predecessor excluded by validation has no edge.
  - *Retries.* The floor is stored on `EventState` and read by `firstPhaseReadyTime`, as
    `group1_window_floor` is, so the successor's own attempt-2 reset keeps it. A node's `ready_time`
    never decreases within one attempt (the retry reset lowers it by design). An older band that fails
    late and restarts after its younger band was released can break the order (decision 8). The judges
    count such breaks.
  - *Bounds.* After the loop, every non-pinned event is committed or `permanently_failed`, or the loop
    throws, so a starved held event cannot vanish as "unplaced" with no finding.
  - *Findings.* `SEQUENCING_CONSTRAINT` (rule `cross-event-dependency-delay`) emits once per node a wait
    pushes, with `delay_mins` equal to the push, wherever the floor is applied – not only at today's
    pop-time check.
- **T6b – the start offset is removed (redefined by O13, 2026-10-10).** O13 retired the Vet Combined
  offset, so this section's earlier "Vet Combined +120" design (`firstPhaseReadyTime` adding the
  offset to the day's start) no longer applies.
  `CATEGORY_START_PREFERENCE` drops its never-read `earliest_start_offset` member from every row and from
  its row type and keeps its weights unchanged, and its header comment says weights only and cites O13. No
  engine code applies a Veteran start offset. A pure removal of a field nothing read, so the ledger is
  byte-identical to T6a's commit `bfdf295fca`.
- **T6c – `vet-co-day-split` WARN** (default 9, cause `VET_CO_DAY_SPLIT`). After coloring, over the final
  day map with pins, one WARN per gender and weapon whose age-banded Vet individual events span more than
  one day. The same check in `placementRules.ts`'s `checkPlacementRules`, which reaches Findings through
  `src/store/derived.ts`'s `placementFindings` (the engine's own findings never reach the board), so a
  hand move or a pin draws it at once. Not dismissable: `dismissableOf` in `derived.ts` adds the rule
  beside `hard-separation-violated`, and the `Finding.dismissable` docblock, the `FindingsPanel.tsx`
  docblock, the `store.ts` comment that names the one exempt rule, and `derived.ts`'s row-identity
  comment (one row per gender and weapon, not per pair) are updated. The panel has no per-rule label map,
  so no label is added.
- **Tests first (T6a).** With ample strips, on one co-day: Vet 80 pools start at day start, Vet 70's pools
  start exactly at Vet 80's pool start + 60 (snapped) and before Vet 80's last phase ends, and so on down
  the bands. This fails under end-to-end serialization, which the "at least + 60" check alone would pass.
  A flighted older band anchors the wait on Flight A's start, not its last phase end. With Vet 70 absent,
  Vet 60 waits on Vet 80. A case where the older band reaches the loop later than the younger one (a
  larger younger band that sorts first, or an older band delayed by contention) still orders them. B8
  runs the real loop to completion without throwing and has all 60 same-day banded pairs ordered. Div 1 M
  Foil individual and team on a 1-day board: team pools start at or after the individual's DE end + 120.
  In both the stagger case and the ind/team case, one `cross-event-dependency-delay` INFO per pushed node
  with `delay_mins` equal to the push (0 today). A predecessor that fails permanently (attempt 2) releases
  its successor, and the wait lapses (O8): with no other floor the successor's pools start at day start,
  and a successor that is also the older side of a regional Group 1 pair still waits for its window. A pinned older band sets the floor at seeding. The post-loop
  assertion throws on a constructed held node whose predecessor never resolves. The bound throws on a
  constructed cycle.
- **Tests first (T6b, redefined by O13).** A *guard* pins that every `CATEGORY_START_PREFERENCE` row
  carries a weight and no other field (red against a tree with the offset). A scheduler case on a 2-day
  board with 9:00 and 8:00 starts pins Vet Combined and the oldest co-day band each at its own day's
  start, red when a 120-minute offset is re-added in `unwaitedReadyTime`.
- **Tests first (T6c).** A pinned split draws one `vet-co-day-split` WARN from the engine and one from
  `checkPlacementRules`, and an unsplit co-day draws none. In `dismissals.test.ts`, the split row has
  `dismissable: false`, `dismissFinding` refuses it, and `selectFindings` keeps it.
- **Ledger.** T6a moves B8's Vet starts, and T6b (redefined by O13) moves nothing. Counts must hold: B8's 53 and B6's raised
  floor are the risks, since B6 is sensitive to Vet start times and was measured only before T4 and T5.
  T6c moves nothing (B1–B8 never split).
- **Drift review, per commit.** After T6a: J1 (counts, ERRORs, floors, boot footers,
  `stripRecommendation`) and J2 (B8's 60 pairs and NAC Vet/Div1/Junior's 60 pairs ordered, the
  dependency findings counted, and any order broken by an older band's retry). After T6b (redefined by
  O13), against the previous 021 commit: one judge J1 – ledger SHA byte-identical to `bfdf295fca`, no
  `earliest_start_offset` or `categoryStartOffset` in `src`, `__tests__` or `scripts`, counts unchanged.
  J3 is dropped with the offset. No control run is needed, since T6a is committed. After T6c: J4 (Suggest for NAC Vet/Div1/Junior re-measured, prototype
  103 → 110, and the pinned-split WARN in the engine and on the board).
- **Review.** Test quality and spec for each commit. React for T6c (the `FindingsPanel.tsx` docblock).
- **Smoke.** T6a: read the POOLS `data-start` of each same-day age-banded Vet group on NAC
  Vet/Div1/Junior and assert each younger band starts at or after the next-older band's start + 60. T6b
  adds no step, since O13 retired the Vet Combined + 120 check. T6c: a pinned split shows the new row with no "Dismiss
  finding" button (the 017 T7 stale-row step's pattern). The Suggest pin, the B1 headline move and
  NAC Vet/Div1/Junior's block after 19:00 can move.
- **Model.** Opus, high effort (a wait that does not bind fails silently).
- **Commits:** "021 T6a: the Vet stagger and the ind→team wait bind", "021 T6b: no Veteran start
  offset" (retitled under O13), "021 T6c: a split Vet co-day is reported".

### T7: `pool-start-after-cutoff` WARN (O2, O10)

- **Intent.** An event whose first pool phase (`POOLS` or `FLIGHT_A`) starts later than its day's start
  + `LATEST_START_OFFSET` draws one WARN with rule `pool-start-after-cutoff` and cause
  `POOL_START_AFTER_CUTOFF`, its message carrying the start. Flight B is exempt. The event stays placed.
  The path is the overrun WARN's, which the store recomputes over the drawn board (the store keeps no
  scheduler bottlenecks, so an engine-only WARN would show no row at all): one pure exported function in
  `concurrentScheduler.ts`, like `lastPhaseOverrunWarnings`, called from `scheduleAllConcurrent` so the
  ledger counts the cause, and from `src/store/derived.ts`'s `placementFindings` with the clock-axis
  config so Findings show the row after a run and after a hand move. `derived.ts`'s producer and
  row-identity comment is updated. O10 puts the cutoff on the hand-move lists: T7 builds both the engine
  WARN and the store board check, test-first.
- **Tests first.** Engine: a pool at day start + 7 h draws nothing, + 7 h 05 draws one WARN. A day
  starting 8:00 moves the cutoff to 15:00. Flight A after the cutoff warns and Flight B after it does not.
  `scheduleAllConcurrent` emits the WARN for an engine-placed event. Store (red before the board check
  exists): a B4-style board shows one `analysis:pool-start-after-cutoff:…` row for an engine-placed
  event, a hand move that starts an event's pools after the cutoff adds its row at once, and a hand move
  back before the cutoff clears it.
- **Ledger.** `warnCountsByCause` gains the cause on the scenarios whose pools start late (B4 1, B6 4 at
  base, re-measured on T6's head). Scheduled counts, ERRORs and every time are byte-identical, which a
  judge proves by diffing the snapshot with the new key removed.
- **Drift review (1 judge).** That diff, plus an independent list of first-pool starts after the cutoff
  per scenario that equals the WARN counts.
- **Review.** Test quality, spec.
- **Smoke.** Assert the `pool-start-after-cutoff` Findings row on B4 (or B6) where the driver already
  loads it, for an engine-placed event. Driver change expected.
- **Model.** Sonnet, high effort.
- **Commit:** "021 T7: warn on pools starting after 4:00 PM".

### T8: Video Strip Preservation (default 11)

- **Intent.** On a day holding a required (NAC staged) video phase, pools may take video strips only
  within `MORNING_WAVE_WINDOW_MINS` of day start, or all day on a single-event day. Elsewhere video strips
  stay available to pools as today. One pure predicate, read by `findAvailableStripsInWindow` and by the
  canvas re-seater (`src/layout/strips.ts`), so the canvas never seats a pool where the engine refused
  one. Pins need no reader of their own: `preclaimPinnedEvents` allocates through `tryAllocate`, whose two
  calls are the two `findAvailableStripsInWindow` call sites.
- **The day facts.** `GlobalState` does not know which events sit on a day, so the predicate takes the
  day's facts – whether it holds a `REQUIRED` video phase, whether it holds a single event, and its day
  start on the caller's axis. The engine computes them from each event's `assigned_day` and its
  video-required nodes, pins included. The re-seater computes them from the drawn board's competitions per
  day, on the clock axis. The dispatch picks a new argument or a `GlobalState` field and writes the choice
  down.
- **Step 1 – measure and report before choosing.** Run B1–B8 and the four NAC templates under `<` and
  `<=` at the window's end, report counts, ERRORs and video delay sums for both, and stop. The orchestrator
  picks, defaulting to `<=` (the rule as first built, `ff07f33476`) unless the numbers favour `<`, and
  records why. The amendment's boundary sentence follows the choice (Note 4).
- **Tests first.** Bring back the morning-wave, single-event-day and mid-day cases Phase D deleted from
  `resources.test.ts`, rewritten so each day holds a `REQUIRED` (NAC staged) video phase: `ff07f33476`'s
  rule had no video-day scope, and restored as they were the mid-day case would assert exclusion on a day
  V26 leaves open. A day with no required video phase lets a mid-day pool take a video strip (*guard*). A
  pool phase starting at exactly day start + 120, per the Step 1 choice. A pinned pool refuses the same
  strip the loop refuses. The re-seater refuses the strip the engine refused.
- **Tests that change.** `resources.test.ts`'s backstop (exactly 2 call sites, exactly 7 arguments)
  follows the new signature, and so do the direct callers in `dayHardEnd.test.ts` and `resources.test.ts`.
- **Ledger.** Times move on video days (B2, B3, B8 at base). Counts must hold. WARN counts, the T7 cause
  included, may move.
- **Drift review (3 judges).** J1: counts, ERRORs, floors, boot footers, `stripRecommendation`. J1b:
  non-video days byte-identical. J2: engine, pinned path and re-seater agree on every NAC template, and
  the boundary table.
- **Review.** Test quality, spec, React if `src/layout/strips.ts` feeds a component change.
- **Smoke.** On a NAC board the driver already loads, on every day with a video-stage block, assert that no
  POOLS block starting at or after the window's end holds a video strip index (`data-strips`). Hand-move
  one event onto such a day and assert its re-seated pool avoids the video strips or is unseated. Pins may
  move.
- **Model.** Opus, high effort.
- **Commit:** "021 T8: video strips are kept for the video stage".

### Task S: the final live smoke

Two consecutive full passes on the final head, 0 console errors, in a Sonnet subagent (constitution VI).
The driver changes made in T3–T8 stand. A pin that moved since its task's smoke is reported, not edited.

### Task D: docs

- `backlog.md`: close or annotate §METHODOLOGY.md and the engine have diverged and its sub-sections,
  §Left for 021 by 019's amendment (item by item), §Dead code held back (the default 13 override),
  §Calibration debt (closed by O3 with the written record), §Vet co-day serialization is unsourced, §The
  Vet sibling and individual-to-team edges, §The 4:00 PM pool cutoff, the pattern-table rows L1 and L5,
  the penalty-weights census, and the §Global settings note that `TournamentConfig` keeps all seven
  settings. Mark the R6 clique WARN settled. Add a §What 021 deliberately left unfixed index (at least: hand
  pins are not checked against the Vet Combined offset – moot since O13 retired it, an older Vet band's retry can break the stagger
  after its younger band started (decision 8), a Veteran team event's ind→team wait points at the first
  matching Vet individual in list order (`findIndividualCounterpart` ignores `vet_age_group`), not at the
  bands as a group, the better least-bad fallback, the medal-tail WARN entries, and every "Not in 021"
  item in `decisions.md`).
- `competition-planner-workbench.md` row 021: delivered, with the new baseline, and the calibration
  scenario closed by O3 rather than added.
- `methodology-reconciliation.md`: a dated note against every verdict 021 applied.
- `src/data/tournaments.ts`: the `SCENARIO_IDS` comment about adding a B9 stays (it describes the type
  mechanism, not the calibration scenario).
- **Commit:** "021 D: docs".

### Task H: handoff

`specs/021-methodology-reconciliation/handoff.md` in 020's shape: status, session notes, what changed,
measurements with the chain of measurements and the test-count chain, reviews, owner rulings and the
decisions made on the owner's behalf with their cost, left unfixed, for later features, merge, and the
resume prompt. The brief names 022 next, while the roadmap marks 022 "last", so the resume prompt names
whichever row the roadmap puts next and says why. Commit: "021 H: the handoff".

### Task M: the merge check

`git -C <wt> merge-tree --write-tree main 021-methodology-reconciliation`. If the tree equals the branch's,
the branch's own checks cover it. Otherwise wrap the tree in a dangling commit
(`git commit-tree <tree> -p main -p 021-methodology-reconciliation -m verify`), add a detached throwaway
worktree at that commit, run `pnpm install` there, then the suite, `tsc -b`, lint and the ledger SHA, and
remove the worktree. Record the result in the
handoff's Merge section. Commit: "021 M: record the merge-tree check".

## Risks

- **O4 and O6 both move day assignment.** Run as separate commits with control runs, so each drift is
  attributable. A DSatur cascade churns most partitions, so judges attribute by mechanism (the term's
  sign on each moved event), not event by event.
- **T6's mechanism.** A same-time re-queue spins on B8 every time, a floor written only at placement
  comes too late for a band already popped, a held node whose release never fires vanishes with no
  finding, and a retry reset drops a floor kept on the node. T6a fixes the mechanism against all four
  (held set, release on placement or permanent failure, the floor on `EventState`, a post-loop
  assertion), and each has its own test.
- **Counts under T6.** The stagger's B8 53 is a pre-018 measurement. T6b added a second Vet move until
  O13 made it a pure removal. B6 is
  sensitive to Vet start times (+60 on the old bands cost it an event) and sits at T4's raised floor. A
  drop on either halts and goes to the owner as a possible policy amendment.
- **T8's boundary.** `<` and `<=` can differ on slot-aligned pools. The measurement comes first, and the
  engine's two call sites and the re-seater share one predicate so they cannot disagree.
- **Smoke pins.** T4–T8 can move the pins listed under Live smoke: T4 and T6 the B1 headline move, T5
  the B4 overrun trio, every drift task the B1 peak referees (210) and Suggest (103). Running the smoke
  per task names the cause, and the pin is re-measured, never adjusted to pass.
- **WARN churn after T7.** T8 moves pool starts on video days, which can move T7's counts. T8's judges
  report them.
- **The amendment can change under review.** A0 commits what the owner approves, and a task that finds
  its text unworkable stops and reports instead of editing METHODOLOGY.md.

## Notes for the owner

The owner answered the first draft's questions 1, 3 and 7 as O7, O8 and O10, and confirmed O9 (see
[Owner rulings](#owner-rulings-2026-10-08-this-session)). The amendment's four remaining notes keep the
first draft's numbers, and each is settled by its default unless the owner objects:

- **Note 2 – Default 12's premise.** Name the WARNs, as the amendment does. Findings do not show the
  flighting suggestion text, and there is no UI change in 021.
- **Note 4 – The morning-wave boundary.** Provisional `<=`, settled by T8's Step 1.
- **Note 5 – `flagFlightingCandidates` signature.** `(competitions, config)`, as T1b-2 builds.
- **Note 6 – Re-runs.** Leave 020's hold and switch out of the doc.

## Decisions made on the owner's behalf

Defaults 1–14 in `decisions.md` are shown to the owner in the amendment and apply as written. The plan
adds these.

1. **Order A0 → T1a → T1b → T1c → T2 → T3 → T4 → T5 → T6 → T7 → T8 → S → D → H → M.** Parity first so drift
   starts from a clean SHA. T2 before T4 and T5 so the new terms join one pass. T7 after T6 because it
   reads final pool starts. Cost: T8 can still move T7's counts.
2. **T1b, T3 and T6 split into dispatches with a commit each, each with its own review and judges.**
   Cost: more commits and more judge runs, each with a single cause.
3. **Smoke after every task that changes what the app shows, before its commit, not only at Task S.**
   Pins then move inside one task. Cost: five or six extra smoke runs.
4. **T4 raises the B6 floor to its measured count.** Later tasks then cannot lose those events silently.
   Cost: a T5–T8 drop there halts and needs the owner.
5. **The owner ruled on the unplaced predecessor (O8).** The wait lapses, and T6a's release follows it.
   Cost: a permanently failed older band no longer orders the co-day, and a team event whose individual
   counterpart fails starts as if it had none.
6. **The cutoff WARN is one pure function called by the scheduler and by the store's
   `placementFindings`,** as the overrun WARN is, and O10 confirms the board check. Cost: none.
7. **T8's boundary defaults to `<=`** unless the measurement favours `<`. Cost: a one-line amendment
   follow-up if it does not.
8. **An older Vet band's retry may break the stagger.** If an older band fails late and restarts after
   its younger band was released, the younger band's placements stay. Holding the release until the
   older band can no longer roll back would come close to the end-to-end serialization O1 retired. Cost:
   the order can break in that case. T6's J2 counts such breaks, and Task D records the limitation.
9. **The stagger is a named constant `VET_STAGGER_MINS`, and the two new causes are named
   `POOL_START_AFTER_CUTOFF` and `VET_CO_DAY_SPLIT`.** Cost: none.
