# B8's residual: 53 against the ledger's 52

**Feature**: 008-team-event-cut | **Tasks**: T008 (measure), T009 (attribute) |
**Measured**: 2026-08-31, on branch `008-team-event-cut` after T005's team-cut
fix (`0009916646`)

006 measured B8 at 53 under a forcing run and left the +1 deliberately
unattributed — "US4's to measure, not 006's to predict"
([`parity-exceptions.md` §B8](../006-day-axis-parity/parity-exceptions.md)).
research.md D4 says measure it, do not tune toward 52 and do not inherit 53 as a
prediction. This is that measurement, by the same isolation method
`parity-exceptions.md` used for B4 and B6.

## The verdict first

**53, and the +1 is 004 US4's.** The gap closes on exactly one input set: the
ledger's `de_mode` **and** its `strips_allocated`, together. Neither alone moves
the count — this is the opposite of B6, where either default sufficed on its
own. Both are the defaults research.md D7 named and `parity-exceptions.md`
attributes to 004's US4, so `appPathParity.test.ts`'s `closedBy` assertion
(`toContain('004 US4')`) stands for B8 on the evidence, not by inheritance.

The config plays no part, in either direction. The day axis is ruled out on B8
the same way 006 ruled it out on B4 and B6.

## T008 — the count

`runAppPath('B8')`, the parity test's own instrument, unmodified:

```
selectedCount=53  placedCount=53
```

53, matching 006's forcing-run measurement and the pin T004 set. It was not
adjusted toward either number.

Both metrics agree on every run below: `Object.keys(schedule).length` (the drift
ledger's `scheduledCount`) equals the count of entries with a non-null
`pool_start` (the app path's `placedCount`, via `appPath.ts:46`). On B8 the
scheduler emits no key for an event it cannot place, so the two paths' different
counting rules are not a source of the gap. This was checked rather than
assumed — it is a divergence the four tabulated ones do not cover.

## What actually differs between the two paths on B8

Enumerated field by field across all 53 competitions rather than taken from the
tabulated list, because the tabulated list is about all eight scenarios and this
is about one:

| Field | Events differing | App | Ledger |
|---|---:|---|---|
| `de_mode` | 12 | `SINGLE_STAGE` | `STAGED` |
| `strips_allocated` | 53 | `0` | `max(2, ceil(n/7))` |
| `latest_end` | 53 | `Infinity` | `9999` |
| `cut_mode` / `cut_value` | **0** | — | — |

The 12 staged events are the Div1 and Junior individuals — every category whose
video policy is REQUIRED:
`D1-{M,W}-{EPEE,FOIL,SABRE}-IND`, `JR-{M,W}-{EPEE,FOIL,SABRE}-IND`.

Two entries deserve comment:

- **`cut_mode` is closed.** Zero events differ. T005's `defaultCutForEntry`
  converged the team branch, and B8 is a NAC, so `REGIONAL_CUT_OVERRIDES`
  (`buildConfig.ts:161-169`) never applies on either side — the third candidate
  in the dispatch's list is a no-op on this scenario by construction, not by
  measurement. The cut swap was still run (R4 below) and is, as expected, a
  no-op.
- **`latest_end` is a fourth divergence** the `parity-exceptions.md` seam table
  does not list: `buildConfig.ts:144` sends `Infinity`, `makeCompetition`
  defaults to `9999`. It is real but inert here (R6, P2, P3 below). Recorded so
  the next reader does not rediscover it. (It logs as `app=null` under
  `JSON.stringify`, which renders `Infinity` as `null` — the value is
  `Infinity`.)

The only config difference is `dayConfigs`: the app's 1440-spaced day windows
against the ledger's empty array.

## The isolation table

Each row holds one side fixed and swaps one thing. `←L` means "this field taken
from the ledger's competition of the same id, everything else left as the app
built it".

| Run | Competitions | Config | Placed |
|---|---|---|---:|
| R1 | app (baseline) | app | **53** |
| R2 | app, `de_mode`←L | app | 53 |
| R3 | app, `strips_allocated`←L | app | 53 |
| R4 | app, `cut_mode`+`cut_value`←L | app | 53 |
| R5 | app, `de_video_policy`←L | app | 53 |
| R6 | app, `latest_end`←L | app | 53 |
| **P1** | **app, `de_mode`+`strips_allocated`←L** | **app** | **52** |
| P2 | app, `de_mode`+`latest_end`←L | app | 53 |
| P3 | app, `strips_allocated`+`latest_end`←L | app | 53 |
| R7 | app, every field←L | app | 52 |
| P4 | app, `de_mode`+`strips_allocated`←L | ledger | 52 |
| R8 | app | ledger (control) | 53 |
| R9 | ledger | app (control) | 52 |
| R10 | ledger | ledger (ledger baseline) | **52** |

Reading it:

- **No single default closes the gap.** R2–R6 all stay at 53.
- **`de_mode` + `strips_allocated` is minimal and sufficient.** P1 reaches 52,
  and R7 — swapping every differing field — reaches the same 52 and the same
  set, so the third divergence (`latest_end`) adds nothing.
- **`latest_end` is neither necessary nor sufficient.** P2 and P3 each pair it
  with one of the two real causes and stay at 53, while P1 drops it and reaches
  52.
- **The config is not involved.** R8 (app competitions on the ledger's axis) is
  53, R9 (ledger competitions on the app's axis) is 52, and P4 reproduces P1's
  52 on the other config. Swapping the axis moves nothing in either direction —
  the same result 006 recorded for B4 and B6.
- R10 reproduces the ledger's recorded 52, confirming the comparison point.

## The placed sets

Unlike B6, the difference is a single event and nothing else:

- placed by the app, not by the ledger: **`JR-W-EPEE-IND`**
- placed by the ledger, not by the app: *(none)*

The app's set is a strict superset of the ledger's. There is no offsetting churn
of the kind B6 concealed — five out and four in — and this was checked, not
inferred from the count. Every run that reaches 52 (P1, P4, R7, R9, R10) loses
exactly `JR-W-EPEE-IND` and gains nothing.

`JR-W-EPEE-IND`: 182 fencers, video policy REQUIRED. App sends
`SINGLE_STAGE`/`strips_allocated: 0`; the ledger sends `STAGED`/26 strips.

## Why both defaults are needed, and neither alone

Two further runs, holding the swap's *scope* rather than its fields:

| Run | Swap scope (`de_mode`+`strips_allocated`←L) | Placed |
|---|---|---:|
| N1 | `JR-W-EPEE-IND` only | 53 |
| N2 | all 52 events **except** `JR-W-EPEE-IND` | 53 |
| P1 | all 53 events | 52 |

So the event is not pushed out by its own defaults (N1), nor by the rest of the
field's raised DE demand alone (N2). It falls out only when both apply — a
tournament-wide capacity re-pack at the margin, in which this event is the one
that does not fit. That is the same margin sensitivity `parity-exceptions.md`
records for B6, reached from the other direction: there either default was
enough, here neither is.

This also answers why the app is the *higher* count. `strips_allocated: 0` and
`SINGLE_STAGE` both understate DE strip demand (`capacity.ts:146` computes a
single-stage DE's strip-hours as `strips_allocated × de_duration / 60`), so the
app's B8 fits one more event than the ledger's. It is the same understatement
that produces B4's inverted 16-against-0 — there it suppresses a feasibility
gate, here it buys one event.

## The judgment, in the terms T009 asked for

1. **Which single default closes the gap:** none. The gap closes on the
   conjunction of `de_mode` and `strips_allocated` (P1), and on no smaller set.
2. **Over-determined?** No — the opposite. B6's gap was over-determined (either
   default alone reached 44). B8's is jointly determined: both defaults are
   necessary, neither is sufficient, and together they are exactly sufficient.
   Attribution is therefore to the pair, not apportioned between them.
3. **Do the placed sets differ as a set?** Only by the one event.
   `JR-W-EPEE-IND` is placed by the app and by no run that reaches 52; nothing
   moves in the other direction. B6's lesson does not repeat here, but it was
   checked before that was said.
4. **Does the residual belong to 004's US4?** **Yes.** Both causes are US4's
   named per-type competition defaults — the staging derivation
   (`scenarios.ts:66-68` against `store.ts:231`) and the pre-allocated strips
   (`scenarios.ts:69` against `buildConfig.ts:151`). `appPathParity.test.ts`'s
   assertion that every exception's `closedBy` contains `004 US4` stands for
   B8, and T010 does not need to weaken it on B8's account.

   The pin does **not** become 52 when US4 lands. P1 shows 52 under *both*
   defaults converged, but which side each converges toward is US4's decision —
   `parity-exceptions.md` §B6 already flags that the regional cut override must
   converge on the ledger's side, a constitution III change. B8 is re-measured
   then, like every number in that file.

## Re-running this

The runs above were produced by a scratch Vitest file that built both sides
(`buildTournamentConfig` after `applyPreset('B8')` for the app,
`buildCompetitions`/`tournamentConfig` for the ledger), swapped named fields by
id, and called `scheduleAll` directly. It was deleted after the measurement, per
the constitution's rule against scratch artifacts in the repo. The table above
is the reproducible record: each row is one field list, one config, one
`scheduleAll` call.

No file under `src/` was modified to perform any swap.
