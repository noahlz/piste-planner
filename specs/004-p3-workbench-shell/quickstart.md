# Quickstart: Verifying P3

How to confirm this feature works. Commands come from `CLAUDE.md`; read logs
only on failure.

```bash
timeout 180 pnpm exec tsc -b        > ./tmp/tsc.log  2>&1   # typecheck
timeout 120 pnpm --silent lint      > ./tmp/lint.log 2>&1   # lint
timeout 120 pnpm --silent test      > ./tmp/test.log 2>&1   # all tests
```

Live verification, per constitution VI:

```bash
pnpm dev &                                                  # or any server on SMOKE_BASE
timeout 120 pnpm --silent smoke     > ./tmp/smoke.log 2>&1
```

`scripts/smoke.mjs` exits 0 with `SMOKE PASS` on the last line, or exits 1
naming the failed step. It is a repo artifact – repair its locators in place,
never in a scratch file.

---

## The drift gate

US4 changes engine output. Constitution III governs it, and this is the check
that gate turns on.

Run the B1–B8 scenarios before the change and keep the numbers. Run them after.
Then, in the commit that makes the change, record:

- **Scheduled event count per scenario, before and after.** These must be
  identical. A drop on any scenario halts the task until the cause is found and
  recorded – it is not accepted because the referee story explains it.
- **Referee demand per scenario, before and after**, with the reason each moved.

Two changes land together and both are expected to move referee figures:

| Change | Affects | Expected direction |
|---|---|---|
| `RefPolicy.AUTO` resolving per type (research D5) | B6 only, the one ROC preset | Pool referee demand roughly halves. NAC, SYC, and SJCC presets do not move. |
| `de_mode` defaulting to staged at NAC (research D6) | B1, B2, B3, B7, B8 | DE referee demand rises steeply. P1's DE referee correction puts staged-DE figures around fourfold, and this applies it to NAC events for the first time. |

The second is the larger drift and the one most likely to hide a real
regression inside a plausible number. Read its diff rather than accepting it.

---

## Verifying each story

### US1 – The shell

1. Open the app with no URL fragment. A populated schedule is on screen in the
   first frame, with no click.
2. Look for a layout toggle. There is none, and neither prior layout is
   reachable by any route.
3. Change a fencer count. The drawer's numbers move as you type; the center
   relayouts once the edit settles, not per keystroke.
4. Enter a fencer count outside the valid range. The center dims and shows
   blocking findings. **It does not blank.**
5. Add an event without placing it. It appears in the unplaced tray.
6. Trigger `Auto-schedule all`. Every event is placed and the center follows.
7. Generate a share link, open it in a new tab, and confirm the same schedule.

### US2 – The matrix

1. Switch to the matrix. Every scheduled event is a block on the right strips at
   the right times, grouped under its day.
2. Scroll down. Strip labels stay in the frozen gutter; the day header stays as
   a sticky band.
3. Compare two events from different category families. Their fills differ.
   Compare a pool block and a DE block of one event. Their fill matches and
   their edge-bar and hatch differ.
4. Zoom the time axis. It is continuous, anchored at the cursor, and the hour
   axis stays pinned.
5. Step the row height through compact, normal, and tall. It steps rather than
   scaling.
6. Zoom out until blocks are narrow. Icons drop, then labels. Hover one – the
   tooltip carries what dropped.
7. Hover a block near the right edge of the viewport. The tooltip flips rather
   than being cut off.
8. Load the largest preset and pan and zoom. The view keeps up with the gesture.
9. Toggle to the schedule table. The same events on the same days at the same
   times.

### US3 – The scorecard

1. Load a preset. Collapsed, the scorecard shows finish time and peak referee
   demand, and no aggregate score.
2. Change something. Each metric shows its delta from the preset baseline.
3. Change something else. The baseline has not moved.
4. Expand. The full metric set is present.
5. Hover a metric. The blocks driving it highlight.
6. Reload. Still expanded.
7. Share the URL and open it elsewhere. The recipient's expansion state is their
   own, and no baseline travelled.

### US4 – Per-type defaults

1. Pick each tournament type. Referee count, video strips, and DE mode take that
   type's values per [data-model.md](./data-model.md).
2. Collapse the Advanced panel. The applied defaults are readable as dim text.
3. Set a referee count by hand. It is marked as explicit.
4. **Change the tournament type. The hand-set value survives.** Everything still
   following its default moves. This is the behavior the spec's clarification
   settled, and it is the one most worth checking by hand.
5. Return that value to following its default. It moves with the type again.
6. Run the drift gate above.

### US5 – The gears

1. Open the gears. The admin gap, flight buffer, and flighting threshold are
   there – three settings that were saved and shared but unreachable before this
   feature.
2. Pool round durations are there too, and no longer in the rail.
3. Every unmodified setting shows its default.
4. Change one. It is marked as overridden, offers a reset, and the schedule
   reflects it.
5. Reset it. Back to the default.
6. Change two settings, share the URL, reopen it. Those two come back; every
   other setting still tracks its default.
7. Look for scheduling weights or penalty matrices. They are not there – that is
   backlog work for after P5.

---

## What a human has to confirm

Two success criteria cannot be asserted by a test, and both are judgments about
whether the canvas is legible rather than whether it is correct. Confirm them
during the live smoke run at the end of US2, and again at the end of the
feature.

- **SC-004** – shown a block at normal row height, can you name its age
  category, phase, weapon, and gender without hovering or clicking? A test can
  confirm the encoding tokens are present and distinct. It cannot confirm they
  are distinguishable to a person, and sixteen fills across four families is
  exactly where that fails quietly.
- **SC-002** – does panning and zooming the largest tournament keep up with the
  gesture? A frame-budget number would be a proxy. The criterion is whether it
  feels like it stalls.

If either fails, it is a finding against the palette or the windowing, not a
matter of taste to be waved through.

---

## Definition of done

- [ ] Typecheck, lint, and the full test suite pass.
- [ ] `scripts/smoke.mjs` passes against the workbench, with every locator
      re-pointed in the task that reshaped the control it drives.
- [ ] No test in the suite references `WizardShell`, `KitchenSinkPage`, or
      `layoutMode`.
- [ ] B1–B8 scheduled event counts are identical before and after; referee
      changes are explained and recorded in the commit that made them.
- [ ] The two human judgments above have been made by a person.
- [ ] The branch is ready and handed to the user. The closing merge is theirs
      (constitution §Git Ownership).
