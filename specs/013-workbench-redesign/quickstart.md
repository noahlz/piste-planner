# Quickstart: verifying 013

How to confirm the feature works, in the order the confidence builds: the
engine agrees with itself, the store and components agree with the engine, and
the running browser agrees with all three. A green suite proves the first two
and **not** the third (constitution VI).

## Prerequisites

- A fresh worktree per session, named for the branch:
  `/Users/noahlz/projects/piste-planner-013-workbench-redesign` on
  `013-workbench-redesign`, branched from `main` at `78ae3b28f4` or later
- `pnpm install` complete
- `drift-baseline.md` written before any `src/engine/` edit, recording every
  B1–B8 scheduled count and the ledger snapshot hash at the branch point

## 1. The three checks

```bash
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

Read the logs only on failure. All three must be clean before anything below
is worth running, and again on the merged tree before the merge commit is
written.

## 2. The retired surfaces are gone (SC-002)

```bash
grep -rn "TopBar\|RailPanel\|AdvancedPanel\|Scorecard\|AnalysisOutput\|Drawer\b\|CompetitionMatrix\|FencerCounts\|CompetitionOverrides\|windowing\|blockLabels\|palette\.ts\|globalOverrides\|scorecardBaseline\|hoveredMetricId\|flightingSuggestion\|FINALS_ONLY\|--cat-" src/ __tests__/ scripts/
```

Expected: no output. Run this at the end of every story, not only at close,
because a deletion that slips a story is a duplicate control for the length of
the next one.

## 3. The shell, at real size (SC-001, FR-069)

Run the app, load preset B1 (the boot default: 4 days, 80 strips, 24 events),
and take a full-window screenshot at 1440×900 and 1920×1080. This is the
**product owner's judgment**, taken at the end of story 1 and before the
canvas is rewritten. What they are judging:

- one header, one dock, one rail, one footer, and no second copy of type,
  days or strips anywhere
- density: whether 80 strip rows across four days read as a board or a smear
- legibility of the header summary, the dock chips and the footer at 100%

Record the verdict in `handoff.md`. A "no" halts story 3 until the look is
revised.

## 4. The engine story: around pins, and unmoved without them (SC-003, SC-004)

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/pinnedScheduling.test.ts > ./tmp/test.log 2>&1
timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1
```

Expected from the new test file:

- six events pinned across three days of B1 keep their `assigned_day` and
  `pool_start`, and the other eighteen are placed
- an event a crossover rule forbids from sharing a pinned event's day is placed
  elsewhere
- no auto-placed block overlaps a pinned event's strips at its time
- every event pinned: the result equals the input and the run reports zero
  placed
- two pins over capacity: both keep their day and start, the overflow appears
  in the store's Unplaced finding, the rest still packs
- a pin on a day outside `days_available`: not honoured, re-placed unpinned

Expected from the ledger: **no scheduled count moves** on any of the eight
scenarios, and the snapshot diff is empty or explained line by line in the
task's commit message. A moved count on the no-pins path halts the task. This
is stricter than the ledger's floors: the floors catch a drop, this story
forbids any movement.

## 5. The store shrinks and round-trips (SC-006)

```bash
timeout 120 pnpm --silent vitest run __tests__/store/serialization.test.ts __tests__/store/buildConfig.test.ts > ./tmp/test.log 2>&1
```

Expected: a v3 payload carries `fencer_count`, `flighted` and
`de_mode_override` and nothing per-event beyond the two; a v2 payload is
refused; `buildTournamentConfig` derives `ref_policy`, cut, `de_mode`,
`de_video_policy` and the engine constants exactly as the retired fields did
on a default store, so the ledger's app-path parity test
(`__tests__/store/appPathParity.test.ts`) is unchanged.

## 6. Findings lead to the event (SC-007)

```bash
timeout 120 pnpm --silent vitest run __tests__/store/findings.test.ts __tests__/components/workbench/FindingsPanel.test.tsx > ./tmp/test.log 2>&1
```

Expected: every row has a severity, a location and a message; an overflow
board yields an Unplaced row naming the strips; a day ending 30 minutes after
its last event yields a Late finish row at Warning; a hand move past the
day's close yields the same row with the overrun in its message; **Show on
grid** appears only with a target and sets the selection.

## 7. The canvas, at every rung (SC-005)

```bash
timeout 120 pnpm --silent vitest run __tests__/components/canvas/ > ./tmp/test.log 2>&1
```

Expected: 320 gutter rows for B1 with no windowing, six zoom levels with the
controls disabled at the ends, `data-weapon` on every block, `data-overflow`
on the packer's overflow, `data-pinned` on pins, `data-flagged` on gutter rows
a finding targets, and the view-equivalence tuple set unchanged between the
matrix and the table.

## 8. Print (SC-008)

Run the app, load B1, switch to Schedule, press **Print**, and save to PDF.
Expected: four pages, one per day, each holding that day's table and nothing
else, legible in greyscale. This is a human check; the unit test asserts only
that the print stylesheet hides every region but the schedule and that each
day section carries a page break.

## 9. Live, in the browser (SC-013)

The step nothing above substitutes for. Use the `live-smoke` skill; the driver
is `scripts/smoke.mjs`, re-pointed **in place** in each task that reshapes a
control ([research D14](./research.md) holds the map), never rewritten.

Pass condition: SMOKE PASS twice, 0 console errors, boot places 24 of 24, all
four **Suggest** presses (now open-panel-and-Apply) return their counts, and
the share link round-trips.

**One number is expected to move.** The driver's NAC Youth suggestion has read
63 in the driver's accumulated state and 66 from a fresh store, because the
driver's Admin gap override step changed the search's config
(backlog §NAC Youth suggests 63 in the smoke driver's accumulated state).
That override control is deleted with `GlobalOverrides` (D5), so the step goes
and NAC Youth should read **66** in the driver from this feature on. Record
the observed value in `handoff.md`.

## What "done" means

1. `tsc -b`, `lint` and the full suite clean, on the branch and on the merged tree
2. §2's search returns nothing
3. The product owner's screenshot verdict recorded, taken after story 1
4. `pinnedScheduling.test.ts` green and the ledger unmoved on every scenario
5. A v3 share link round-trips and a v2 one is refused
6. `scripts/smoke.mjs` passes twice with 0 console errors
7. `docs/design/competition-planner-workbench.md` §Virtualization records the
   windowing removal (FR-070)
8. `handoff.md` written, with what this feature deliberately did not fix

Then stop and hand the branch to the user. The merge commit is theirs.
