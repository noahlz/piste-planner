# Project Reassessment — 2026-08-31

A deep state-of-the-project analysis taken before S6 (US3, the scorecard).
Written for future coding sessions. Facts below were verified against the
worktree at `c8c23ee686` (branch `004-p3-workbench-shell`, main at
`b2abfb895c`) on 2026-08-31 — re-verify anything load-bearing before acting
on it.

## 1. Where the project stands

> **Superseded 2026-09-01.** This section's status table and the GitHub issue
> counts below it are stale — 004 closed with US5 merged as `1fc119ae00`, and
> 006 and 008 have since merged too. The current table is
> [reassessment-2026-09-01.md §1](./reassessment-2026-09-01.md). §2–§4 of this
> file remain the record of the day-axis finding and the sequence it produced.

| Feature | Scope | Status |
|---|---|---|
| 001-p1-foundations | P1: SLOT_MINS 5, pod/double-strip removal, capacity collapse, DE ref correction | merged |
| 002-configurable-pool-durations | user-editable pool duration table | merged |
| 003-p2-derived-state | P2: placements as intent, store inversion, staleness removal, presets in `src/data` | merged |
| 005-consolidate-domain-logic | test re-targeting off the old layouts | merged |
| 004-p3-workbench-shell | P3: shell, canvas, scorecard, per-type defaults, gears | US1+US2 merged to main (`b2abfb895c`); US3 drafted as `sessions/S6.md`; US4, US5, Phase 8 remain |
| P4 manual placement | drag, unpack-to-blocks, undo/redo, auto-fill unplaced | not specced |
| P5 FLUID allocator | deferred | not specced |

Suite at branch head: **1221 passed / 51 files**, `tsc -b` and lint clean,
`scripts/smoke.mjs` passing and driving the matrix. Engine byte-identical to
main through all of 004 so far (only US4 may change it).

GitHub: 149 task-mirror issues closed, 51 open. Housekeeping: issues for
T026–T043 (#186–#199 area) are still open although their commits are pushed —
per the close policy they can close now. Open issues #204–#245 mirror the
remaining T044–T085.

## 2. Finding F1 — the app schedules half of B1 at boot

**The headline finding of this review. Verified by execution, not read.**

The app boots into preset B1 (FR-007) and places **11 of 24 events**; the
other 13 sit in the unplaced tray and the boot canvas is half-empty. The
drift ledger records B1 as **24/24 scheduled**. Both are true, because the
app and the test suite build different `TournamentConfig`s:

```
store path (applyPreset → buildTournamentConfig → scheduleAll):  11 of 24
same, with cfg.dayConfigs = []:                                  24 of 24
factory path (buildCompetitions + tournamentConfig, the ledger): 24 of 24
```

Isolation (each mutation applied alone to the store path): staged `de_mode`
→ 12/24, `strips_allocated` → 11/24, **empty `dayConfigs` → 24/24**. The
day windows are the cause; the rest is noise.

**Root cause — the engine has two time axes and the store feeds one into the
other.** `dayStart`/`dayEnd` (`src/engine/types.ts:437-452`):

- `dayConfigs` empty: day *d* spans `[d*DAY_LENGTH_MINS, (d+1)*DAY_LENGTH_MINS)`
  — a **compacted continuous axis** (DAY_LENGTH_MINS = 840). Ledger-path
  day-1 events come back with `pool_start: 840`, an axis position, not a
  clock time.
- `dayConfigs` populated: day *d* spans whatever the config says. The store
  writes clock times (`[480, 1320)`) for **every** day, so on the engine's
  absolute axis all four day windows coincide. Per-day resource buckets
  still exist (the 11 placed events spread 2/4/4/1 across days), but the
  cross-day rules that read the absolute axis misbehave, and 13 events fail
  to schedule at 80 strips where the compacted axis fits all 24.

**Why nothing caught it:** the B1–B8 ledger and every integration test run
the factory path (`dayConfigs: []`), so they validate a configuration the
app never constructs. The smoke driver's block/row floors were lowered to
"non-empty" (for the legitimate ROC strip-shortfall reason), so a half-empty
boot passes. And no human had looked at the UI. `scripts/smoke-shots/01-initial.png`
shows the symptom: 13 chips in the tray at boot.

**Repro** (from the worktree root):

```
npx tsx -e "
import { applyPreset } from './src/store/presets.ts'
import { runScheduleAll } from './src/store/runActions.ts'
import { useStore } from './src/store/store.ts'
applyPreset('B1'); runScheduleAll()
const s = useStore.getState()
console.log(Object.keys(s.placements).length, 'of', Object.keys(s.selectedCompetitions).length)"
```

**Fix direction (decide in the fix task, not here):** the leading option
keeps `src/engine/` untouched — `buildConfig.ts` emits `dayConfigs` on a
non-overlapping absolute axis (day *d* = `[d*1440 + start, d*1440 + end)`),
and `runScheduleAll` converts `pool_start` back to minutes-from-midnight
(`- day*1440`) when writing placements. Zero engine drift by construction.
The risk to check: any rule that measures **distance between days in
minutes** (crossover penalties, rest-day logic, `daySequencing`) behaves
differently at 1440-spacing than at 840-compaction — run the ledger and a
new app-path parity check on both. The alternative — teaching the engine
per-day windows natively — is cleaner long-term but touches scheduler
internals and needs the full constitution III treatment.

**Regardless of fix shape, add the missing bridge test:** for each B1–B8
preset, `applyPreset → buildTournamentConfig → scheduleAll` must schedule
the same event count the ledger records. That one test makes the entire
drift ledger protect the app instead of a parallel universe.

**Sequencing consequence:** fix F1 **before** S6. The scorecard freezes a
baseline at preset load; frozen metrics over an 11-event B1 are numbers
nobody should anchor to.

## 3. Architecture assessment

**Sound, keep:**

- The pure-engine boundary (constitution I) is real. `src/engine/` has no
  UI or store imports, `buildConfig.ts` is genuinely the only bridge.
- Placements-as-intent (design decision 4) is implemented as designed:
  `PlacementsSlice` is the only schedule state, everything else derives
  through memoized selectors in `store/derived.ts`.
- `deriveEventSchedule` re-orchestrates scheduler math for one event — a
  duplication risk — but `__tests__/engine/derive.test.ts` uses a live
  `scheduleAll` run as its oracle, which is the right guard. Keep that
  oracle test whenever either side changes.
- The mutation-testing review discipline has caught six green-suite holes in
  004 alone plus the blank-canvas bug both reviewers found independently.
  It is expensive and it is earning its cost.

**Debt, in priority order:**

1. **The day/time-axis duality (F1).** The deepest issue. "Time is minutes
   from midnight" (CLAUDE.md) holds in the store, canvas, and serialization,
   while the scheduler's native axis is compacted day-offsets. Until F1 is
   fixed, the ledger validates a path the app doesn't use.
2. **Advisory vs binding validation (design decision 5) is not wired.**
   `store/derived.ts` calls `validateConfig(..., ValidationMode.BINDING)`
   with a comment deferring advisory mode. P4's whole premise — the user may
   violate policy knowingly — needs it. Fold into the P4 spec.
3. **The placement model cannot express partial knowledge.** `runScheduleAll`
   drops any event without `pool_start`; there is no "day known, time
   unknown" state. This is why under-placement is silent apart from the
   tray. P4's drag model will need placement states anyway — design them
   together.
4. **Flighting is unreachable from the store.** `buildConfig.ts:126` pins
   `flighted: false`, and the only raising path also sets a group id, which
   `derive.ts` requires null before splitting flights. The canvas can render
   flight pairs that no user state can produce. Product decision needed:
   expose flighting as user intent, or drop the dead rendering paths.
5. **The re-homed legacy rail.** `TournamentSetup`, `StripSetup`,
   `CompetitionMatrix`, `FencerCounts`, `CompetitionOverrides` moved into
   the rail *unmodified* (deliberately, to preserve 005's re-targeted
   tests). The smoke screenshots show the cost: `CompetitionMatrix` was
   built for a wide card and is cramped and overlapping at 320px, day-time
   selects truncate ("10:00 P"), and the top bar and rail both edit
   type/days/strips (the FR-003/FR-004 duplication recorded in S2). This is
   the remaining "kitchen-sink debris" — the layouts are gone, their organs
   live on. The user directed on 2026-08-31 that these be replaced with
   purpose-built workbench panels rather than carefully preserved.
6. Smaller, recorded in handoffs: dimmed stale content is not `aria-hidden`
   (product call), flighted events read differently in the two views,
   `ScheduleOutput` keeps a live subscription, the day band hit-tests
   through, no `.nvmrc`/`engines` pin while local Node 24 exercises a
   `localStorage` shim CI never runs.

## 4. Roadmap revision — recommended sequence

The user's standing directive (2026-08-31): wizard/kitchen-sink era gets no
preservation effort — tear up and redo UI freely, preserve the engine and
the methodology. Already-done deletions (T020–T023) satisfied most of this;
what remains is the rail.

1. **S6-pre — fix F1** (small, one session): buildConfig day-axis
   translation + the app-path parity test + smoke floor restored to a real
   number for B1 boot. Zero engine drift expected; run the ledger to prove
   it.
2. **S6 — US3 scorecard** as drafted in `sessions/S6.md` (now over real
   numbers).
3. **S7 — US4 per-type defaults**, the drift gate, as planned. Note US4
   also moves the boot experience: NAC presets get staged DE, which is the
   de_mode the real tournaments ran.
4. **S8 — US5 gears + Phase 8 validation/handoff**, closing 004. US5 is
   small and mechanical; combining it with close-out is fine.
5. **Rail rebuild** — new small feature (or the opening story of P4):
   replace the five re-homed section components with purpose-built rail
   panels, resolve the top-bar/rail duplication, fix the truncation. Do it
   **after** the user has looked at the running app and marked what else
   reads wrong, so it's one redo, not two. The 005-style test triage does
   not need repeating — tests re-target to the new panels as they're built
   (constitution II), and per the user's directive, no effort goes into
   preserving the old components' look.
6. **P4 manual placement** — spec it to absorb: advisory validation wiring,
   placement states (unplaced / day-only / placed / pinned), flighting as
   user intent (or removal), zoom-to-selection enablement, undo/redo, and
   the `Auto-fill unplaced` engine change (pre-seeded scheduler state).
   This is the product's thesis and the largest remaining engine risk.

**What not to do:** a big-bang rewrite. The phase discipline is not
ceremony here — it has caught a silent regression class repeatedly, and F1
is exactly what happens in the one seam the discipline didn't cover. Bold
is fine for UI (zero users, tests re-target cheaply). Bold in the engine
means: make the change in one move *behind the ledger*, never loosen the
ledger to make a change fit.

## 5. The UI question

The UI exists and is screenshot-verified (`scripts/smoke-shots/`). Do not
mock up what is already built. Instead:

- The user spends 10 minutes in the running app (`pnpm dev`) — first look
  ever — and marks what reads wrong. That list feeds the rail rebuild.
  This front-loads T082's human judgments (SC-002, SC-004) instead of
  leaving them to 004's close.
- Claude Design mockups are worth it for **P4's interactions only** (drag
  placement, unpack-to-blocks, tray affordances, findings-on-drop), where
  nothing is built and rework is expensive.

## 6. Verification snapshot (for future sessions)

- Suite: `timeout 200 pnpm --silent test` → 1221/1221, run twice.
- Engine drift: `git diff --stat 2f98ee5126^1 HEAD -- src/engine/` → empty.
- F1 repro: §2 above. Expected until fixed: `11 of 24`.
- Boot preset: `DEFAULT_PRESET_ID = 'B1'` in `src/store/boot.ts`.
- The stale-memory trap: `applyPreset` exists since S2 (`src/store/presets.ts`);
  `loadedPresetId` is not serialized; the S6 prompt's orientation list is
  current and correct.
