# Parity Exceptions: the four rows the app path does not match the ledger on

**Feature**: 006-day-axis-parity | **Task**: T012 (FR-004a classification) |
**Measured**: 2026-08-31, on `b20f351347` (the axis fix, T006/T008)

This is the classification T012 owes FR-004a. It lives beside
[`baseline.md`](./baseline.md) rather than inside it because baseline.md is the
*pre-change* record, captured before any source file was edited, and stays that.
The pinned numbers themselves are in `__tests__/store/appPathParity.test.ts`,
each with the short form of its entry here.

## The verdict first

**No gap traces to the day axis.** Four of the eight reference tournaments still
differ from the ledger, and all four differences are FR-004a exceptions traced to
per-competition defaults the two paths have not converged on. All four close in
004's US4.

| | Pinned (app path) | Ledger | Traced cause | Closes in |
|---|---:|---:|---|---|
| B1 | 24 | 24 | — matches | — |
| B2 | **0** | 24 | team `cut_mode` — a BINDING validation ERROR | 004 US4 |
| B3 | 24 | 24 | — matches | — |
| B4 | **16** | 0 | `strips_allocated: 0` hides demand from the feasibility gate | 004 US4 |
| B5 | 12 | 12 | — matches | — |
| B6 | **43** | 44 | DE bracket sizes: regional cut override + DE staging | 004 US4 |
| B7 | 18 | 18 | — matches | — |
| B8 | **0** | 52 | team `cut_mode` — same as B2 | 004 US4 |

## How the day axis was ruled out

Not by argument — per row, by isolation. Two runs per scenario, each holding one
half of the input fixed:

- **Swap only the config** (the app's `[d*1440 + start_d, d*1440 + end_d)`
  windows for the ledger's empty `dayConfigs`, which puts day *d* at
  `[d*840, (d+1)*840)`, and back), keeping the competitions as they are.
- **Swap only the competitions** (the ledger's factory output for the store's),
  keeping the config as it is.

| | app comps + app config | app comps + ledger config | ledger comps + app config | ledger comps + ledger config |
|---|---:|---:|---:|---:|
| B4 | 16 | **16** | 0 | **0** |
| B6 | 43 | **43** | 44 | **44** |

Swapping the axis moves nothing. Swapping the per-competition defaults
reproduces the other path's count exactly, in both directions. The same holds
for B2 and B8: once their team `cut_mode` is corrected, the app path returns 24
and 53 on the app's config and 24 and 53 on the ledger's config — identical.

A third run confirms it from the other side: `app comps + app config with
dayConfigs: []` — the app's own competitions on the ledger's compacted 840-minute
axis — returns 43 for B6 and 16 for B4, the same numbers the 1440-spaced axis
returns.

## The seam all four share

Two files build a `Competition` from the same catalogue entry and disagree:

| | Store (`src/store/store.ts:217-235`, `src/store/buildConfig.ts:110-151`) | Ledger factory (`__tests__/helpers/scenarios.ts:29-57`) |
|---|---|---|
| `cut_mode` for a TEAM event | `DEFAULT_CUT_BY_CATEGORY[category]` — no team branch (`store.ts:220,229`) | `CutMode.DISABLED` / 100 when `isTeam` (`scenarios.ts:35-37`) |
| `cut_mode` at a regional type | `REGIONAL_CUT_OVERRIDES` applied (`buildConfig.ts:156-164`) | not applied |
| `de_mode` | hardcoded `SINGLE_STAGE` (`store.ts:231`) | `STAGED` when individual and video REQUIRED (`scenarios.ts:51-53`) |
| `strips_allocated` | `0` (`buildConfig.ts:145`) | `max(2, ceil(fencer_count / 7))` (`scenarios.ts:54`) |

research.md D7 names the last two. The `cut_mode` rows are the same class — a
per-competition default derived from the catalogue entry, diverging because one
side branches on event type or tournament type and the other does not — and they
are closed by the same feature. They are recorded here because D7 did not
anticipate them.

## B2 — pinned 0, ledger 24

**Cause**: six `cut-on-team` findings, one per Cadet team event
(`src/engine/validation.ts:158`). The rule is a `policy` finding, so it is
ERROR-severity under BINDING mode, and `scheduleAllConcurrent` returns an empty
schedule when any BINDING error is present
(`src/engine/concurrentScheduler.ts:186-204`).

**Correction to the record**: the run does **not** throw, and
`video-dead-config` ("REQUIRED video policy has no effect with SINGLE_STAGE
de_mode") is **not** what gates it. That finding is a `notice`
(`src/engine/validation.ts:215`) — WARN in both modes, never escalating. The
only gating errors on B2 and B8 are `cut-on-team`.

**Evidence**: forcing `cut_mode = DISABLED` on B2's six team events alone,
changing nothing else, takes the app path from 0 to 24 — the ledger's exact
count.

**Closes in**: 004 US4. The pin becomes 24.

**Confidence**: high. Single cause, exact reproduction of the ledger's number.

## B4 — pinned 16, ledger 0

The only row where the app exceeds the ledger, and the only one where "the
ledger is stricter" would have been the wrong conclusion.

**Cause**: `estimateCompetitionStripHours` computes a SINGLE_STAGE event's DE
strip-hours as `strips_allocated × de_duration / 60`
(`src/engine/capacity.ts:146`). The store sends `strips_allocated: 0`
(`src/store/buildConfig.ts:145`), so **every individual event contributes zero
DE strip-hours** to the upfront feasibility estimate, and the gate at
`src/engine/validation.ts:405` never fires. The ledger pre-allocates strips and
the gate reports `feasibility-strip-hours`: 2161 strip-hours needed over 30
events against 1680 available (3d × 40s × 14h), a shortfall of 481 (~29%).

**Is the app's 16 trustworthy?** As a schedule, yes: it is ordinary scheduler
output, 16 events placed with strips and times and 14 left unplaced — the
scheduler reporting the same shortfall the ledger's gate refuses upfront. What
the app loses today is the *warning*, not the schedule: a user planning B4 sees
a half-empty board and no statement that the tournament is ~29% over capacity.
That under-reporting is real and is this exception's cost, but it is a
consequence of the US4 default, not of the day axis, and 006 does not touch it.

**Evidence**: adopting the ledger's `strips_allocated` alone takes the app path
from 16 to 0. No other single default moves it — the ledger's `cut_mode`,
`de_mode`, `de_video_policy`, `ref_policy` and `use_single_pool_override` each
leave it at 16.

**Closes in**: 004 US4. The pin becomes 0, and the app starts surfacing
RESOURCE_INSUFFICIENT.

**Confidence**: high on the cause (one default flips the number, exactly, and
the code path from `strips_allocated` to the gate is three lines long).

## B6 — pinned 43, ledger 44

The row that reads as plausible and would have been waved through.

**There is no single missing event.** The two paths place different sets:

- placed by the ledger, not by the app: `D2-W-EPEE-IND`, `JR-M-EPEE-IND`,
  `JR-M-SABRE-IND`, `JR-W-SABRE-IND`, `VET-M-EPEE-IND-VCMB`
- placed by the app, not by the ledger: `D1A-W-FOIL-IND`, `D2-W-FOIL-IND`,
  `Y12-M-EPEE-IND`, `Y14-W-EPEE-IND`

Five out, four in, net −1. The app path's full unplaced list (11 of 54):
`JR-M-EPEE-IND`, `JR-M-FOIL-IND`, `JR-M-SABRE-IND`, `JR-W-EPEE-IND`,
`JR-W-SABRE-IND`, `CDT-W-FOIL-IND`, `Y14-W-FOIL-IND`, `D2-M-FOIL-IND`,
`D2-W-EPEE-IND`, `VET-M-EPEE-IND-VCMB`, `VET-W-EPEE-IND-VCMB`.

**Cause**: DE bracket sizes and durations, from two defaults, each sufficient on
its own:

1. **The regional cut override.** B6 is an ROC, one of
   `REGIONAL_CUT_TOURNAMENT_TYPES` (`src/engine/constants.ts:577-582`).
   `buildConfig.ts:156-164` forces all-advance for Y14/Cadet/Junior/Div1, which
   the engine's own rule requires — `regional-cut-override`,
   `src/engine/validation.ts:256-267`, "regional tournament requires all-advance
   … cut_mode will be overridden to DISABLED". The ledger's factory does not
   apply it and cuts at 20%. **Here the app is the correct side**, and the
   ledger's 44 is measured on a config the engine itself flags.
2. **DE staging.** The ledger derives `STAGED` from a REQUIRED video policy
   (`scenarios.ts:51-53`); the store hardcodes `SINGLE_STAGE`
   (`store.ts:231`). **Here the ledger is the correct side** — this is D7's
   named staging default.

Both change how much strip time a DE consumes, and B6 sits close enough to its
strip-hour ceiling that either is worth one event.

**Evidence**: from the app path's 43, swapping in the ledger's `cut_mode` and
`cut_value` alone gives 44; swapping in the ledger's `de_mode` alone gives 44.
The two 44s are different sets — the cut swap gains `CDT-W-FOIL-IND`,
`JR-W-SABRE-IND` and `Y14-W-FOIL-IND` while losing `JR-W-FOIL-IND` and
`VET-M-SABRE-IND-VCMB`; the staging swap gains `CDT-W-FOIL-IND` and
`VET-M-EPEE-IND-VCMB` while losing `VET-M-FOIL-IND-VCMB`. Swapping the day axis
instead of the competitions moves nothing (table above).

**Closes in**: 004 US4 — **with a flag for whoever picks it up**. B6's cut gap
does not close by changing the app: the app already applies the override the
engine requires. It closes by the ledger's factory adopting
`REGIONAL_CUT_OVERRIDES`, which changes the drift ledger's own recorded behavior
for B4 and B6 and is therefore a constitution III event with its own snapshot
review, not a quiet fixture edit. 006 does not make it — `scenarios.ts` is the
comparison point and stays untouched here.

**Confidence**: high that the cause is per-competition defaults and not the axis
(the config swap is a measured no-op in both directions). Medium on
apportioning it between the two defaults — the effect is over-determined, and at
this capacity margin the packing is sensitive to either.

## B8 — pinned 0, ledger 52

**Cause**: identical to B2 — five `cut-on-team` BINDING errors on the Div1 team
events, from the same missing team branch in `defaultConfigForId`.

**Is `cut_mode=DISABLED` on team events really the same class of default as
`de_mode` staging?** Yes, in origin: both are catalogue-derived per-competition
defaults where the ledger's factory branches on `event_type` and the store does
not, and both are `defaultConfigForId`'s to fix. But it is more serious in
consequence than the defaults D7 names. `de_mode` and `strips_allocated` produce
a *different* schedule; this one produces *no* schedule, because the app hands
the engine a configuration the engine rejects outright. Two of the eight
reference tournaments — including every tournament with team events — schedule
nothing in the app today. It is admissible under FR-004a, and it should be the
first of US4's defaults to land.

**Evidence**: forcing `cut_mode = DISABLED` on B8's five team events alone takes
the app path from 0 to 53.

**Closes in**: 004 US4. Note the pin does **not** simply become 52: with the
team cut corrected the app reaches 53, one above the ledger, because B8's
remaining defaults then favor the app. It is re-measured then, like every number
here.

**Confidence**: high on the cause. The 53-versus-52 residual is unexplained and
deliberately left so — it is US4's to measure, not 006's to predict.

## What would make any of this wrong

Each exception is gated at its pinned number exactly as the matching rows are
(FR-004a), plus a second assertion that a pin off its ledger count cannot exist
without an entry in this table. So:

- a pin moving without an exception fails,
- an exception left behind after US4 closes it fails,
- and a gap that reappears under a different cause fails at its number and comes
  back here for reclassification.

The one failure this cannot catch is an exception classified against the wrong
cause. That is why every entry above names the isolation run that produced it,
so the next reader can re-run it rather than trust it.
