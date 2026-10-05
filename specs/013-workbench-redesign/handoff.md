# 013 handoff

Session record for the workbench redesign. Findings, verdicts and parity
exceptions live here rather than in `spec.md` – reconciliation prose stays out
of the spec.

## Verdicts

The three verdicts the feature waited on, stated plainly (each has its
subsection below):

- **T015, the shell at real size**: **yes, with a polish pass** (2026-09-07).
  The polish was judged twice. T015b's re-look of the chrome was "matches"
  (2026-09-07), and so was T044's close-out polish of every surface
  (2026-10-04).
- **T023, NAC Youth's Suggest count**: **66** (2026-09-13, both runs at
  `9da51b1b15`). This is research D14's expected value now that the Admin gap
  step is gone. It still reads 66 at every later smoke run, the last being
  T052's.
- **T041, print by hand**: **passes** (2026-10-04). The owner's first print
  "looks great" from a printing perspective. Its three content remarks became
  T050 (in 013), T051 (roadmap 023 and the backlog) and team counts inside
  023. The re-print after T050 "looks good", and its one remark became T052
  (landscape by default).

### T015 – the shell at real size (FR-069, SC-001, quickstart §3)

Screenshots taken at `30c7c452b0` on preset B1 (4 days, 80 strips, 24
events), viewport shots, saved by `scripts/screenshot.mjs` (written in T015,
untracked until the verdict is recorded and committed with it):

- `scripts/smoke-shots/shell-1440x900.png`
- `scripts/smoke-shots/shell-1920x1080.png`

**Verdict (2026-09-07)**: **Yes, with a polish pass.** The shell's
structure is accepted and phase 3 is unblocked. The product owner wants the
app to match the Claude Design mockup's look so the difference stops being a
distraction while the rest of the feature is built. Decisions taken with the
verdict:

- **Timing**: chrome now, everything at close-out. The header, rail, dock
  and footer are polished before phase 2 (they survive every later phase);
  a second pass after phase 5 covers the new panels and canvas. Phase 2's
  panels and phase 3's canvas are built to the mockup from the start.
- **Scope**: styling only – colors, type, spacing, icons, button variants,
  design-system tokens. Structure stays as the alignment doc §9 decided (the
  Matrix ⇄ Schedule toggle stays, D6).
- **Reference**: the mockup and its design-system CSS are copied into
  `docs/design/mockup/` from the Claude Design project so tasks can read
  them locally. §9 wins where the mockup and the app differ.
- **Type**: a system-font stack, no font files. The mockup uses Figtree and
  its design system uses Barlow, both from Google Fonts, and plan.md allows
  no new dependency. T015a sets the mockup's sizes, weights, letter-spacing
  and line heights on `system-ui`; letterforms differ and that is accepted.
- **T015b re-look**: not a halt. Anything still off is listed here and
  carried into T044; phase 2 starts regardless.

This is a re-plan: `tasks.md` gains the polish tasks (T015a, T015b in phase
1; T044 in phase 8) and a standing rule that new surfaces are styled to the
mockup. Recorded here per constitution §Orchestration; the session that
recorded it stopped and handed off.

**T015b re-look (2026-09-07)**: shots retaken at `785327a42f` after T015a
and its follow-up (`scripts/smoke-shots/shell-1440x900.png`,
`shell-1920x1080.png`), SMOKE PASS, 0 console errors, no driver edit.
**Verdict: matches.** The product owner judged the chrome against the mockup
at a glance and listed nothing still off, so T044's scope gains nothing from
this re-look. Phase 2 starts on this verdict.

What the orchestrator saw in the 1440×900 shot before the verdict, for the
record rather than as a judgment:

- The header's Export button renders a white label on a white button and is
  unreadable against the dark header.
- The dock reads "Every event has a slot." while the footer reads
  `19 placed · 5 unplaced · 0 pinned` – finding 1 below, visible on the boot
  preset.
- The canvas is still phase 1's old windowed one: Day 1 and strips 1–29 fill
  the viewport, with the old zoom toolbar above it. "80 rows across four days
  as a board" is US3's deliverable and cannot be judged from this shot; the
  verdict is on the shell chrome.
- Hatched blocks overlap between 11:00 and 14:00 on strips 1–16 – the
  packer's overflow cue, same root as finding 1.

What the verdict covers: one header, one dock, one rail, one footer, no
second copy of type, days or strips; whether 80 strip rows across four days
read as a board at 100%; legibility of the header summary, dock chips and
footer. A "no" halts phase 3 (US3, the canvas) until the look is revised, and
that revision is a re-plan.

### T044 – the close-out polish (standing rule 13, the second half of T015's verdict)

Shots at `37d7f33e91` on preset B1 (4 days, 80 strips) by
`scripts/screenshot.mjs`: `shell-1440x900.png`, `shell-1920x1080.png`, and
at 1440×900 `t044-{tournament,strips,events,findings,settings,tooltip,detail,schedule}.png`
under `scripts/smoke-shots/`. SMOKE PASS with no driver edit, 0 console
errors.

**Verdict (2026-10-04)**: **matches.** Two owner decisions came with it, on
the questions in findings 31 and 32. Each becomes a follow-up task ahead of
T037:

- **The findings border** (M1285): drawn on a block whose findings include a
  Warning, Unplaced or Blocking row – **not** for Notes alone, so B1 does not
  turn red. → T048.
- **Small-text contrast**: raise the panels' section captions and the
  canvas's off-hour tick labels to WCAG AA (4.5:1). This is slightly darker
  than the mockup's `#7a7a7d` / `#a3a3a6`. → T049.

### T041 – print, by hand (SC-008, quickstart §8)

The owner loaded B1, ran Auto-assign, switched to Schedule, pressed Print and
saved to PDF.

**First print (2026-10-04)**: "from printing perspective, it looks great."
The layout passed. Four pages, one per day, each holding only that day's
table. The owner made three remarks on the content. Each was investigated
read-only and checked by a second agent, and none blocked the verdict:

1. **"Human-readable names instead of the hyphenated codes."** The
   Competition column printed `competition_id` (`VET-M-FOIL-TEAM`) in mono,
   while the canvas already names blocks with `competitionLabel`. FR-051 asks
   for the published-schedule look, which names events in words. → **T050**,
   built in 013. Catalogue ids inside Findings messages and the wording of
   `competitionLabel` against published schedules ("Div 1" vs "Division I",
   "Senior" for a Div 1 team event) went to the backlog under T051.
2. **"Why are the team events running on two strips?"** These are B1's
   10-team Vet events split into two pools of five. The Strips column shows
   only the pool strip count. B1's team fields (10/10/10/10/20/30) are
   rounded and unsourced. → Sourced team counts replace them **inside roadmap
   feature 023**, in the same ledger move.
3. **"Team events do not have 'pool' rounds. They are direct to DE round."**
   The engine gives team events a real pool round, which METHODOLOGY.md
   assumes (`team_pools_start`, :197). This is a gap in the spec, and fixing
   it is an engine change that moves the ledger for B1, B2 and B8. → **T051**
   recorded it as roadmap feature **023, "Team events go straight to DE"**,
   after 015. It is blocked until the owner amends METHODOLOGY.md.

**Re-print after T050 (2026-10-04)**: "looks good. The default should be
landscape if possible." The Competition column now shows names, with one day
per page. → **T052** (`0f8e25629c`) sets `@page { size: landscape }`. A
Chromium PDF of B1's Schedule gives 4 pages at 792 × 612 pt (Letter,
landscape). Other browsers were not checked.

### T023 – phase 2 smoke (FR-067, SC-013)

Both runs at `9da51b1b15` (dev server on port 5174 in the worktree):
**SMOKE PASS** twice, 0 console errors both runs. Suggest counts, identical
across both runs:

| Template | Suggested strips |
|---|---|
| ROC Div1A/Vet | 15 |
| NAC Youth | 66 |
| NAC Vet/Div1/Junior | 80 |
| NAC Cadet/Junior | 48 |

Boot (B1), both runs: schedule table 24 rows, footer `19 placed · 5 unplaced
· 0 pinned` (finding 1, unchanged from phase 1).

Locator repairs: none — `pressSuggest` needed no change (per dispatch,
confirmed). Two comment repairs to record what was observed, not to fix a
selector: dated `[M]` notes added at the NAC Youth and SC-008 blocks
(`scripts/smoke.mjs`) recording that this session's earlier readings (69,
66, 50, 49 across two prior attempts) were stale-display reads, not a search
or engine defect, and that both hold at their fresh-store values (66, 80)
now that `9da51b1b15` fixed the display race. A structural driver addition —
restoring DE mode to Staged on page 1 right after the T022 share-round-trip
step — was needed independently: see finding 8.

Confirming run at `e4fcd29058` (second Strips-panel follow-up): PASS, same
counts, 0 console errors.



1. **The lane packer and the scheduler disagree on placed counts.** The
   scheduler places every event the schedule table shows, but
   `src/layout/lanes.ts`'s first-fit packer cannot always draw them all on the
   strip rows, and `selectPlacementCounts` (after the T010–T011 review fix)
   counts an overflowing event once as unplaced. Measured:
   - B5 at 60 strips: `{ placed: 9, unplaced: 3, pinned: 0 }` – three DE
     blocks the scheduler placed do not fit the packer's lanes (T011).
   - B1 at 80 strips, at boot: the schedule table has 24 rows while the
     footer reads `19 placed · 5 unplaced · 0 pinned` (T014, both runs).
   The footer and the schedule table therefore disagree on the boot preset,
   and the dock says "Every event has a slot." while the footer says five are
   unplaced. Recorded, not corrected – phase 3 rewrites the canvas and its
   packing (US3), which is where this is resolved or re-measured.
2. **B4's app path places 18 against the drift ledger's 17.** A recorded
   parity exception, not drift: the app path and the ledger's no-pins path
   differ on one B4 event. Carried from T012's run-note measurement
   ("Placed 18, 12 could not be placed").
3. **T010 was written green-first.** Its test was seen green before the
   implementation existed, against standing rule 2. Recorded so the next
   test-quality pass knows which task to re-check for a tautological test.
4. **Canvas tooltip closed ~40 ms after opening after any preset switch**
   (found by T014's first smoke run, fixed on the same checkpoint,
   `30c7c452b0`). Root cause, shown by instrumentation: Radix's portalled
   `div[data-radix-popper-content-wrapper]` is hit-testable, so when
   collision detection flipped the tooltip below a short block its rect sat
   under the pointer and the canvas viewport received `pointerleave`, which
   nulled `hovered`. `CanvasTooltip.tsx` now sets `pointer-events: none` on
   the wrapper through a ref callback. The picker's immediate
   `runScheduleAll` (research D12) was not involved – block height was the
   variable. Browser-only: jsdom lays nothing out, so the unit test pins the
   wrapper's style and the smoke driver's FR-022 step is the live check.
   Review follow-up `410d8ef46b`: the docblock names the `hideWhenDetached`
   assumption the override depends on, cites `@radix-ui/react-popper@1.2.8`,
   and the callback warns in dev when the wrapper is not the content's
   parent instead of silently doing nothing.
5. **The smoke driver's pages share `localStorage`.** `viewState.ts` persists
   the open rail panel, and a second page in the same browser context opens
   with whatever panel the first left open. The driver's `openPanel` helper
   now guards on `aria-pressed` for every page. Not an app defect, but a
   trap for any future driver step that opens a panel on a fresh page.
6. **No control returns `de_mode_override` to null**: once an organizer picks
   Staged or Single the tournament stops following its type's default
   permanently. The spec (FR-030) and `ui-contract.md` §Settings name only
   the two pills, so T022 built exactly that. Product-owner decision needed:
   add a third "Default" pill or a revert, or accept.
7. **The team-event cut coercion loop in `src/store/buildConfig.ts` is now
   unreachable under current constants** — `defaultCutForEntry` already
   answers DISABLED/100 for every team entry and `REGIONAL_CUT_OVERRIDES`
   maps its categories to the same pair — so no test proves it fires (T020
   test review). Kept as defence in depth; a discriminating test would need a
   `vi.doMock` of `constants.ts` with a non-DISABLED regional override for a
   category that has a team event. Backlog, not phase 2.
8. **T023 found two things through one failing assertion**: (a) T022's
   DE-mode round-trip step leaked a Single override into every later
   template, with no control to return `de_mode_override` to null — the
   driver now restores Staged on page 1 after the round-trip; (b) the
   Suggested-minimum card kept the previous configuration's number on
   screen, Apply enabled, through the debounce and search, so the driver
   applied the previous template's count (69/66 for NAC Vet/Div1/Junior
   against 80, 50/49 for NAC Youth against 66). Fresh-store probes at
   `df977bf487` gave 66/80 through both today's and the pre-T017 search, so
   the engine and the search were never involved. Fixed in the app at
   `9da51b1b15`.

### T026 – the canvas (FR-032 to FR-043)

Committed at `05103d5ff4`, review follow-up `01765a3087`. Two test literals
moved after the red tests were written, both from measurement and both
re-checked by the test-quality pass:

- `daySummaries.test.ts` finding counts 1/1/0 → 2/2/0: the fixture raises two
  validation findings per event (video dead-config and round-of-16 over-cap),
  not one. The case's claim, one dismissal drops exactly one on that day, is
  unchanged.
- `Block.test.tsx` label constants 14/30 → 19/53: the mockup's own `namePx`
  and `taken` rule for a 96 px block over 4 strips. Thirty was never
  reachable.

Two decisions the contract did not settle: the tick ladder is
15/30/60/120/180/360 minutes at a 72 px minimum gap (the dispatched 60–360
at 48 px gave every rung 60-minute ticks, so no rung could differ), and the
tooltip is driven by entering the block, not by coordinates at the
container, because native scrolling makes container hit-testing reconstruct
what the DOM already answers.

### T027 – phase 3 smoke (FR-067, SC-005, SC-013)

**SMOKE PASS ×2 at `b9f9ad46b8` and ×2 at `2eda25bc66`**, 0 console errors
every run. Suggest 15 / 66 / 80 / 48, boot 24 rows and `19 placed · 5
unplaced · 0 pinned`, unchanged from T023. The new SC-005 step reaches
`281%` after two presses (the driver arrives at rung 3, having pressed "Zoom
in" once before "Fit day"), and all 30 blocks carry `data-weapon` and a
label or a phase icon.

Locator repairs: none on the first run. The one driver edit after the fix,
`2eda25bc66`, reads an absent `[data-label]` as empty instead of waiting on
it, because the fix stopped rendering the empty span.

9. **The lane packer and the counter agree; the grid draws what the counter
   calls unplaced.** Re-measured in T026 on B1 at 80 strips: 24 selected, 19
   placed + 5 unplaced, 24 distinct competitions with a block, 66 blocks, 5
   `assignStripLanes` overflow blocks. The five the footer calls unplaced are
   the five the packer overflowed, drawn at strip 0 with the dashed edge.
   Finding 1 closes as "not a disagreement": the schedule table shows 24
   rows because the scheduler placed 24, and the footer subtracts the packer's
   overflow. Whether an overflowed block should also count in the dock is
   phase 6's question (it builds the unplaced flow).
10. **A block at the closest rung can have no room for text** (SC-005 as
    written). `D1A-M-SABRE-IND:DE_PRELIMS`, a 5-minute segment over 12
    strips, is 45 px wide at rung 5. FR-035 allows "neither", SC-005 says
    "label". Resolved at `41dfe0e31f` and `ce540ffd56`: when no label fits the
    phase icon shows alone, sized to the block's real padding (`clamp(rowH ×
    0.2, 6, 11)` per side, applied inline as the mockup does), shrinking to a
    10 px floor, below which the block is blank. SC-005 is read as
    label-or-phase-icon and the driver comment records it. The `CanvasTooltip`
    "draws nothing" fixture moved from 27 px to 20 px to stay below the floor.
    The 5-minute segment itself is the engine defect the backlog already
    records (`docs/design/backlog.md` §DE prelims gets a sliver of its
    bracket's time): `deBlockDurations` counts only the first round as the
    bracket's bouts, so a 64 bracket gives prelims 1/32 of the DE time. Fix
    sits behind the drift ledger and its own spec; not this feature's.
11. **The day band read the live store while the grid drew the committed
    model** (react-code-reviewer on `05103d5ff4`, FR-042). During the 150 ms
    settle, and for as long as a blocking error suppressed the commit, the
    band's counts could describe a schedule the grid was not showing. Fixed at
    `01765a3087`: `daySummariesFromBlocks` is a pure function over the
    canvas's own lanes and the committed validation errors; `selectDaySummaries`
    stays as the live wrapper the store tests use. Left as recorded, not
    fixed: the pin badge reads `placements` live (a boolean per block; phase 6
    owns pinning).

### T028–T029 – phase 4, the selection and the detail strip (FR-044 to FR-048, FR-028)

Committed at `5ea2ec5c1c`, review follow-up `be7e50dd0b`. Both reviews ran on
the first commit: `test-quality-reviewer` found nothing to block on and
verified two suspect case shapes by mutating the component and watching them
go red; `react-code-reviewer` found findings 12 and 13 below.

The phase ran on a pinned contract file (session scratchpad, `phase4-contract.md`)
naming every store field, prop, `data-*` attribute and string before a line was
written — phase 3's pattern, and again the red tests and the implementation
agreed on first contact. The one place the contract was silent, the tests
decided: `data-selected-*` sit on the root `section`, not on the spans that
display them, because that is where `DetailStrip.test.tsx` reads them.

12. **The detail strip lied about an event whose day fell out of range**
    (react-code-reviewer on `5ea2ec5c1c`). `assignStripLanes` skips a placement
    outside `days_available` (`src/layout/lanes.ts:148`), but the strip decides
    "placed" from `schedule.events[id]` existing, so after an organizer shrank
    Days available a still-selected event kept its full placed shape — a day,
    real clock times — while `data-selected-strips` silently vanished. Fixed at
    `be7e50dd0b`, and deliberately **not** by reclassifying it as unplaced: the
    event is placed, and Move day is the exact control that repairs it, so
    taking Pin and Move day away from the one event that needs moving would be
    perverse. The day text reads `Day N out of range` (`ScheduleOutput.tsx:115`'s
    own words for the same fact) and the strips fact always renders, reading
    `Unplaced, day out of range` — parallel to `stripAssignmentLabel`'s
    "Unplaced, needs N strips", and for the reason `CanvasTooltip.tsx:51–59`
    already gives: never claim strips the block was not granted.
13. **Selecting a placed event is mouse-only** (react-code-reviewer, carried,
    owner decision). `Block`'s root is `role="img"` with an `aria-label`, pinned
    by `ui-contract.md` §Canvas because that is how a block's facts reach a
    screen reader at all. T029 added `onClick` to it, so a keyboard or AT user
    can select an **unplaced** event (the dock's chips are real `button`s) and
    cannot select a **placed** one. Changing the role, or adding `tabIndex` and
    a key handler to a `role="img"` element, are both contract changes and
    neither was made here. Options are in the review: leave it, add keyboard
    handling under the pinned role, or change the role in the contract.
14. **A test that asserts a retired name is absent blinds the grep that proves
    it.** `placements.test.ts` asserted `'flightingSuggestionStates' in state
    === false`, which requires naming the identifier as a string literal, which
    makes quickstart §2's `grep -rn "flightingSuggestion"` — SC-002's own proof
    the surface is gone — permanently unable to return nothing. The assertions
    were deleted, the grep kept: once `AnalysisSlice` leaves `StoreState`,
    `tsc -b` proves the fields are gone at every call site, which is stronger
    than one `in` check on one state object. A pre-existing
    `'flightingSuggestions' in state` assertion was the same defect one phase
    older, and is why this grep had never run clean. **Standing rule: no test
    names a retired identifier to assert its absence.**

Two smaller corrections, both from the test-quality pass and both fixed at
`be7e50dd0b`: `CenterView`'s `detailCollapsed` and `onToggleDetailCollapsed`
arrived optional with no-op defaults (so dropping them from `WorkbenchShell`
would have compiled, passed, and left the Collapse button inert) and are now
required, with the 13 mounts in `invalidState.test.tsx` and `recompute.test.tsx`
updated; and the strip-range string had no case pinning it against a
hand-computed literal — every case recomputed it the way the component does, so
a conceptual error shared by both would have passed. One synthetic fixture now
proves `Strips 12–16` by arithmetic.

Still open from phase 2: **finding 6** — no control returns `de_mode_override`
to null. Phase 4 touched no Settings surface, so it is carried unchanged.

### T030–T032 – phase 5, the unified findings list (FR-022 to FR-027, FR-060)

Committed at `3b3e53504c`, review follow-up `10568db330`, four comment
rewordings by the orchestrator in the bookkeeping commit. Both reviews ran on
the first commit: `test-quality-reviewer` found one vacuous case and confirmed
the two defects T031's implementer had already reported; `react-code-reviewer`
found findings 17 and 18. The phase ran on a pinned contract again
(`phase5-contract.md` in the session scratchpad) and the four red-test
dispatches and the implementation agreed on first contact.

What the list is: `selectFindings(state)` is one severity-ordered array of
`Finding` rows (Blocking, Unplaced, Warning, Note) built from validation
errors, bottleneck warnings, the lane packer's overflow blocks, out-of-range
placements (FR-060) and a per-day late-finish check, with dismissed rows
filtered out. The rail badge is its length, the Findings panel renders it, the
day bands count it per day, the gutter flags read its targets, and Auto-assign
disables on a Blocking row. `CenterView` commits the rows with the schedule so
nothing on the canvas reads findings live (FR-042).

15. **The INFO → Note map was written off on a false premise, and the
    late-finish tie-break was pinned to the wrong rule** (T031's implementer,
    confirmed by the test review). T030's `findings.test.ts` claimed no
    INFO-severity finding exists anywhere and dropped the Note cases; that is
    true of `ValidationError` only — `analysis.ts` emits `CUT_SUMMARY` at
    INFO per cut-enabled competition, three Note rows on the fixture. The
    same file picked the late-finish culprit by lane order where the contract
    and `derived.ts` pick the lowest competition id on a tie. Both fixed at
    `10568db330`: Note map and Note-undismissable cases against the
    `CUT_SUMMARY` row, and a measured tie fixture (`JR-M-EPEE-IND` and
    `JR-W-EPEE-IND` at 8 fencers both finish DE at 769 on day 0).
16. **Late finish reads the day band's number, not the footer's** (decision).
    `finish(d)` is the maximum block end over the day's lanes — the value the
    band prints as "finishes HH:MM" — not `de_total_end`, which the footer's
    tournament finish uses and which carries the unscheduled medal-bout tail.
    A panel that warned about a time the grid does not show would be worse
    than no panel (the mockup's own comment). Recorded here because
    data-model §9 words `finish` as `de_total_end`; the implementation has
    read block ends since T026.
17. **The flash had no paint** (react-code-reviewer on `3b3e53504c`).
    `Canvas` built the whole flash state and `Block` wrote it out as
    `data-flash`, which nothing styled; the tests asserted the attribute and
    passed. Fixed at `10568db330`: a `--flash` token (aliased to
    `--rail-badge`, the mockup's `CONFLICT.line`) drawn as a ring-and-glow
    sibling span the way the selection ring already is. No test for a colour
    (T015a precedent).
18. **The mount-skip guard broke under StrictMode** (react-code-reviewer). A
    boolean "have I run" ref is flipped by StrictMode's first synthetic effect
    call, so the second falls through and jumps on every mount where an event
    is already selected — dev only, and the same hazard `App.tsx` already
    guards for `bootstrap()`. Fixed at `10568db330` with a last-handled-nonce
    ref initialised from the first render; a StrictMode test case pins it,
    and the mount-skip case that was vacuous (it never seeded a selected
    event) now seeds one.
19. **Label helpers moved out of `components/`** (T031). `derived.ts` must
    not import from `src/components/` (research D6 fixed the direction in
    phase 0), so `competitionLabels.ts` moved wholesale to `src/lib/` and
    `phaseDisplay`, `stripRangeLabel` and `stripAssignmentLabel` moved from
    `CanvasTooltip.tsx` into `src/lib/blockLabels.ts` as one vocabulary,
    retiring three `react-refresh/only-export-components` suppressions.
20. **Carried finding 13 gets a partial answer.** "Show on grid" is a real
    button, so a keyboard user can now reach a placed event's block through
    the panel; the block itself is still `role="img"` and not operable. Owner
    decision unchanged.

Measured on `threeEventsOverlappingOnDayZero` (the phase's fixture): 10 rows —
1 Unplaced, 6 Warning, 3 Note, 0 Blocking; the day summaries' `findings`
column reads `[7, 3, 0]`. `daySummaries.test.ts`'s own fixture moved from the
literals `[2, 2, 0]` to `[3, 3, 0]`, the rise being one `CUT_SUMMARY` row per
event that the validation-only column never counted. FR-025's witness is now a
real Blocking row (`video-r16-strip-shortfall` under a STAGED override with no
video strips) that survives the hand move unchanged, no longer 0 → 0.

### T033–T035 – phase 6, Auto-assign schedules around pins (FR-054 to FR-061)

Committed at `29f95362f9` (T034, on branch `013-phase6-pins` cut from main
`71180db6e7`), ledger review `dc1a1b073b` (T035), review follow-up
`f072d754b5`. The one engine change of the feature and its only
drift-bearing phase: **nothing moved** – B1–B8 scheduled 24/24/24/17/12/45/18/52
before and after, snapshot SHA-256 `5483c40c1349…` unchanged, parity 17. The
phase ran on a pinned contract again (`phase6-contract.md` in the session
scratchpad) and the four red dispatches and the implementation agreed on
first contact everywhere the contract spoke. T035 was a second Opus reader;
`test-quality-reviewer` ran on the first commit and found one defect. No
`.tsx` changed, so no React review.

What shipped: `scheduleAll(competitions, config, pinned = [])` on both entry
points, `PinnedPlacement` and `BottleneckCause.PINNED_UNCLAIMED`, the
seeded DSatur passes with compaction skipped only when pins exist, the
pre-claim pass (one `tryAllocate` per phase node per pin, in `(day, start,
id)` order), the loop seed skipping pins, `stripSearch` threading pins,
`buildPinnedPlacements` in `buildConfig.ts`, `setPlacementsFromAuto(placements,
keep)` carrying pinned ids verbatim, and `runScheduleAll` returning
`{ placed, unplaced }` over the unpinned events only.

21. **One `PINNED_UNCLAIMED` warning per phase node, not per event**
    (decision, T034). tasks.md T033 said "one WARN"; the engine contract's
    item 4 says "naming the event and phase", which is per phase. Measured on
    case 5's fixture (B1 at 48 strips, 7 video): the second pin misses its
    pools **and** its video round of 16 – both Division 1 events need 4
    video strips for R16, the windows overlap on 635–645, and 4 + 4 exceeds
    7. One warning per event would have hidden the second fact. The test
    asserts the pools warning specifically.
22. **The strip search counts an unclaimed pin as unplaced** (decision,
    T034). A pin keeps its `pool_start` whether or not it claimed strips, so
    a `placed` rule of "non-null pool_start" made pins cost nothing: four
    pins at one minute moved B1's answer from 48 down to 45. Research D1
    wants "the smallest count that places every event around the pins",
    so `scanStripCounts` now subtracts every pinned competition carrying a
    `PINNED_UNCLAIMED` bottleneck, guarded on `pinned.length > 0`; the
    ledger's `stripRecommendation` row is unmoved on all eight. The T033
    fixture that exposed this asked 145 pool strips at one minute against a
    135-strip ceiling and could never have an answer; re-measured to two
    pins (45 + 38), N = 83 against the no-pins 48, and 82 loses the later
    pin's pools.
23. **`buildPinnedPlacements` admitted an id with no catalogue entry** that
    `buildCompetitions` drops (T035's reader), so `attempted =
    competitions − pins` could undercount. `selectCompetitions` and
    `addCompetition` refuse unknown ids, but `deserializeState` checks the
    per-competition shape and never catalogue membership, so a hand-edited
    save is a real path. Fixed at `f072d754b5` with the same `findCompetition`
    existence check, and a test that reaches it through `setState`.
24. **Two red tests were green by construction** (T033, confirmed by the
    test review's mutation). Case 4 copied its pins from the no-pins result
    and case 7 relied on determinism the ledger already proves. Both were
    reshaped in `f072d754b5` to pins that diverge from the natural
    placement (19 of 24 B1 ids differ between the 48- and 80-strip boards)
    and are red when the third argument is discarded. Recorded because
    tasks.md predicted (7) red, and the contract predicted both.
25. **Not built in this phase, still open**: `Canvas.tsx` reads
    `placements` live for the pin badge (finding 11's remainder, FR-042) –
    no phase 6 task named it; finding 6 (no control returns
    `de_mode_override` to null) and finding 13 (a placed block is
    mouse-only) are unchanged owner decisions. The engine's `Bottleneck`
    for a pin collision is invisible to the UI, which reads the lane
    packer's Unplaced row instead (FR-059) – the two surfaces agree on the
    fixture in finding 22 and nothing checks that they agree in general
    (T042 records it).

### T036 – phase 7, the Schedule view (FR-051 to FR-053)

Committed at `4f6204d41a` on `013-phase7-schedule` (cut from main
`851e8ccdce`), smoke re-point `51df2e7795`, review follow-up `3d35a84e65`.
The phase ran on a pinned contract (`phase7-contract.md` in the session
scratchpad). Both reviews ran on the first commit: `test-quality-reviewer`
found nothing to block on and mutation-checked cases 2 (the sort) and 8
(the print-hidden regions); `react-code-reviewer` found finding 28.
`scripts/smoke.mjs` ran twice: PASS, 0 console errors, Suggest 15/66/80/48,
boot 24 rows and `19 placed · 5 unplaced · 0 pinned`, all unchanged.

What shipped: `ScheduleOutput` is a `section` "Schedule" holding a Print
button (`window.print`) and one `section` "Day N" per day that has events,
each with an `h3`, the destructive "Day N out of range" badge when flagged,
and a seven-column table (the Day column and `data-cell="day"` are gone,
replaced by `data-day-section="N"` on the section and `data-out-of-range`
on the row). Print is a stylesheet (research D11): `@media print` in
`src/index.css` with `print-hidden` on the six chrome regions and the Print
button, `print-page` (`break-after: page`, last child excepted) on each day
section, and `print-unclip` on the seven wrappers that clip the center.

26. **The contract missed three consumers of the Day column** (implementer
    halt, correct). `viewEquivalence.test.tsx:360` asserted the `day` cell
    by name, and `recompute.test.tsx` and `invalidState.test.tsx` read row
    cells positionally under the eight-column layout, so deleting the
    column shifted every index by one. The implementer halted rather than
    edit a test outside the contract's list; the orchestrator authorized
    the three re-points (one helper swap, index shifts, doc comments – no
    expected value changed) and they are in `4f6204d41a`'s body under
    "Contract miss". Rule for the next contract: grep `data-cell` and
    `getAllByRole('cell')` before deleting a column.
27. **The per-day split broke a second driver locator** (smoke run).
    `schedTable` at `scripts/smoke.mjs:555` filtered `table` by its "Pool
    Start" header, unique when the view was one table and a four-way
    strict-mode violation once each day had its own. Re-pointed in place at
    `region` "Schedule", whose text still covers every day for the
    before/after comparisons. tasks.md named only the `:525` day read.
28. **The shadcn `Table` container clips inside a day section**
    (react-code-reviewer). `ui/table.tsx` wraps every `<table>` in an
    `overflow-x-auto` div the wrapper classes do not reach; one
    `[data-slot="table-container"]` rule in the print block un-clips it
    (`3d35a84e65`). Not reachable by any current fixture – the columns are
    short – but the one link in the chain that was open.

Still open, unchanged by this phase: findings 6 and 13 (owner decisions),
finding 25 (`Canvas.tsx` reads `placements` live for the pin badge). The
human print check (quickstart §8, SC-008) is T041's, recorded in T043.

### Phase 8 – T047, T045, T046, T044 (2026-10-04)

Branch `013-phase8-closeout`, cut from main `27e505b1a2` (which carries the
phase 7 merge and the Spec Kit removal). Every task ran test-first where it
had behavior, then `react-code-reviewer` and `test-quality-reviewer`, and
every review finding was folded into one follow-up commit per task.

- **T047** `3c2d298d5d`: the team-cut coercion loop is gone (finding 7
  closed). Ledger and parity unmoved, SHA `5483c40c1349…`.
- **T045** `e0402bf768`, driver `d0844bcbba`, follow-up `0f48b38d19`:
  the Default pill (finding 6 closed). The share round-trip and the driver's
  restore step now go through it; finding 8's explicit-Staged workaround is
  retired.
- **T046** `97c12b9ca7`, follow-up `74e42d208b`: the pin badge reads the
  pinned set committed with the schedule (findings 11 and 25 closed).
- **T044** `68bc3486d9` (tokens, canvas, blocks, tooltip), `5094129973`
  (panels), `08fd4208ab` (detail strip, overlay, Schedule view, chrome, dead
  tokens), `172ca790e7` (per-surface owner shots in `scripts/screenshot.mjs`),
  follow-up `37d7f33e91`. The work was scoped from a read-only gap audit of
  the mockup, region by region. `scripts/smoke.mjs` passed three times across
  the pass with **no driver edit**. Shots: `scripts/smoke-shots/shell-*.png`
  and `t044-{tournament,strips,events,findings,settings,tooltip,detail,schedule}.png`.

29. **The Default pill carries a hint the owner did not ask for** (T045).
    With Default checked, Staged and Single are both unchecked, so the panel
    stopped saying which mode applies. A hint `{type} default: {mode}` sits
    beside the group and describes the Default radio. This keeps the
    information the old checked-pill-plus-badge carried.
30. **A `sed -i` backup was committed as `src/index.css-E`** (T044-C, removed
    in `37d7f33e91`). BSD sed reads `-i -E` as "edit in place, back up with
    suffix `-E`", so it wrote a full copy of the stylesheet that still held
    the deleted tokens. Nothing imported
    it, but a grep for a retired token would have hit it. The same commit had
    deleted the eight tokens' `:root` values and left their `@theme`
    mappings, so `bg-error` and the rest still compiled to undefined vars.
    Both were found by the React review, not the tests.
31. **Left out of the polish on purpose** (scope calls, owner to rule):
    - The mockup's solid red border on a block that has findings (M1285).
      Blocks carry Note-level findings too, so most of B1 would turn red.
      That is a meaning, not paint.
    - The mockup's +3 / −6 block inset was applied and then reverted, because
      `Block.tsx`'s label fit assumes +2 / −4.
    - Everything that needs a new element: day-band spans, the overflow
      stripe, block meta text, the detail strip's pill internals, the rail
      tooltip, and the panel title level. The gap list is in the T044 commits.

    Ruled 2026-10-04: the border is drawn for Warning, Unplaced and Blocking
    findings, not for Notes (T048). The rest stays out of 013.
32. **Small text below WCAG AA where the mockup puts it.** The mockup's
    caption grey `#7a7a7d` at 11.5px is about 4.3:1 on white, against AA's
    4.5:1. T044 raised the Schedule view's column heads and the Export
    popover's headings to `neutral-700`, because they were `foreground`
    before. The panels' section captions keep the mockup grey (T015a's
    accepted look). The canvas's off-hour tick labels (`#a3a3a6` on the axis,
    about 2.1:1) are also the mockup's value. Both are owner calls.
    Ruled 2026-10-04: raise both to AA (T049).
33. **Two "Unplaced, needs N strips" figures for one event** (seen in the
    T044 shots). B1's Div 1 Women's Epee shows "needs 32 strips" in the detail
    strip and "needs 16 strips" in the DE-prelims tooltip. Each is that
    phase's own need under the lane packer's overflow (finding 9), so they
    are not wrong. They do read as a contradiction, beside a dock that says
    "Every event has a slot." Feature 017 (the canvas calls events unplaced)
    owns it.

## Measurements

| Where | Value | When |
|---|---|---|
| Boot, B1, schedule rows | 24 | T014, 30c7c452b0 |
| Boot, B1, footer `data-counts` | 19 placed · 5 unplaced · 0 pinned | T014 |
| Suggest: ROC Div1A/Vet | 15 | T014 |
| Suggest: NAC Youth | 63 (Admin gap step still runs before it; D14 expects 66 once phase 2 deletes that step) | T014 |
| Suggest: NAC Vet/Div1/Junior | 80 | T014 |
| Suggest: NAC Cadet/Junior | 48 | T014 |
| Console errors, both smoke runs | 0 | T014 |
| Unit suite after T014 | 75 files / 1840 tests | T014 |
| Unit suite at `37987dc5dc` (two tooltip follow-ups) | 75 files / 1842 tests, tsc and lint clean | phase 1 checkpoint |
| Boot, B1, schedule rows | 24 | T023, both runs, `9da51b1b15` |
| Boot, B1, footer `data-counts` | 19 placed · 5 unplaced · 0 pinned | T023, both runs |
| Suggest: ROC Div1A/Vet | 15 | T023, both runs |
| Suggest: NAC Youth | 66 (fresh-store value, D14's expectation confirmed once the Admin-gap leak, then the DE-mode leak and the display race, were gone) | T023, both runs |
| Suggest: NAC Vet/Div1/Junior | 80 (SC-008 holds) | T023, both runs |
| Suggest: NAC Cadet/Junior | 48 | T023, both runs |
| Console errors, both smoke runs | 0 | T023 |
| Unit suite at `9da51b1b15` | 72 files / 1838 tests, tsc and lint clean | T023 checkpoint |
| Confirming run: Suggest 15/66/80/48, 0 console errors | PASS | T023, `e4fcd29058` |
| Unit suite at `05103d5ff4` (SVG canvas deleted) | 71 files / 1663 tests, tsc and lint clean; drift ledger and parity unchanged | T026 |
| B1 at 80 strips: placed / unplaced / overflow blocks / blocks drawn | 19 / 5 / 5 / 66 | T026, finding 9 |
| Boot, B1, schedule rows and footer | 24 rows, 19 placed · 5 unplaced · 0 pinned | T027, all four runs |
| Suggest: ROC Div1A/Vet, NAC Youth, NAC Vet/Div1/Junior, NAC Cadet/Junior | 15 / 66 / 80 / 48 | T027, all four runs |
| SC-005: readout when "Zoom in" disables, blocks at rung 5 | 281%, 30 all with weapon and label-or-icon | T027, all four runs |
| Console errors, four smoke runs | 0 | T027 |
| Unit suite at `2eda25bc66` | 71 files / 1671 tests, tsc and lint clean | phase 3 checkpoint |
| Unit suite at `5ea2ec5c1c` (selection, detail strip, AnalysisSlice deleted) | 73 files / 1683 tests, tsc and lint clean | T029 |
| Unit suite at `be7e50dd0b` | 73 files / 1685 tests, tsc and lint clean | phase 4 checkpoint, verified twice |
| `grep -rn "flightingSuggestion" src/ __tests__/ scripts/` | no output | phase 4 checkpoint (quickstart §2) |
| Unit suite at `3b3e53504c` (findings list, panel, badge, jump) | 74 files / 1718 tests, tsc and lint clean | T032 |
| Unit suite at `10568db330` (review follow-up) | 74 files / 1722 tests, tsc and lint clean; drift ledger and parity unchanged | phase 5 checkpoint, verified twice |
| `threeEventsOverlappingOnDayZero` rows by severity | 1 Unplaced / 6 Warning / 3 Note / 0 Blocking; day findings `[7, 3, 0]` | T031 |
| `grep -rn "AnalysisOutput" src/ __tests__/` | no output | phase 5 checkpoint (quickstart §2) |
| Drift ledger B1–B8 scheduled, before and after the engine change | 24/24/24/17/12/45/18/52 both; SHA `5483c40c1349…` both; parity 17 | T034 `29f95362f9`, T035 `dc1a1b073b` |
| B1 strip search with four pins at one minute, before finding 22's rule | 45 (below the no-pins 48) | T034 |
| B1 strip search with two Division 1 pins at day 0 offset 300 | 83 (82 loses the later pin's pools) | T034, `stripSearch.test.ts` |
| Case 5 fixture, B1 at 48 strips / 7 video: second pin's unclaimed phases | POOLS and DE_ROUND_OF_16 | T034, finding 21 |
| Unit suite at `29f95362f9` | 76 files / 1738 tests, tsc and lint clean | T034 |
| Unit suite at `f072d754b5` (review follow-up) | 76 files / 1739 tests, tsc and lint clean; ledger and parity unchanged | phase 6 checkpoint, verified twice |
| Unit suite at `4f6204d41a` (Schedule view) | 76 files / 1747 tests, tsc and lint clean | T036 |
| Boot, B1, schedule rows and footer | 24 rows, 19 placed · 5 unplaced · 0 pinned | T036 smoke, both runs, `51df2e7795` |
| Suggest: ROC Div1A/Vet, NAC Youth, NAC Vet/Div1/Junior, NAC Cadet/Junior | 15 / 66 / 80 / 48 | T036 smoke, both runs |
| Console errors, two smoke runs | 0 | T036 smoke |
| Unit suite at `3d35a84e65` (review follow-up) | 76 files / 1747 tests, tsc and lint clean | phase 7 checkpoint, verified twice |
| Unit suite at `27e505b1a2` (phase 8 base, main) | 76 files / 1747 tests, tsc and lint clean | phase 8 baseline |
| Drift ledger and parity before/after T047 | pass / pass, SHA `5483c40c1349…` unchanged | T047 `3c2d298d5d` |
| Unit suite at `74e42d208b` (T045, T046 and follow-ups) | 76 files / 1753 tests, tsc and lint clean | phase 8 |
| Smoke at `d0844bcbba` (T045 driver re-point), two runs | PASS, 0 console errors, Suggest 15/66/80/48, boot 24 rows / 19·5·0 | T045 |
| Smoke at `172ca790e7` (T044 polish), two runs, no driver edit | PASS, 0 console errors, Suggest 15/66/80/48, boot 24 rows / 19·5·0 | T044 |
| Smoke at `37d7f33e91` (T044 review follow-up), no driver edit | PASS, 0 console errors, Suggest 15/66/80/48 | T044 |
| Unit suite at `37d7f33e91` | 76 files / 1753 tests, tsc and lint clean | T044 |
| Unit suite at `94f1cb739c` (findings border) | 76 files / 1761 tests | T048 |
| Unit suite at `c61ef2e96a` (review follow-up) | 76 files / 1762 tests, tsc and lint clean | T048 |
| Smoke after T048, no driver edit | PASS, 0 console errors, Suggest 15/66/80/48, boot 24 rows / 19·5·0, 9 of 66 B1 boot blocks warned | T048 |
| Contrast: caption on `--chrome`, off-hour tick on `--chrome-deep`, hour tick | 4.00 → 6.13:1, 2.11 → 4.66:1, 5.51 → 8.41:1 | T049 `e8c6f2db90` |
| Unit suite at `e8c6f2db90` / `f6726047d5` | 76 files / 1762 tests, tsc and lint clean, no test edit | T049 |
| Smoke after T049, no driver edit | PASS, 0 console errors, Suggest 15/66/80/48, boot 24 rows / 19·5·0 | T049 |
| Unit suite at `15b0c6fe35` / `929774da34` | 76 files / 1760, then 1759 | T038 follow-ups |
| Both retired-surface greps at `45d2a12a4a` | no output, exit 1, both | T038 |
| Full check at `a6621c0ddf`, two runs | `tsc -b`, lint, suite clean and identical: 76 files / 1759 tests; skip/only grep empty | T040 |
| Smoke at `a6621c0ddf`, two runs, no driver edit | PASS, byte-identical logs, 0 console errors, Suggest 15/66/80/48 (NAC Youth 66), boot 24 rows / 19·5·0, share round-trip 12 of 12 rows | T039 |
| Unit suite at `11d8c1573e` / `be22677e96` (readable names) | 76 files / 1763, then 1764 | T050 |
| Smoke after T050, two runs, no driver edit | PASS, 0 console errors, Suggest 15/66/80/48, boot 24 rows / 19·5·0 | T050 |
| Print-emulated Letter PDF of B1's Schedule | 4 pages, one day each, no clipped column | T050 |
| Full check re-run at `401e860d18`, two runs | 76 files / 1764 tests, clean and identical; skip/only grep empty; reconciles from 1759 | T040 re-run |
| Unit suite at `0f8e25629c` (landscape print) | 76 files / 1764 tests, tsc and lint clean | T052 |
| Smoke after T052 | PASS, 0 console errors, Suggest 15/66/80/48 | T052 |
| Chromium PDF of B1's Schedule, `preferCSSPageSize` | 4 pages, 792 × 612 pt (Letter, landscape) | T052 |
| Merged tree (fast-forward to `a819520ad2`, tree `438ea22039…`) | `tsc -b` and lint exit 0; 76 files / 1764 tests; drift ledger 18 tests pass, SHA `5483c40c1349…` unchanged | merge check, 2026-10-04 |
| Both retired-surface greps at `a819520ad2` | no output, exit 1, both | T043 |

## Drift record

T002's baseline (`0824b3eccd`, at `aa7b5082fc`, before any `src/engine/`
edit) beside T035's after-table (`dc1a1b073b`, read at `29f95362f9`, after
the feature's one engine change). Both are in full in `drift-baseline.md`.
Each cell reads "before / after".

| Scenario | scheduledCount | errorCount | WARN total | stripRecommendation |
|---|---|---|---|---|
| B1 | 24 / 24 | 0 / 0 | 0 / 0 | 48 / 48 |
| B2 | 24 / 24 | 0 / 0 | 8 / 8 | 70 / 70 |
| B3 | 24 / 24 | 0 / 0 | 0 / 0 | 71 / 71 |
| B4 | 17 / 17 | 13 / 13 | 27 / 27 | 76 / 76 |
| B5 | 12 / 12 | 0 / 0 | 12 / 12 | 28 / 28 |
| B6 | 45 / 45 | 9 / 9 | 27 / 27 | 60 / 60 |
| B7 | 18 / 18 | 0 / 0 | 2 / 2 | 64 / 64 |
| B8 | 52 / 52 | 1 / 1 | 7 / 7 | 69 / 69 |

`warnCountsByCause` is equal cause by cause on all eight. Snapshot SHA-256
`5483c40c1349944b6ac26659406b39bb84fef9091c2e259c7f0e36920520d0b6` before and
after, `git diff --stat 71180db6e7 -- __tests__/engine/__snapshots__/` empty,
`appPathParity.test.ts` 17 passing at both points. **Every count unmoved.**

Phase 8:

- **T047** (`3c2d298d5d`, the only phase 8 change that reaches config the
  engine sees): ledger and parity pass before and after, SHA unchanged,
  nothing moved.
- **The merged tree** (fast-forward of `main` `8512bed20c` to
  `a819520ad2`): `driftLedger.test.ts` passes (18 tests), SHA
  `5483c40c1349…`, equal to the baseline.

Across the whole feature, from `aa7b5082fc` to `a819520ad2`, no ledger count
moved.

## Task record

One row per task, in the order the tasks ran. Commits are on
`013-workbench-redesign` and its phase branches, all merged into `main`
except phase 8's second branch. Details are in each task's `→` record in
`tasks.md`.

| Task | Commit(s) | Deleted | Replaced by / added |
|---|---|---|---|
| T001 | `aa7b5082fc` | – | Worktree cut at `1ab0d15c79`. Start: 68 files / 1848 tests, tsc and lint clean |
| T002 | `0824b3eccd` | – | `drift-baseline.md`: B1–B8, SHA, parity, driver Suggest 15/63/80/48 |
| T003 | `096f34c8ea` | `components/canvas/lanes.ts`, the layout half of `geometry.ts` | `src/layout/segments.ts`, `src/layout/lanes.ts`, tests under `__tests__/layout/` |
| T004 | `096f34c8ea` | – | `SelectGroup`, `SelectLabel` in `ui/select.tsx` |
| T005 | `a2fa3e3ef2` | – | `estimateEventFootprint` in `engine/derive.ts` (no new arithmetic, ledger unmoved) |
| T006 | `a2fa3e3ef2` | – | `lastAutoRun`, `loadedPresetId` over a wider `PresetId` |
| T007 | `a2fa3e3ef2` | The handlers inside `SaveLoadShare.tsx` | `src/store/exportActions.ts` |
| T008 | `a2fa3e3ef2` | – | `ErrorBoundary.tsx` around the shell |
| T009 | `a2fa3e3ef2` | `Rail.tsx`, `RailPanel.tsx` and its test | `ToolRail.tsx`, `InspectorPanel.tsx`, `panel` / `panelDocked` view state |
| T010 | `a72c45b7ab`, `031c4b7f9b` | `TopBar.tsx`, `SaveLoadShare.tsx` and its test, `App.tsx`'s header and badge | `Header.tsx`, `PresetPicker.tsx`, `ExportPopover.tsx`, `ui/popover.tsx` |
| T011 | `4644f98b9a` | `Drawer.tsx`, `Scorecard.tsx`, the scorecard baseline and metric hover, the center's toggle, `drawerHeight`, `scorecardExpanded`, three scorecard test files | `StatusFooter.tsx`, `selectFooterMetrics`, `selectPlacementCounts` |
| T012 | `a3367af740` | `UnplacedTray.tsx` and its test | `UnplacedDock.tsx` with footprint chips |
| T013 | `a3367af740` | The `highlight` prop and `data-highlighted` (20 cases) | The six-region `WorkbenchShell` |
| T014 | `30c7c452b0`, `410d8ef46b`, `37987dc5dc` | The driver's scorecard and hover steps | Driver re-pointed at header, rail and footer, and the tooltip wrapper fix (finding 4) |
| T015 | `51dfaa5392` | – | `scripts/screenshot.mjs`, the verdict, the polish re-plan |
| T015a | `59dbfa71fc`, `785327a42f` | Ad-hoc colour classes on the chrome | Mockup tokens in `index.css`, chrome restyled |
| T015b | `c96049a60a` | – | Re-look verdict "matches" |
| T016 | `1e730723b7` | `TournamentSetup.tsx`, AM/PM `formatTime` | `panels/TournamentPanel.tsx`, `TIME_OPTIONS` in `lib/time.ts` |
| T017 | `1e730723b7` | `suggestStrips` | `computeSuggestedStrips` (returns, never writes) |
| T018 | `1e730723b7`, `8f670eba53`, `9da51b1b15`, `e4fcd29058` | `StripSetup.tsx`, `AdvancedPanel.tsx` and their tests | `panels/StripsPanel.tsx` with Suggested minimum and Apply |
| T019 | `a85e14f5f5` (with T020) | – | Red tests for the shrink, the pre-shrink fixture |
| T020 | `a85e14f5f5` | Five per-event fields, `VideoPolicy.FINALS_ONLY`, `CompetitionOverrides.tsx` and its test, the driver's per-event referee steps, payload v2 | `CompetitionConfig { fencer_count, flighted }`, fields derived in `buildConfig.ts`, payload v3 |
| T021 | `c956bde6bb`, `df977bf487` | `CompetitionMatrix.tsx`, `FencerCounts.tsx`, `configEditing.test.tsx` | `panels/EventsPanel.tsx` |
| T022 | `260be6b22f` | `globalOverrides`, the old `SettingsPanel`, `deModeLabels.ts`, two test files, the driver's Admin gap steps | `panels/SettingsPanel.tsx`, `de_mode_override` |
| T023 | `d8035a8c61`, `f934b64c79` | – | Smoke ×2, NAC Youth 66, driver restores Staged (finding 8) |
| T024 | `05103d5ff4` | – (old modules went in T026) | `zoomLadder.ts`, `weaponTokens.ts` |
| T025 | `05103d5ff4` | – | Red tests for the canvas, blocks, day summaries |
| T026 | `05103d5ff4`, `01765a3087` | `MatrixCanvas`, `EventBlock`, the old `blockLabels.ts`, `palette.ts`, `windowing.ts`, `zoom.ts`, `geometry.ts`, the 33 `--cat-*` properties, six test files | `Canvas.tsx`, `Block.tsx`, `selectDaySummaries`, `zoomStep` / `fitting`, the footer's zoom toolbar |
| T027 | `41dfe0e31f`, `b9f9ad46b8`, `ce540ffd56`, `2eda25bc66` | – | The SC-005 driver read, the narrow-block icon floor |
| T028 | `5ea2ec5c1c` | `flightingSuggestions` test arguments, absent-key assertions (finding 14) | Red tests for selection and the strip |
| T029 | `5ea2ec5c1c`, `be7e50dd0b` | `AnalysisSlice`, the `flightingSuggestions` parameter, the Accept / Reject rows, `AnalysisResult.flightingSuggestions` | Selection, `setPinned`, `DetailStrip.tsx` |
| T030 | `3b3e53504c` | – | Red tests for the findings list |
| T031 | `3b3e53504c`, `10568db330` | – | `selectFindings`, `FindingSeverity`, `jumpToCompetition`, label helpers moved to `src/lib/` |
| T032 | `3b3e53504c`, `10568db330` | `AnalysisOutput.tsx` and its test | `FindingsPanel.tsx`, the rail badge, the jump and flash |
| T033 | `29f95362f9`, `f072d754b5` | – | Red tests for pinned scheduling |
| T034 | `29f95362f9`, `f072d754b5` | – | `scheduleAll(…, pinned)`, `PINNED_UNCLAIMED`, the pre-claim pass, `buildPinnedPlacements` |
| T035 | `dc1a1b073b` | – | The after-table, nothing moved |
| T036 | `4f6204d41a`, `51df2e7795`, `3d35a84e65` | The Day column | Per-day sections, Print, `@media print` |
| T047 | `3c2d298d5d` | The team-cut coercion loop in `buildConfig.ts` | Two tests renamed "invariant" (finding 7 closed) |
| T045 | `e0402bf768`, `d0844bcbba`, `0f48b38d19` | The two-pill DE mode group and its Default badge, the driver's restore-Staged step | A Default pill with a `{type} default: {mode}` hint (finding 6 closed) |
| T046 | `97c12b9ca7`, `74e42d208b` | `Canvas`'s live `placements` read | `pinnedIds` committed with the schedule (findings 11 and 25 closed) |
| T044 | `68bc3486d9`, `5094129973`, `08fd4208ab`, `172ca790e7`, `37d7f33e91` | Ad-hoc colour classes, dead tokens, the stray `index.css-E` | Mockup tokens on every surface, per-surface shots |
| T048 | `94f1cb739c`, `c61ef2e96a` | – | `warned` prop, `data-warned`, a solid `--flash` edge |
| T049 | `e8c6f2db90`, `f6726047d5` | Three panel `SectionCaption` copies, the `#a3a3a6` tick | One `CAPTION_CLASS` / `SectionCaption` in `common/caption.ts`, `#68686b` tick |
| T037 | `5937f82b6c` | The stale D1 citation | §Virtualization records that windowing was removed on purpose |
| T038 | `15b0c6fe35`, `929774da34`, `45d2a12a4a` | The `src/lib/blockLabels.ts` name, three `--cat-` negatives, a two-spot `weaponVar` case, two driver comments | `src/lib/placementLabels.ts`, a 12-row `weaponVar` table |
| T039 | none (no driver edit) | – | Smoke ×2 at `a6621c0ddf` |
| T040 | none | – | Full check ×2 and the reconciliation, re-run at `401e860d18` |
| T041 | none (bookkeeping `22b2e8fb78`) | – | The owner's print verdict, remarks → T050, T051 |
| T042 | `a6621c0ddf` | – | Backlog §What 013 deliberately left unfixed |
| T050 | `11d8c1573e`, `be22677e96` | The id in mono in the Competition cell | `competitionLabel` from the committed `schedule.competitions` |
| T051 | `401e860d18` | – | Roadmap 023 and three backlog entries |
| T052 | `0f8e25629c` | – | `@page { size: landscape }` |
| T043 | this commit | – | This record, and `spec.md` marked Delivered |

## T038 grep record

The two commands, run from the worktree root. Both run with
`--exclude-dir=smoke-shots` because that directory is gitignored shot output.

```bash
grep -rn --exclude-dir=smoke-shots "TopBar\|RailPanel\|AdvancedPanel\|Scorecard\|AnalysisOutput\|Drawer\b\|CompetitionMatrix\|FencerCounts\|CompetitionOverrides\|windowing\|blockLabels\|palette\.ts\|globalOverrides\|scorecardBaseline\|hoveredMetricId\|flightingSuggestion\|FINALS_ONLY\|--cat-" src/ __tests__/ scripts/
grep -rn --exclude-dir=smoke-shots "data-highlighted\|Auto-schedule all\|Save / Share\|Presets…\|Fit to day\|Strip count\|name: 'Suggest'" scripts/
```

Output: none, exit 1, for both. The orchestrator ran them at `45d2a12a4a`
and T043 ran them again at `a819520ad2`.

The first run on 2026-10-04 was not empty. Three changes made it empty:

- `blockLabels` matched the live `src/lib/blockLabels.ts` that T031 created,
  which reused the retired file's name. It became `src/lib/placementLabels.ts`
  (`15b0c6fe35`).
- `--cat-` and `palette.ts` matched three `weaponTokens.test.ts` cases that
  asserted the retired prefix was absent, which standing rule 14 forbids. Two
  were deleted because the exact-name tables already cover them. The third
  became a hand-written 12-row `weaponVar` table (`15b0c6fe35`). A two-spot
  `weaponVar` case that table made redundant went in `929774da34`. Tests
  went 1762 → 1760 → 1759.
- `AdvancedPanel` and `Presets…` matched two `scripts/smoke.mjs` comments.
  They were reworded (`15b0c6fe35`), and the driver's header comment stopped
  describing the retired Advanced section (`45d2a12a4a`).

## T039 and T040 verification records

**T039, live smoke** at `a6621c0ddf`, dev server from the worktree on
`:5186`, `SMOKE_BASE=http://localhost:5186/piste-planner/ timeout 240 node scripts/smoke.mjs`,
run twice with identical output:

- Run 1 and run 2: **SMOKE PASS** (exit 0), 0 console errors.
- Suggest: ROC Div1A/Vet 15, NAC Youth **66**, NAC Vet/Div1/Junior 80, NAC
  Cadet/Junior 48.
- Boot: 24 schedule rows ("boot places 24 of 24 events"), footer `19 placed ·
  5 unplaced · 0 pinned`. The footer shows the known lane-packer overflow
  (finding 9), which the owner ruled is not a failure. Backlog §The canvas
  calls events unplaced owns it.
- Share round-trip: a 3195-character URL, 12 of 12 rows matched, the Single
  DE-mode override arrived marked as an override and was restored to
  Default.
- No driver edit.

Later smoke runs, all with no driver edit, 0 console errors and Suggest
15/66/80/48: two after T050 (boot 24 rows / 19·5·0) and one after T052.

**T040, the full check**:

- At `a6621c0ddf`, two runs back to back. `tsc -b` exit 0, lint exit 0, suite
  exit 0, 76 files / 1759 tests on both runs. The skip/only grep printed
  nothing (exit 1):
  `grep -rnE 'it\.skip|test\.skip|describe\.skip|\.todo|\.only' __tests__/ src/`.
- Re-run after T050 at `401e860d18`: two identical clean runs, 76 files /
  1764 tests, skip/only grep empty.
- After T052 at `0f8e25629c`: 76 files / 1764 tests, tsc and lint clean.
- On the merged tree (`a819520ad2`): tsc and lint clean, 76 files / 1764
  tests, ledger 18 passing.

**Reconciliation, 1848 → 1759 → 1764.** For each commit, vitest was measured
in a throwaway detached worktree, which was then removed. +a/−r counts the
test names added or removed against the previous 013 commit. Commits where
nothing changed are left out (bookkeeping, smoke, docs and merges are all
0). The rows down to `a6621c0ddf` are pasted from the T040 record. The last
two rows come from T050's record and the T040 re-run.

| Checkpoint | Files / tests | Delta (+a/−r) | What was added or deleted |
|---|---|---|---|
| `1ab0d15c79` T001 start | 68/1848 | – | Starting numbers (T001 record matches) |
| `096f34c8ea` T003+T004 | 70/1849 | +1 (+21/−20) | T003 moved geometry/lanes tests to segments.test/lanes.test (20 renames); T004 +1 Select group case. Matches the T004 record of 70/1849 |
| `a2fa3e3ef2` T005–T009 | 74/1890 | +41 (+53/−12) | footprint +5 (T005), store +5 (T006 records 4, so 1 is unattributed inside the combined commit), exportActions +14 (T007), ErrorBoundary +3 (T008), Inspector +9, ToolRail +7, viewState +3, Shell +4/−2, Advanced +3/−3 (T009). RailPanel −7: summary-slot cases with no successor, recorded in T009 |
| `a72c45b7ab` T010 | 76/1903 | +13 (+29/−16) | saveLoadShare 12 re-pointed to ExportPopover (13, +Copy case); Header +8, time +4; top-bar cases re-pointed; strip-count describe removed (recorded, covered by number-input.test) |
| `031c4b7f9b` T010 f/u | 76/1904 | +1 | FileReader-failure case (recorded) |
| `4644f98b9a` T011 | 75/1854 | −50 (+28/−78) | Scorecard −22, scorecardBaseline −20, scorecardMetrics −32 deleted with their subjects (D7, recorded); recompute hover −1; viewState −2 (drawerHeight/scorecardExpanded, decision 3); footerMetrics +16, StatusFooter +9, footprint +2 |
| `a3367af740` T012+T013 | 75/1837 | −17 (+13/−30) | UnplacedTray 3 → UnplacedDock 5 (+2, T012 record 1856); EventBlock highlight −15, MatrixCanvas highlight −5 (D7); Shell +7/−6 (+1). Matches the record 1856 → 1837 = −20+1 |
| `30c7c452b0` T014 | 75/1840 | +3 | CanvasTooltip wrapper ×2, selectPlacementCounts overflow-once (T011 review fix) |
| `410d8ef46b`, `37987dc5dc` | 75/1841, 75/1842 | +1, +1 | CanvasTooltip warn/DEV=false cases. 1842 = handoff phase-1 checkpoint |
| `1e730723b7` T016–T018 | 75/1849 | +7 (+32/−25) | TournamentPanel +7, computeSuggestedStrips +6 replaces suggestStrips −5, StripsPanel +19 (record says '24 cases'); StripSetup/TournamentSetup/configEditing −9; AdvancedPanel −11 (Default-badge and DE-summary cases dropped per the record; video-marker cases moved to StripsPanel steppers; ROC coverage restored in `8f670eba53`) |
| `a85e14f5f5` T020 | 75/1848 (1 suite red: EventsPanel module missing, as recorded) | −1 (+41/−42) | typeDefaults net −2 and precedence net −4 (the recorded 'dropped without successor' ×2+×2+×2); CompetitionOverrides −4 (deleted by the T020 task line 673); serialization v2 ref_policy/de_mode cases replaced by v3/flighted cases (net −1); buildConfig +9, store +1 |
| `8f670eba53` T018 f/u | 75/1851 | +3 | runSearch-rejection case, video-strips ROC/type-change cases restored |
| `c956bde6bb` T021 | 74/1858 | +7 (+13/−6) | EventsPanel 13 (11 + 2 recorded successor gaps) replaces configEditing CompetitionMatrix/FencerCounts −6 |
| `260be6b22f` T022 | 72/1835 | −23 (+33/−56) | old SettingsPanel 27 → panels/SettingsPanel 23; globalOverrides.test −14 and settingsSerialization.test −12 deleted with the GlobalOverrides surface (task line 719, commit message); buildConfig +4/−1, store +2/−2, serialization +4 |
| `df977bf487` | 72/1837 | +2 | chip render isolation, absent de_mode_override → null |
| `9da51b1b15` | 72/1838 | +1 | suggested minimum clears on input change |
| `e4fcd29058` | 72/1840 | +2 | in-flight search invalidation ×2 |
| `05103d5ff4` T024–T026 | 71/1663 | −177 (+129/−306) | six SVG-canvas test files deleted (EventBlock 41, MatrixCanvas 75, geometry 22, palette 62, windowing 47 with no successor per T025, zoom 44) plus CanvasTooltip 7 rewritten, viewState 7; added Block 18, Canvas 9, CanvasTooltip 7, weaponTokens 42, zoomLadder 24, StatusFooter 15, daySummaries 4, viewState 9, viewEquivalence 1 |
| `01765a3087` | 71/1666 | +3 (+4/−1) | day-band committed-model cases (recorded) |
| `41dfe0e31f`, `b9f9ad46b8`, `ce540ffd56` T027 | 71/1668, 1668, 1671 | +2, 0 (rename), +3 | narrow-block icon floor cases. 1671 = phase-3 checkpoint |
| `5ea2ec5c1c` T028–T029 | 73/1683 | +12 (+25/−13) | DetailStrip/selection/viewState cases; flighting-suggestion cases deleted with AnalysisResult.flightingSuggestions (T028 sweep, T029 record) |
| `be7e50dd0b` | 73/1685 | +2 | out-of-range strip and blocker-packing cases |
| `3b3e53504c` T030–T032 | 74/1718 | +33 (+42/−9) | findings/FindingsPanel/badge/jump; analysisOutput −6 re-targeted to FindingsPanel; 3 cases re-pointed to selectFindings |
| `10568db330` | 74/1722 | +4 | StrictMode jump, INFO → Note, Note no-dismiss, tie-break (recorded) |
| `29f95362f9` T034 | 76/1738 | +16 | pinnedScheduling 7, stripSearch 1, findings 1, runActions 7 |
| `f072d754b5` | 76/1739 | +1 | unknown-id pin case (finding 23) |
| `4f6204d41a` T036 | 76/1747 | +8 | ScheduleOutput 7 + print 1 (record says 'Nine cases added'; 1747 matches) |
| `e9fca69e70` (main) | 76/1747 | 0 (+43/−43) | spec references stripped from test titles, rename only |
| `3c2d298d5d` T047 | 76/1747 | 0 (2 renames) | coercion → invariant (recorded). The T040 measurement said 3, but the commit diff shows two reworded names (the describe title and the it.each title) |
| `e0402bf768` T045 | 76/1749 | +2 (+6/−4) | 4 two-pill DE-mode cases replaced by 6 Default/Staged/Single cases (record says '7 cases') |
| `97c12b9ca7` T046 | 76/1752 | +3 | pin-badge cases (record: 3) |
| `0f48b38d19` | 76/1753 | +1 (+2/−1) | team cut invariant split into NAC and ROC |
| `74e42d208b` | 76/1753 | 0 (rename) | invalidState pin-badge case tightened. `8512bed20c` branch base = 1753 |
| `94f1cb739c` T048 | 76/1761 | +8 | Block edge 3, Canvas findings edge 5 |
| `c61ef2e96a` T048 f/u | 76/1762 | +1 (+4/−3) | 3 Canvas cases renamed to add 'never its overflow block'; +1 re-render style-warning case |
| `e8c6f2db90` / `f6726047d5` T049 | 76/1762 | 0 | no test edit (recorded) |
| `15b0c6fe35` T038 f/u | 76/1760 | −2 (+1/−3) | three 'never --cat-' negatives deleted (covered by the exact-name it.each for WEAPON_TOKENS and weaponToken); +1 exact 12-row weaponVar table. Commit message records 1762 → 1760 |
| `929774da34` T038 review f/u | 76/1759 | −1 | 2-spot 'wraps the token name in var(...)' case deleted, covered by the 12-row exact table |
| `a6621c0ddf` T042 | 76/1759 | 0 | docs only |
| `11d8c1573e` T050 | 76/1763 | +4 | Competition cell names: label, fallback and naming cases (commit message: 1759 → 1763) |
| `be22677e96` T050 f/u | 76/1764 | +1 | id tie-break case; fallback fixture now a real catalogue id left out of the committed list. T050 record: +5 by name, none removed |

The chain closes at 1848 → 1759, net −89, and then 1759 → 1764, net +5.
Every checkpoint total recorded in `tasks.md` and §Measurements matches its
measured value. Every deletion either names its successor in the record or
went with the surface it tested. The phase 8 `weaponTokens` change made the
assertions stricter, because exact-equality tables replaced the negative
`not.toContain` checks. Some prose case counts differ from the number of
names measured: T018 "24" against 19, T036 "Nine" against 8, T045 "7"
against 6 new and 4 replaced, T006 4 against 5, and T047 3 renames in the T040 measurement against 2 in the commit diff and the task record. Those differences open
no gap in the totals. Verdict: **reconciles**.

## Merge

The user merges `013-phase8-finish` into `main` with `merge-with-costs`,
from the main checkout `/Users/noahlz/projects/piste-planner`. Never squash
it, and never merge by hand followed by `commit-with-costs`.

What was checked on the merged tree, at branch SHA
`a819520ad2bd1e3cc5a4d3833588ee9d859dd569`:

- `main` is `8512bed20c` and an ancestor of the branch, so the merge is a
  fast-forward. `git merge-tree --write-tree` found no conflicts, and the
  merge tree `438ea2203954…` is identical to the branch's tree.
- On a throwaway merge commit checked out in a detached worktree (since
  removed): `tsc -b` and lint exit 0, 76 files / 1764 tests pass, the drift
  ledger passes (18 tests) with snapshot SHA `5483c40c1349…` unchanged, and
  `package.json` and `pnpm-lock.yaml` are byte-identical to `main`'s.

Nothing in the main checkout blocks the merge. T043 confirmed that `main` is
at `8512bed20c` and that `git status --short --untracked-files=all` in the
main checkout prints nothing, so there are no modified, staged or untracked
files. T001 cut the branch from a commit that already carried `tasks.md`, so
no copy of it was left uncommitted in the main checkout.

Every commit after `a819520ad2` touches only `specs/`. The only such commit
is this one, T043, which changes `specs/013-workbench-redesign/handoff.md`
and `spec.md`. The suite, tsc and lint results above therefore hold for the
tip as well. T043's box in `tasks.md` is left for the orchestrator to tick.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 013 (the workbench redesign) is delivered and merged
into main, and its record is specs/013-workbench-redesign/handoff.md.

Next is roadmap feature 014, structured bottlenecks:
docs/design/competition-planner-workbench.md §Roadmap row 014, and
docs/design/backlog.md §"`Bottleneck` has no structured field for a second
subject". Note that 023 (team events go straight to DE) now sits after 015,
and it cannot start until the owner amends METHODOLOGY.md.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch. Plan 014 yourself: no Spec Kit, choose the planning approach, and keep
the constitution's guardrails (drift ledger, test-first, live smoke, git
ownership).
```
