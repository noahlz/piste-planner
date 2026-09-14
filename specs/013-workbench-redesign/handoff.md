# 013 handoff

Session record for the workbench redesign. Findings, verdicts and parity
exceptions live here rather than in `spec.md` – reconciliation prose stays out
of the spec.

## Verdicts

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
