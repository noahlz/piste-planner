# Project Reassessment — 2026-09-01

Taken after 004 US5 merged (`1fc119ae00`), before any new feature is specced.
Supersedes the status table in
[reassessment-2026-08-31.md §1](./reassessment-2026-08-31.md) – that file's
§2–§4 remain the record of the day-axis finding and the sequence it produced.
Facts below were verified against `main` at `1fc119ae00` on 2026-09-01.

The product owner's stated goal for the next phase: **a basic, working
application with a simple, minimal, easy-to-scan UI – larger elements, less
density.** Every proposal below is judged against that goal, not against the
P4/P5 roadmap as written.

## 1. Where the project stands

| Feature | Status |
|---|---|
| 001 P1 foundations, 002 pool durations, 003 P2 derived state, 005 test consolidation | merged |
| 006 day-axis parity, 008 team-event cut | merged |
| 004 P3 workbench shell, US1–US5 | **merged** – US5 landed as merge `1fc119ae00` |
| 007 rail rebuild | named in the roadmap, unspecced |
| P4 manual placement, P5 FLUID | unspecced |

Gate on `main`, run 2026-09-01: `tsc -b` clean, lint clean (3 warnings, all
from the untracked `coverage/` directory), **68 files, 1809 tests, 0
failures**. Live smoke: `SMOKE PASS` at 2026-09-01 23:03, zero console
errors, all 31 assertions including the gears round-trip and the NAC→ROC
type switch. Six stale wizard-era screenshots from Aug 29 remain in the
untracked `scripts/smoke-shots/` and can be deleted.

**Nothing is half-built.** The "paused work" is 004's close-out bookkeeping,
not code – see §2.

## 2. The paused work, and the verdict

S9 (`specs/004-p3-workbench-shell/sessions/handoff.md` §S9) ended with US5
merged and these left undone:

- `tasks.md` T069–T085 unticked. The re-plan hook halted the edit. T069–T081
  and T083–T084 are done with commit SHAs in the S8/S9 handoff. T082 was done
  and **failed** (SC-004 fails, SC-002 mixed – recorded in the backlog). T085's
  merge was made by the user.
- 34 GitHub issues open for done tasks: #215–#245 (T055–T085) and #266–#268
  (T054a, T061a, T063a). The close policy says close once pushed – they are.
- `spec.md` still says `Status: Draft`.
- The roadmap's "Revised sequence" table still shows 004 US3–US5 as "S6
  drafted, gated on 006" and 008 as "unspecced".

**Verdict: finish the bookkeeping in one short session, then change direction.**
Do not open 007 or P4 as written. The next feature is §7's.

## 3. Bookkeeping cleanups

Each is a doc or config edit. None touches `src/`.

| # | Edit | Why |
|---|---|---|
| B1 | Tick T069–T085 in `specs/004-p3-workbench-shell/tasks.md`. Annotate T082 "done – SC-004 fails, SC-002 mixed, see backlog". | Record matches reality. Ticking a box is not a re-plan – propose adding that sentence to the constitution's re-plan rule so the next session does not stall on it. |
| B2 | Close #215–#245 and #266–#268. | Close policy (memory: close task-mirror issues once pushed). |
| B3 | `spec.md` Status → `Delivered 2026-09-01`. | Every other closed feature reads as done. |
| B4 | Roadmap "Revised sequence" table: 004 row → Done, 008 row → Done, 007 row → superseded by §7 below, P4 row → after §7. | Stale since 2026-09-01. |
| B5 | `backlog.md` header says "work no phase plan has picked up", but five entries are closed and still carried in full: Day-axis parity, Team events block their whole tournament, Per-type defaults, Configurable pool durations, Calibration debt (two of three items done). Move them under a `## Closed` heading, each trimmed to the pointer plus its "what was deliberately not fixed" list. | The file is meant to be scanned for open work. |
| B6 | `backlog.md` §"scorecard's peak-referee row": the 220/212 figures are stale (S8 measured 160/160 on day 0, divergence moved to day 2: 164 vs 156). Update the numbers. | S8 handoff says so, the backlog still carries the old ones. |
| B7 | Add a "superseded 2026-09-01" banner to `reassessment-2026-08-31.md` §1. | Its status table is wrong now. |
| B8 | Delete `scripts/run-chain.sh`. | Retired 2026-08-30 (memory: session prompt files replaced it). Its header still says it runs S1/S2 of 004. |
| B9 | Delete empty placeholders: `src/components/schedule/.gitkeep`, `src/templates/.gitkeep`, `src/theme/.gitkeep`, `src/utils/.gitkeep`, `__tests__/utils/.gitkeep`, plus the `.gitkeep`s in directories that now have files (`src/store`, `src/components/common`, `__tests__/components`, `__tests__/store`). | Scaffolding from the first commit. Nothing is planned for those directories. |
| B10 | Add `coverage/` to `eslint.config.js` ignores. | Removes the 3 lint warnings so a real warning is not lost among them. |
| B11 | `src/engine/catalogue.ts:217` comment says `NAC Vet/Div1/Junior` selects 36 events. It selects 66. | Recorded by 008, never fixed. One-line edit. |
| B12 | Add `.nvmrc` = `22` (or `engines`). | S1 recorded local Node 24 exercises a `localStorage` shim CI never runs. Still true. |
| B13 | Update the auto-memory `project_engine_task_progress.md` (US5 merged; 007/P4 re-sequenced). | Stale since US5 merged. |

## 4. Dead code

`fallow dead-code --production` on 2026-09-01: 6 unused files, 56 unused
exports, 0 unused dependencies, 0 circular imports.

**Unused files** (unreachable from `src/main.tsx`):

| File | Disposition |
|---|---|
| `src/components/ScheduleView.tsx` | Delete. Pre-workbench "Regenerate" page. Nothing mounts it. |
| `src/components/sections/RefRequirementsReport.tsx` | Delete with it, and its test. The scorecard carries the referee numbers now. |
| `src/components/ui/checkbox.tsx`, `src/components/ui/tabs.tsx` | Delete. shadcn primitives no component imports. |
| `src/engine/daySequencing.ts` | **Delete, and fix METHODOLOGY.** Nothing imports it – `concurrentScheduler.ts:1119` mentions it in a comment only. The within-day ordering it implemented (`sequenceEventsForDay`, `vetAgeOrderingKey`) was replaced by `compareNodes` and `applyCrossEventEdges` in Phase D. METHODOLOGY §Within-Day Age-Descending Order still names it as the implementation. |
| `src/tools/asciiLaneRenderer.ts` | Keep. Test-only by design (`integration.test.ts` renders lanes with it). Not a product file, so `--production` is right to flag it and wrong to delete it. |

**Unused exports worth acting on**, because each one is a METHODOLOGY claim
with no implementation behind it (full list in the fallow output, most of the
rest are test-facing constants that are fine as exports):

| Export | What the doc says it does | What the engine does |
|---|---|---|
| `SOFT_SEPARATION_PAIRS` (constants) | DIV1↔CADET 5.0, DIV1↔DIV2 3.0, DIV1↔DIV3 3.0 soft penalties | zero readers – the penalty is never applied |
| `VIDEO_STAGE_ROUND` (constants) | video stage starts at R16/R8/R4 by category | zero readers – staged DE always splits at the round of 16 |
| `MORNING_WAVE_WINDOW_MINS` (constants) | start-of-day pool wave may use video strips, then they lock to DE | zero readers – `findAvailableStripsInWindow` uses video strips as overflow for any non-video phase at any time |
| `validateSameDayCompletion` (validation) | the "Same-Day Completion" WARN | zero readers – runtime emits `SAME_DAY_VIOLATION` at ERROR (already in the backlog) |
| `perBoutDuration` (de) and so `YOUTH_VET_BOUT_DELTA` | −5 min applied to Y8/Y10 and veteran DE bouts | no caller – the delta is threaded through config and never applied |
| `flagFlightingCandidates`, `recommendRefCount` (stripBudget) | §Auto-Suggestion says flighting candidates come from `flagFlightingCandidates()` | `flighting.ts` has its own pool-count test |
| `suggestStripCount` (analysis) | §Strip Count Suggestion | the store uses its own `src/store/stripSuggestion.ts` – two implementations of one rule, and the store's is the one that under-recommends for `ROC Mega` |
| `proximityPenalty`, `individualTeamProximityPenalty` (crossover) | 1-day bonus, 2-day neutral, 3+-day penalty | only `PROXIMITY_1_DAY` is applied |

## 5. METHODOLOGY.md contradicts the engine

The backlog already records four (DIV1↔CADET hard-vs-soft, flighting text,
day-end severity, policy tables stale). These are additional, all verified by
reading the live path (`concurrentScheduler.ts` → `dayColoring.ts`).

**5.1 Fourteen of nineteen penalty weights are dead.** `PENALTY_WEIGHTS` readers
on `main`:

| Read by the engine | Never read |
|---|---|
| `REST_DAY_VIOLATION`, `PROXIMITY_1_DAY`, `TEAM_BEFORE_INDIVIDUAL`, `INDIV_TEAM_DAY_AFTER`, `INDIV_TEAM_2_PLUS_DAYS` | `SAME_TIME_HIGH_CROSSOVER`, `SAME_TIME_LOW_CROSSOVER`, `INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER`, `INDIV_TEAM_GAP_UNDER_MIN`, the three `EARLY_START_*`, `WEAPON_BALANCE`, `PROXIMITY_3_PLUS_DAYS`, `Y10_NON_FIRST_SLOT`, `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET`, the three `LAST_DAY_REF_SHORTAGE_*` |

The cause is structural, not an oversight per weight. Day assignment is DSatur
graph coloring over a constraint graph (`dayColoring.ts` header). It knows
which day an event is on and nothing about time of day, so every "same-time",
"early start", and "first slot" penalty has nowhere to apply. Those penalties
belonged to the serial scheduler Phase D replaced on 2026-04-27. METHODOLOGY
§Soft Preferences, §Early-Start Conflicts, §Weapon Balance, and Appendix A's
penalty table describe that scheduler.

**5.2 Constraint relaxation has one level, not four.** §Constraint Relaxation's
table (level 1 drops proximity, level 2 drops soft crossover, level 3 drops
relaxable ind/team blocks) does not exist. `dayColoring.ts` relaxes exactly one
thing – `INDIV_TEAM_RELAXABLE_BLOCKS` edges, recorded as `relaxations.set(id,
3)` – and never drops proximity or crossover penalties.

**5.3 The capacity penalty curve is not the documented one.** Doc: 0 below
0.60, ramp to 3.0 at 0.80, ramp to 10.0 at 0.95, 20.0 above. Code
(`capacityPenalty`): 0 at or below 0.85, linear to 3.0 at 1.0, then
`min(OVERFLOW_PENALTY, 3.0 + 10×overflow)`. The code's own comment says the
0.60 curve "over-steered" and was replaced. Appendix A still says `[TBD]`.

**5.4 Video strip preservation rules are not implemented.** §Video Strip
Preservation describes a morning-wave window and a single-event-day exception.
`findAvailableStripsInWindow` (`resources.ts:217-222`) implements two rules
only: video-required phases get video strips, everything else gets non-video
first and video as overflow, at any time of day.

**5.5 The tiered video table is not implemented.** §Video Replay Policy's
R16/R8/R4-by-category table has no reader. Every staged event splits at R16
(`DE_ROUND_OF_16`). The backlog notes the table is uncorroborated by USA
Fencing; it is also unused.

**5.6 Youth/vet bout delta is never applied.** Appendix A: "Applied to
`DE_BOUT_DURATION` for Y8/Y10 and all veteran age groups." `perBoutDuration`
has no caller.

**5.7 Inputs section is stale on three counts.** "Tournament duration: 2–4
days" – validation accepts 1–14 with a notice outside 2–4 (P2 widened it).
"Video strip count: 4, 8, 12, 16" – any integer is accepted. "Refs per pool
default 2" – the default is per tournament type since 004 US4 (1 outside
NAC/SJCC/SYC). And the widened day cap is only half real: `dayColoring.ts`'s
`MAX_EXPANDED_DAYS = 4` stops capacity expansion at four days whatever
`days_available` says, so days 5–14 are used only when hard constraints force
them. The UI's two day-count selects still offer 2, 3, 4 only.

**5.8 The intro describes P4.** "Users then refine it via drag-and-drop on a
day/strip grid. The engine re-validates after each adjustment." No drag exists.
The doc should say what ships, and point at the roadmap for the rest.

**5.9 `FINALS_ONLY` is "preserved for save-file compatibility."** The project
rule is no backward compatibility, ever (memory: product unreleased). The enum
value is operationally identical to `BEST_EFFORT` and is still offered in
`CompetitionOverrides` as "Finals Only" – a control that changes nothing.

**5.10 Within-day ordering pointers are dead.** §Within-Day Age-Descending
Order names `vetAgeOrderingKey`, `VET_AGE_ORDER`, and "comparator key 3.5 in
`sequenceEventsForDay`" in `daySequencing.ts`. That file is unreachable (§4).
The live rule is `applyCrossEventEdges`.

**Proposed fix, one task:** rewrite METHODOLOGY §Soft Preferences, §Constraint
Relaxation, §Capacity Penalty Curve, §Video Strip Preservation, §Video Replay
Policy, Appendix A, and the intro to describe the DSatur + concurrent scheduler
that exists, and delete the fourteen dead weights and the five dead constants
from `constants.ts` in the same change. Deleting unread constants cannot move
B1–B8, so the drift review is a formality, but constitution III still requires
running it. Do this **before** any engine feature, or the next feature is
specced against a doc that lies.

## 6. The UI, against "simple, minimal, easy to scan"

Read from the component sources and the live smoke screenshots.

**6.1 Every setting has two homes.** The top bar and the rail's Tournament and
Strips panels both edit tournament type, day count, and strip count. S2
recorded this as "a product decision, not a cleanup" and it has stayed since.
There are also **two preset systems**: the top bar's `Preset` picker over
B1–B8 (`src/data/tournaments.ts`) and the rail's `Presets…` toggle group over
ten `TEMPLATES` in `catalogue.ts` – three of which place zero events (§8).

**6.2 Two dark header bars.** `App.tsx` renders a `bg-slate-800` header with the
title and a "Work in Progress!" badge, and `TopBar` renders a second
`bg-slate-800` header directly beneath it. The title bar carries nothing the
top bar needs.

**6.3 The rail is a 320px column holding wide-card components.** `CompetitionMatrix`
is a 3-column grid of six weapon×gender boxes each with three button rows –
built for a full-width card (the 08-31 reassessment already recorded it
overflowing). `FencerCounts`, `CompetitionOverrides` (five-column table with
three selects per row), and `AdvancedPanel` (table with a select per row) are
all tables inside the same 320px. Text is 11–12px throughout. This is the
opposite of "larger elements".

**6.4 Controls that do nothing or contradict the model.**

- `CompetitionOverrides` offers "Finals Only" video policy (§5.9).
- `AnalysisOutput` renders Accept/Reject buttons on flighting suggestions.
  Accepting sets `flighted: true` on the engine copy, but the store's
  placements model cannot represent a flight pair (S5 handoff: "No store
  state can produce a flighted event"), and the reassessment listed
  "flighting as user intent or removal" as an open product decision. The
  buttons act on something the app cannot show.
- The Advanced panel's per-event referee table duplicates what the panel's own
  copy says is "only referees editable here", while DE mode is in
  `CompetitionOverrides` and video strips in `StripSetup` – three panels for
  three fields of one concept.
- The gears panel exposes two settings (admin gap, flight buffer) plus the pool
  duration table. Admin gap and flight buffer are engine tuning knobs an
  organizer has no reason to touch. The panel earns its top-bar button for the
  pool duration table only.
- `Zoom to selection` is permanently disabled (no selection exists).

**6.5 The canvas is not finished** – recorded in the backlog §"The workbench
canvas is not yet a finished surface": zoom past ~6 clicks flattens the
canvas, no scroll affordance or drag-to-pan, and SC-004 (read a block without
hovering) fails.

**6.5a Seen in the 2026-09-01 smoke screenshots** (`scripts/smoke-shots/`,
untracked):

- Every rail panel has two headings: the `RailPanel` trigger ("Tournament")
  and the card title inside it ("Tournament Setup"). Five panels, ten headings.
- The top bar's strip-count `+`/`−` buttons and the gears button render as
  blank white squares on the dark bar – the icons have no contrast against
  `bg-slate-800`. "Save / Share" is washed out until hovered.
- In the Events panel the row labels "Individual", "Team", and "Veteran" draw
  on top of the first button in each row ("Y8", "Cadet", "V40").
- The Schedule view's Competition column shows raw ids (`CDT-M-SABRE-IND`)
  where every other surface uses `competitionLabel`.
- Day-time selects truncate ("10:00 P"), as the 08-31 reassessment recorded.

**6.6 What is good and should survive.** The four-region shell, the tray, the
matrix canvas (windowing, geometry, tooltip, view equivalence – all heavily
tested), the scorecard, per-type defaults resolving in `buildConfig`, the
share-URL serialization, and the `NumberInput` primitive. The engine boundary
is real. None of the simplification below needs to touch `src/engine/` or
`src/store/derived.ts`.

## 7. Proposed next feature: 009 – simple workbench

Replaces 007 "rail rebuild" in the roadmap. Same directive as 007 (tear up
the re-homed section components, no preservation effort, tests re-target as
panels are rebuilt) with a narrower target: one home per setting, fewer and
larger controls, and the three canvas defects fixed. P4 waits behind it.

**Scope, in the order to build it:**

1. **One header.** Merge `App.tsx`'s title bar into `TopBar`. Drop the badge.
2. **One home per setting.** Delete `TournamentSetup`, `StripSetup`,
   `CompetitionMatrix`, `FencerCounts`, `CompetitionOverrides`, and
   `AdvancedPanel`. Rebuild the rail as **two** panels:
   - *Tournament*: type, days, per-day start/end, strips, video strips – each
     once. Day count offered as 1–14 with the 2–4 notice, matching validation.
   - *Events*: one row per selected event – label, fencer count, and a single
     compact "advanced" disclosure per row for referees / DE mode / cut. The
     weapon×gender×category picker becomes a modal or a full-width drawer,
     not a 320px grid.
3. **One preset picker.** Keep the top bar's B1–B8 real-tournament presets.
   Delete `TEMPLATES` and the rail's `Presets…` group, or fold the ten
   templates into the same picker under a "Templates" heading once §8's
   empty-board templates are fixed.
4. **Remove dead controls.** `FINALS_ONLY` from the enum, serialization, and UI.
   Flighting Accept/Reject from `AnalysisOutput`, and `flightingSuggestionStates`
   from the store, until flighting becomes user intent in P4. The flighting
   *suggestion text* can stay as an INFO finding.
5. **Gears panel** shrinks to the pool duration table. Admin gap and flight
   buffer go back to being constants (their store/serialization plumbing was
   built to be withheld, per the what-if backlog entry – withhold them too).
6. **Larger elements.** Base font 14px, controls 36–40px tall, one column in
   the rail, rail width to ~360px, one heading per panel. The findings list
   groups by severity with counts and collapses INFO by default. The schedule
   table uses `competitionLabel`, not ids. Top-bar icons get a light variant
   so they are visible on the dark bar.
7. **The three canvas defects** from the backlog. Fix the zoom flattening
   (find the cause – the backlog deliberately did not speculate), add
   scrollbars or drag-to-pan, and re-judge SC-004 after the palette is
   revisited with fewer simultaneous categories on screen.
8. **Crash guard.** `FencerCounts`' successor sets `min={MIN_FENCERS}`, and
   `analysis.ts:26` gets the same guard `validation.ts:240` already has. Add an
   `ErrorBoundary` at the shell as the backstop.
9. **Smoke driver** re-pointed in each task that reshapes a control
   (constitution VI), never rewritten.

Not in scope: anything under `src/engine/`, manual placement, P5.

**Why not 007 as written:** 007's framing was "replace the five re-homed
components with purpose-built panels". That preserves the five-panel
structure and the duplication. The goal has changed to *fewer* panels.

## 8. Engine defects that block "basic and working"

These are already in the backlog. Listed here because a user who loads a
template and sees an empty board does not have a working application, so
they belong in the sequence right after 009, as one small engine feature
(010) with its own drift review.

| Defect | Cost if ignored | Fix, smallest first |
|---|---|---|
| `NAC Div1/Junior`, `NAC Vet/Div1/Junior` place 0: `indiv-team-same-day` fires as a BINDING ERROR on a hypothetical same-day worst case even on a 4-day tournament, and one BINDING error empties the whole schedule | Two of ten templates show an empty board | Demote the rule to `notice()` (backlog names the line). Then scope the all-or-nothing gate to the finding's `subjects` |
| `ROC Mega` places 0: `suggestStrips()` under-recommends for 42 events | One template shows an empty board | Reconcile the store's `stripSuggestion.ts` with the engine's unused `suggestStripCount` – one rule, one home |
| Day-end overrun is a hard failure the doc calls a warning | Events vanish instead of running late | Place terminal phases past `dayHardEnd` with a WARN carrying the estimated finish |
| Runtime failure never re-colors | Same – permanent drops | One bounded re-color pass with the failed day excluded |
| DE prelims gets one slot instead of its bout share (bracket 64) | Wrong phase durations and referee windows for every large event | Fix `deBlockDurations`'s unit mismatch |

## 9. Sequencing and process findings

- **The re-plan rule blocked bookkeeping.** S9 could not tick T069–T084
  because editing `tasks.md` is treated as a re-plan. Ticking boxes and
  annotating outcomes is record-keeping. Propose amending constitution
  §Orchestration: "Ticking a checkbox or recording a task's measured outcome
  is not a re-plan."
- **Human judgments came last.** T082 (SC-002/SC-004) sat at the end of a
  five-story feature, after the palette and windowing were built and reviewed.
  Both failed. The 08-31 reassessment §5 had already asked for a 10-minute
  human look before the rail rebuild. For 009, put the human look at the end of
  the *first* story, not the last.
- **"After P5" means never.** The global-settings remainder and the what-if
  mode are parked "after P5", and P5 is deferred with no owner. Re-home both as
  "unassigned, needs a spec" and drop the P5 reference.
- **`tasks.md` T021/T022 are still stale** (S2 left them so on purpose). With
  the feature closed, the S3 correction can be folded in during B1.
- **Two implementations of one rule** appear three times: strip suggestion
  (store vs engine), flighting candidates (`flighting.ts` vs `stripBudget.ts`),
  and the team-cut default (store vs ledger factory – deliberate, per 008
  research D2). Only the third is intentional. The first two go with §5's
  METHODOLOGY task.

## 10. Recommended sequence

1. **Bookkeeping session** – §3 B1–B13. Half a session. User commits.
2. **METHODOLOGY + dead-code feature** – §4 file deletions, §5's rewrite, the
   fourteen dead weights and five dead constants removed. Drift ledger run
   (expected flat). Small, one spec directory.
3. **009 simple workbench** – §7. The product goal.
4. **010 empty-board fixes** – §8's first two rows at minimum.
5. **P4 manual placement** – re-specced against the simpler rail.

## 11. Verification snapshot

- Suite: `timeout 300 pnpm --silent test` → 1809/1809, 68 files.
- `tsc -b` exit 0. `lint` exit 0 with 3 warnings from `coverage/`.
- Dead code: `fallow dead-code --format json --quiet --production`.
- Penalty readers: `grep -rn "PENALTY_WEIGHTS\.<KEY>" src/engine` per key.
- `daySequencing.ts` importers: none outside a comment at
  `concurrentScheduler.ts:1119`.
- Open issues: `gh issue list --state open` → 34, all label
  `004-p3-workbench-shell`, all for done tasks.
