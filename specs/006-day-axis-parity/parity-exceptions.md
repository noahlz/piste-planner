# Parity Exceptions: the three rows the app path does not match the ledger on

**Feature**: 006-day-axis-parity | **Task**: T012 (FR-004a classification) |
**Measured**: 2026-08-31, on `b20f351347` (the axis fix, T006/T008)

This is the classification T012 owes FR-004a. It lives beside
[`baseline.md`](./baseline.md) rather than inside it because baseline.md is the
*pre-change* record, captured before any source file was edited, and stays that.
The pinned numbers themselves are in `__tests__/store/appPathParity.test.ts`,
each with the short form of its entry here.

**Amended 2026-08-31** by 008-team-event-cut (T011): B2 closed at 24, the
ledger's exact count, and B8 re-measured from 0 to 53, one above the ledger's
52 — both after 008's team-`cut_mode` fix
(`src/store/competitionDefaults.ts`). This stays 006's record and the
amendment is marked where it applies rather than the document rewritten as if
006 had known. Full isolation record:
[`specs/008-team-event-cut/b8-residual.md`](../008-team-event-cut/b8-residual.md).
Every `scenarios.ts` and `buildConfig.ts` citation in this document was
re-verified against the tree on 2026-08-31, after 008's T014 inserted a
15-line comment above `buildCompetitions` (`62be896692`) and shifted every
line number below it — checked line by line, not carried forward on trust.

**Amended 2026-09-01** by 004-p3-workbench-shell (US4 T063a), which re-measured
all eight app-path counts against the post-D5/D6/D7/T061a tree and reconciled
this document against what it measured. **§B4 closed at 0.** §B6 and §B8
survive, both re-caused and both re-assigned away from 004 US4 — see
"The verdict, amended" below. As with the 008 amendment, this stays 006's
record and the amendment is marked where it applies rather than the document
rewritten as if 006 had known.

## The verdict first

**No gap traces to the day axis.** Three of the eight reference tournaments
still differ from the ledger, and all three differences are FR-004a exceptions
traced to per-competition defaults the two paths have not converged on. All
three close in 004's US4.

| | Pinned (app path) | Ledger | Traced cause | Closes in |
|---|---:|---:|---|---|
| B1 | 24 | 24 | — matches | — |
| B2 | 24 | 24 | — matches | closed by 008 |
| B3 | 24 | 24 | — matches | — |
| B4 | **16** | 0 | `strips_allocated: 0` hides demand from the feasibility gate | 004 US4 |
| B5 | 12 | 12 | — matches | — |
| B6 | **43** | 44 | DE bracket sizes: regional cut override + DE staging | 004 US4 |
| B7 | 18 | 18 | — matches | — |
| B8 | **53** | 52 | DE bracket sizes and strip demand: `de_mode` + `strips_allocated`, jointly | 004 US4 |

### The verdict, amended — 2026-09-01, after 004 US4

The day-axis verdict is unchanged and was re-confirmed on both surviving rows:
each is invariant to the config in both directions (below). What changed is how
many rows survive, and who closes them.

| | Pinned (app path) | Ledger | Movement under US4 | Traced cause | Closes in |
|---|---:|---:|---|---|---|
| B1 | 24 | 24 | — | matches | — |
| B2 | 24 | 24 | — | matches | closed by 008 |
| B3 | 24 | 24 | — | matches | — |
| B4 | **0** | 0 | 16 → **0** | **closed** — T061a's pre-allocated strips fire the gate | closed by 004 US4 |
| B5 | 12 | 12 | — | matches | — |
| B6 | **39** | 44 | 43 → **39** | per-type `cut_mode` (18 events) and per-type `de_mode` (12), neither applied by the ledger's factory | the ledger-factory follow-up |
| B7 | 18 | 18 | — | matches | — |
| B8 | **53** | 52 | unmoved | per-type `de_mode` alone (41 events); `strips_allocated` closed in T061a | the ledger-factory follow-up |

Three things in that table are worth stating rather than leaving to be inferred:

- **B6 moved away from the ledger, not toward it.** 43 → 39 against an
  unchanged 44. T061a is the cause: pre-allocated strips made all-advance
  regional brackets cost the strip-hours `strips_allocated: 0` had masked, and
  B6 re-packed at its capacity margin — 8 events out, 4 in, with
  `validateFeasibility` clean on both sides. Recorded in commit `29aabc9031`
  and `specs/004-p3-workbench-shell/drift-baseline.md` §T062. It is a widening
  of a known gap, not a new one.
- **The seam has flipped sides.** Every 006-era exception had the store
  *understating* DE demand against the ledger. US4 closed that half — the store
  now pre-allocates the ledger's own `max(2, ceil(n/7))`. What is left is the
  store resolving `cut_mode` and `de_mode` **per tournament type** where the
  ledger's factory resolves them **per event**.
- **Neither survivor closes by another change to `src/`.** Both close by the
  ledger's factory adopting the store's per-type resolutions — a constitution
  III change to the drift ledger's own recorded behavior, owing its own
  snapshot review. It is deliberately outside 004 US4, because
  `__tests__/helpers/scenarios.ts` is the comparison point T062 diffs against
  and moving it would move the baseline. Backlogged as **"The drift ledger's
  factory does not apply the store's per-type resolutions"** in
  [`docs/design/backlog.md`](../../docs/design/backlog.md); no spec number is
  allocated.

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
reproduces the other path's count exactly, in both directions. The same was
predicted of B2 and B8 once their team `cut_mode` was corrected, and 008
turned the prediction into a measurement rather than leaving it one. B2 now
matches the ledger outright at 24, on either config. B8 does not converge that
far: the app's competitions place 53 on the app's config and 53 on the
ledger's config, and the ledger's competitions place 52 on the ledger's config
and 52 on the app's config too (`b8-residual.md` R1, R8, R9, R10) — each path
is invariant to the axis, but correcting `cut_mode` alone does not bring the
two paths together. Correcting `de_mode` and `strips_allocated` as well
reaches 52 on both configs (`b8-residual.md` P1, P4), so the axis stays
uninvolved at every stage of the fix, the same result 006 recorded for B4 and
B6.

A third run confirms it from the other side: `app comps + app config with
dayConfigs: []` — the app's own competitions on the ledger's compacted 840-minute
axis — returns 43 for B6 and 16 for B4, the same numbers the 1440-spaced axis
returns.

## The seam all three share

Two files build a `Competition` from the same catalogue entry and disagree:

| | Store (`src/store/store.ts:217-235`, `src/store/buildConfig.ts:110-151`) | Ledger factory (`__tests__/helpers/scenarios.ts:44-72`) |
|---|---|---|
| `cut_mode` for a TEAM event — **closed by 008** | `event_type === TEAM` branch in `defaultCutForEntry` (`src/store/competitionDefaults.ts`) | `CutMode.DISABLED` / 100 when `isTeam` (`scenarios.ts:49-52`) |
| `cut_mode` at a regional type | `REGIONAL_CUT_OVERRIDES` applied (`buildConfig.ts:161-169`) | not applied |
| `de_mode` | hardcoded `SINGLE_STAGE` (`store.ts:231`) | `STAGED` when individual and video REQUIRED (`scenarios.ts:66-68`) |
| `strips_allocated` | `0` (`buildConfig.ts:151`) | `max(2, ceil(fencer_count / 7))` (`scenarios.ts:69`) |
| `latest_end` | `Infinity` (`buildConfig.ts:144`) | `9999` (`scenarios.ts` `makeCompetition` default) |

**Amended 2026-09-01 (004 US4 T063a).** Two of those rows are no longer as
written, measured field by field across all 54 of B6's and all 53 of B8's
competitions:

| | Store, after US4 | Ledger factory | Events differing (B6 / B8) |
|---|---|---|---:|
| `de_mode` | resolved from the per-type table — `STAGED` at NAC, `SINGLE_STAGE` elsewhere (`data-model.md` §Per-type default table) | unchanged: `STAGED` when individual and video REQUIRED | 12 / 41 |
| `strips_allocated` | `max(2, ceil(fencer_count / 7))` — T061a adopted the ledger's own formula | unchanged | **0 / 0** |
| `ref_policy` | resolved from the per-type table — `ONE` at ROC, `TWO` at NAC/SJCC/SYC (D5) | unresolved `AUTO` | 54 / 53 |

`strips_allocated` is closed. `de_mode` is now a **rule** difference rather
than a lag: the store assigns it per tournament type, the ledger per event, and
on B8 the store is the `STAGED` side where it used to be the `SINGLE_STAGE`
one. `ref_policy` is a new divergence US4 introduced and it is inert on
placement — swapping it alone moves neither scenario (`AUTO` and `TWO` both
score two refs per pool, `src/engine/pools.ts:170-175`), though it does hold
B6's referee columns apart, which `drift-baseline.md` §T062 records.

research.md D7 names `de_mode` and `strips_allocated`. The `cut_mode` for a
TEAM event row closed in 008 (`defaultCutForEntry`,
`src/store/competitionDefaults.ts`): the store now branches on `event_type`
the way the ledger's factory always has, and zero of B8's events differ on
`cut_mode` after the fix. The `cut_mode` at a regional type row stays open —
§B6 below records that it closes the other way, by the ledger's factory
adopting `REGIONAL_CUT_OVERRIDES`, not by a store change, so the two `cut_mode`
rows no longer close by the same feature.

`latest_end` is a fourth divergence D7 did not anticipate and this document
did not record until 008 found it while isolating B8's residual
(`b8-residual.md`): `buildConfig.ts:144` sends `Infinity` where the ledger's
`makeCompetition` factory defaults to `9999`, on every one of B8's 53
competitions. It is real but inert — every isolation run that includes it
(`b8-residual.md` R6, P2, P3) stays at 53, and the run that reaches 52 without
it (P1) shows it is neither necessary nor sufficient for any gap measured so
far. Recorded here so the next reader does not rediscover it or mistake it for
a cause.

## B2 — closed at 24

**Closed by feature 008 on 2026-08-31.** The app path now places 24, the
ledger's exact count, and its `PARITY_EXCEPTIONS` entry was deleted from
`appPathParity.test.ts` — a pin equal to the ledger's count may not carry an
FR-004a exception. The fix itself is not restated here: see
[`specs/008-team-event-cut/`](../008-team-event-cut/).

**Correction to the record**: the run does **not** throw, and
`video-dead-config` ("REQUIRED video policy has no effect with SINGLE_STAGE
de_mode") is **not** what gates it. That finding is a `notice`
(`src/engine/validation.ts:215`) — WARN in both modes, never escalating. The
only gating errors on B2 and B8 are `cut-on-team`.

## B4 — closed at 0

**Closed by 004 US4 on 2026-09-01.** The app path placed 16 when 006 measured
it and places **0** now, the ledger's exact count, so its `PARITY_EXCEPTIONS`
entry was deleted from `appPathParity.test.ts` — a pin equal to the ledger's
count may not carry an FR-004a exception. The fix itself is not restated here:
see [`specs/004-p3-workbench-shell/`](../004-p3-workbench-shell/) and
`drift-baseline.md` §T062.

The 006-era classification below is left as written. It predicted this closure
and named the default that would produce it, and both held.

### The 006-era classification

The only row where the app exceeds the ledger, and the only one where "the
ledger is stricter" would have been the wrong conclusion.

**Cause**: `estimateCompetitionStripHours` computes a SINGLE_STAGE event's DE
strip-hours as `strips_allocated × de_duration / 60`
(`src/engine/capacity.ts:146`). The store sends `strips_allocated: 0`
(`src/store/buildConfig.ts:151`), so **every individual event contributes zero
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

## B6 — pinned 39, ledger 44

**Amended 2026-09-01 (004 US4 T063a): re-measured at 39, not 43, and
re-assigned.** The 006 classification follows below, left as written. Three
things it could not know:

1. **The pin moved away from the ledger.** 43 → 39, against an unchanged 44.
   T061a's pre-allocated strips made B6's all-advance regional brackets cost
   real strip-hours that `strips_allocated: 0` had masked, and the scenario
   re-packed at its capacity margin: 8 events out, 4 in, `validateFeasibility`
   clean on both sides (`29aabc9031`, `drift-baseline.md` §T062). The gap is
   wider, and the cause of the widening is not the cause of the gap.
2. **The apportionment below no longer holds.** Measured at T063a, of the
   fields still differing: swapping in the ledger's `de_mode` alone reaches
   exactly 44; its `cut_mode` alone **overshoots to 54**, the whole field
   placed; `cut_value` alone stays 39; swapping every differing field reaches
   44. `strips_allocated` and `de_video_policy` differ on zero of the 54.
   006's "either default alone is worth one event" was true of the tree it was
   measured on and is not true of this one — only `de_mode` still lands on 44.
   The two remaining defaults differ on 18 events (`cut_mode`/`cut_value`) and
   12 (`de_mode`).
3. **The axis is still uninvolved.** Re-confirmed, not carried forward: 39 on
   the app's config and 39 on the ledger's, against 44 on either config from
   the ledger's competitions.

**Closes in — re-assigned.** Not 004 US4. B6 closes by the ledger's factory
(`__tests__/helpers/scenarios.ts`) adopting the store's per-type resolutions —
`REGIONAL_CUT_OVERRIDES` and the per-type `de_mode` table. §"Closes in" below
already argued the first half of this; T063a adds `de_mode` to it and makes the
re-assignment explicit. That work moves the drift ledger's own recorded counts
and is a constitution III change with its own snapshot review, deliberately out
of 004 US4's scope because `scenarios.ts` is the comparison point T062 diffs
against. Backlogged, unnumbered, as **"The drift ledger's factory does not apply
the store's per-type resolutions"** in
[`docs/design/backlog.md`](../../docs/design/backlog.md).

### The 006-era classification

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
   `buildConfig.ts:161-169` forces all-advance for Y14/Cadet/Junior/Div1, which
   the engine's own rule requires — `regional-cut-override`,
   `src/engine/validation.ts:256-267`, "regional tournament requires all-advance
   … cut_mode will be overridden to DISABLED". The ledger's factory does not
   apply it and cuts at 20%. **Here the app is the correct side**, and the
   ledger's 44 is measured on a config the engine itself flags.
2. **DE staging.** The ledger derives `STAGED` from a REQUIRED video policy
   (`scenarios.ts:66-68`); the store hardcodes `SINGLE_STAGE`
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

## B8 — pinned 53, ledger 52

**Amended 2026-09-01 (004 US4 T063a): re-measured at 53 — unmoved — with one
of its two causes closed and the other inverted.** The 008 classification
follows below, left as written.

`b8-residual.md` attributed the +1 to `de_mode` **and** `strips_allocated`
jointly, each necessary and neither sufficient. US4 changed both halves, and
they cancel at the count:

- **`strips_allocated` is closed.** T061a gave `buildConfig.ts` the ledger's
  own `max(2, ceil(n/7))`. It differs on **zero** of the 53 events.
- **`de_mode` inverted and widened.** US4 resolves it from the per-type table
  (`data-model.md` §Per-type default table): B8 is a NAC, so all 53 resolve to
  `STAGED`. The ledger's per-event rule stages only the 12 Div1 and Junior
  individuals whose video policy is REQUIRED. 53 − 12 = **41** differ, and the
  app is now the `STAGED` side where it was the `SINGLE_STAGE` one.
- **`de_mode` alone is now sufficient.** Swapping in the ledger's `de_mode`
  and nothing else takes the app path to 52 — where R2/R3/P1 measured it as
  necessary-but-not-sufficient. `cut_mode`, `cut_value`, `strips_allocated`
  and `de_video_policy` differ on zero events.

**B8 was never going to reach 52 through US4, and that is not a shortfall.**
`b8-residual.md`'s P1 reached 52 under the *ledger's* per-event staging rule.
US4 shipped the **per-type** rule instead, per `data-model.md` — a different
assignment of `de_mode` to events, decided on its own merits, not a failed
attempt at the same assignment. The two paths now apply two different rules,
which is why one number cannot be tuned into the other.

**Closes in — re-assigned.** Not 004 US4. B8 closes the same way B6 does: the
ledger's factory (`scenarios.ts:66-68`) adopts the per-type `de_mode` table in
place of its per-event video derivation. Same backlog entry, same constitution
III snapshot review, same reason it is out of this story's scope. The axis was
re-confirmed uninvolved: 53 on either config, against the ledger's 52 on either
config.

### The 008-era classification

Full isolation record:
[`specs/008-team-event-cut/b8-residual.md`](../008-team-event-cut/b8-residual.md);
this is the short form.

**`cut_mode` is closed.** B8's five team events no longer gate under BINDING —
008's `defaultCutForEntry` closed the same seam it closed on B2, and zero of
B8's 53 events differ on `cut_mode` after the fix.

**The +1 is jointly caused by two of 004 US4's named defaults, and neither
alone is enough — the inverse of B6, where either sufficed on its own.** The
ledger derives `STAGED` `de_mode` from a REQUIRED video policy on an
individual event (`__tests__/helpers/scenarios.ts:66-68`) where the store
hardcodes `SINGLE_STAGE` (`src/store/store.ts:231`). The ledger pre-allocates
`max(2, ceil(fencer_count / 7))` strips (`scenarios.ts:69`) where
`buildConfig.ts:151` sends `0`. Swapping either default alone leaves the app
path at 53 (`b8-residual.md` R2, R3). Swapping both together reaches 52, the
ledger's exact count, and swapping every field that still differs — including
the inert `latest_end` above — reaches the same 52 and the same set (R7), so
the pair is minimal and exactly sufficient. B6's gap closed on either default
independently. B8's closes only on their conjunction, and the contrast is
legible here because both scenarios sit in the same document.

**The set difference is exactly one event.** `JR-W-EPEE-IND` (182 fencers,
video policy REQUIRED) is placed by the app and by no run that reaches 52 —
the app's placed set is a strict superset of the ledger's, and nothing moves
the other way. This was checked as a set, not inferred from the count, because
B6 concealed offsetting churn of the same size. Two further runs isolate why
the event falls out only at the margin: swapping both defaults on
`JR-W-EPEE-IND` alone stays at 53, and swapping them on all 52 *other* events
stays at 53 too (`b8-residual.md` N1, N2) — the event drops out only under a
tournament-wide capacity re-pack, not from its own defaults or the rest of the
field's alone.

**The app is the *higher* count** because `strips_allocated: 0` and
`SINGLE_STAGE` both understate DE strip-hour demand
(`estimateCompetitionStripHours`, `src/engine/capacity.ts:146`), the same
understatement B4 traces above. There it suppresses a feasibility gate. Here
it buys one extra event.

**Closes in**: 004 US4. The pin is **re-measured** then, not assumed to become
52 — 52 is what `b8-residual.md`'s P1 gets when both defaults converge toward
the ledger, and which side each default converges toward is US4's own
decision. §B6 above already flags that the regional cut override must
converge the *other* way, on the ledger's side, a constitution III change to
the ledger's own recorded behavior.

**Confidence**: high, and the residual is no longer unattributed. 008's
isolation (`b8-residual.md`) accounts for the full 53-versus-52 gap as the
conjunction of two named defaults, checked by field, by scope, and by set —
see that file for the complete isolation table rather than a copy of it here.

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
