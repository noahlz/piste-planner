# Baseline: 011

## 0. Branch starting numbers

- HEAD: `ec3d3aee742e824a40b997e118955ea4bbf217b9` (branched from main)
- `pnpm test`: Test Files 67 passed (67), Tests 1821 passed (1821), 0 skipped
- `tsc -b`: clean (exit 0)
- `lint`: clean (exit 0)

---

## The method, so this is re-runnable

`[M]` below means measured by running code, `[R]` read from source. Everything in
§1 and §2 is `[M]`, produced by a temporary probe at
`tmp/probe-011-baseline.test.ts`, run with

```
timeout 180 pnpm --silent vitest run tmp/probe-011-baseline.test.ts > ./tmp/probe.log 2>&1
```

and deleted after the numbers were recorded. It reads `src/` and never writes to
it. Every loop is bounded by a fixed collection. `vitest.config.ts` sets no
`include`, so a `*.test.ts` under `tmp/` is picked up by the default glob — no
config change was needed.

The probe reuses 010's Appendix C `runTemplate` **unchanged**, which is 010's
Appendix A `runTemplate` minus the `noDayConfigs` and `typed` supplementary
variants that §1 here does not need. Per template:

1. `useStore.setState(useStore.getInitialState(), true)`
2. `setDays(state().days_available)` — populates `dayConfigs` at the store's
   default of **3 days**, as it is after boot
3. `applyTemplate(name)` — the `TEMPLATE_FENCER_DEFAULTS` lookup
4. strips: either `suggestStrips()` (the app's own **Suggest** action,
   `store.ts:229` → `src/store/stripSuggestion.ts:9`) or `setStrips(80)`
5. `setVideoStrips(null)` in the suggested column, `setVideoStrips(12)` in the
   other
6. `buildTournamentConfig(state())`, then `scheduleAll(competitions, config)`

**Placed** counts schedule entries with a non-null `pool_start`, the rule
`runScheduleAll` uses (`src/store/runActions.ts:31`). **ERROR rule ids** come
from `validateConfig(config, competitions, ValidationMode.BINDING)` called
directly, because `scheduleAll` discards a finding's rule id when it turns it
into a `Bottleneck`.

Fixed conditions, all supplied by the app and none changed by `applyTemplate`:

- **Days: 3** (`src/store/store.ts:193`).
- **Tournament type: NAC** for all ten. `applyTemplate` does not set the type, so
  a template picked from the initial store state runs as a NAC even when its name
  says ROC. `[M]` confirmed: `config.tournament_type` is `NAC` on all ten runs.
  This is the app's real behavior and it is the method 010 §3 used.
- **Video strips in the suggested column: `null` → resolves to the NAC default
  of 8** (`src/store/typeDefaults.ts`). `[M]` confirmed at 8 on all ten.

§2's B1–B8 figures come from the same `buildCompetitions` / `tournamentConfig`
pair `__tests__/engine/driftLedger.test.ts` uses, via
`__tests__/helpers/scenarios.ts`.

---

## 1. Ten templates, before any change

`[M]` Measured at `8335928dc5` (branch `011-feasibility-and-strip-suggestion`,
tree identical to `main` at `ec3d3aee74` under `src/` and `__tests__/`), before
any file under `src/` was edited.

| Template | Events | Suggested strips | Placed @ suggested | ERROR rule ids @ suggested | Placed @ 80/12 | ERROR rule ids @ 80/12 |
|---|---:|---:|---:|---|---:|---|
| NAC Youth | 24 | 39 | **0** | `feasibility-strip-hours` ×1 | **22** | none |
| NAC Cadet/Junior | 24 | 39 | **0** | `feasibility-strip-hours` ×1 | **24** | none |
| NAC Div1/Junior | 24 | 45 | **13** | none | **24** | none |
| NAC Vet/Div1/Junior | 66 | 45 | **0** | `feasibility-strip-hours` ×1 | **45** | none |
| ROC Div1A/Vet | 12 | 15 | **12** | none | **12** | none |
| ROC Div1A/Div2/Vet | 18 | 15 | **16** | none | **18** | none |
| ROC Mega | 42 | 20 | **0** | `feasibility-strip-hours` ×1 | **42** | none |
| RYC Weekend | 18 | 20 | **12** | none | **18** | none |
| RJCC Weekend | 12 | 19 | **6** | none | **12** | none |
| Junior Olympics | 18 | 39 | **0** | `feasibility-strip-hours` ×1 | **18** | none |

`scheduledCount` (the key count of the returned schedule) and the placed count
are equal on every cell of the table. No template carries a WARN-severity
**validation** finding at either strip count — every warning below is a
scheduling bottleneck.

### The five zero cells, with the message that produces them

Each is one `feasibility-strip-hours` ERROR and nothing else.

| Template | `RESOURCE_INSUFFICIENT` message at the suggested count |
|---|---|
| NAC Youth | `2941 strip-hours needed over 24 events; 1638 available (3d × 39s × 14h). Shortfall 1303 (~80%). Add 3 more day(s) OR 32 more strip(s).` |
| NAC Cadet/Junior | `2128 strip-hours needed over 24 events; 1638 available (3d × 39s × 14h). Shortfall 490 (~30%). Add 1 more day(s) OR 12 more strip(s).` |
| NAC Vet/Div1/Junior | `3670 strip-hours needed over 66 events; 1890 available (3d × 45s × 14h). Shortfall 1780 (~94%). Add 3 more day(s) OR 43 more strip(s).` |
| ROC Mega | `1775 strip-hours needed over 42 events; 840 available (3d × 20s × 14h). Shortfall 935 (~111%). Add 4 more day(s) OR 23 more strip(s).` |
| Junior Olympics | `2027 strip-hours needed over 18 events; 1638 available (3d × 39s × 14h). Shortfall 389 (~24%). Add 1 more day(s) OR 10 more strip(s).` |

`[M]` At its suggested count each of the five returns **exactly one bottleneck in
total** — that `ERROR / RESOURCE_EXHAUSTION / VALIDATION` and nothing else. The
gate aborts before any packing runs, so there is nothing else to report. This is
what T008 compares against: the after-US1 rows will carry scheduling warnings
where these carry none, and that is the demotion working, not drift.

### Warnings behind the non-zero shortfalls

`[M]` `warnCountsByCause` from `scheduleAll`. Every template that places fewer
events than it has, without an ERROR, is short on `DEADLINE_BREACH` alone. This
is the shortfall spec §Out of Scope explicitly does not fix.

| Template | @ suggested | @ 80/12 |
|---|---|---|
| NAC Youth | – (gate aborts) | `DEADLINE_BREACH` ×2 |
| NAC Cadet/Junior | – (gate aborts) | `UNAVOIDABLE_CROSSOVER_CONFLICT` ×6 |
| NAC Div1/Junior | `DEADLINE_BREACH` ×14 | – |
| NAC Vet/Div1/Junior | – (gate aborts) | `DEADLINE_BREACH` ×21 |
| ROC Div1A/Vet | – | – |
| ROC Div1A/Div2/Vet | `DEADLINE_BREACH` ×2 | – |
| ROC Mega | – (gate aborts) | – |
| RYC Weekend | `DEADLINE_BREACH` ×8 | – |
| RJCC Weekend | `DEADLINE_BREACH` ×6 | – |
| Junior Olympics | – (gate aborts) | – |

`NAC Youth` at 80/12 leaves `CDT-W-FOIL-IND` and `Y14-W-FOIL-IND` unplaced.
`NAC Vet/Div1/Junior` at 80/12 leaves 21 unplaced, 18 of them Veteran individual
events plus `D1-W-FOIL-TEAM`, `D1-W-SABRE-TEAM` and `JR-W-FOIL-IND`.

`NAC Cadet/Junior`'s six `UNAVOIDABLE_CROSSOVER_CONFLICT` warnings at 80/12 are
010's R7 reporting the least-bad-color fallback that 010 §2 proved fires there.
They cost it no events — it still places 24 of 24.

---

## 2. B1–B8 at `ec3d3aee74`

`[M]` `scheduleAll` on `__tests__/helpers/scenarios.ts`'s fixtures.
`[R]` Floors from `__tests__/engine/driftLedger.test.ts:48-54`.

| Scenario | Fixture (days / strips / video / type) | Events | scheduledCount | `SCHEDULED_FLOORS` | errorCount |
|---|---|---:|---:|---:|---:|
| B1 | 4 / 80 / 12 / NAC | 24 | **24** | 24 | 0 |
| B2 | 4 / 80 / 12 / NAC | 24 | **24** | 24 | 0 |
| B3 | 4 / 80 / 12 / NAC | 24 | **24** | 24 | 0 |
| B4 | 3 / 40 / 12 / SYC | 30 | **0** | 0 | 1 |
| B5 | 3 / 60 / 12 / SJCC | 12 | **12** | 12 | 0 |
| B6 | 3 / 48 / 12 / ROC | 54 | **45** | 45 | 9 |
| B7 | 4 / 80 / 12 / NAC | 18 | **18** | 18 | 0 |
| B8 | 4 / 68 / 12 / NAC | 53 | **52** | 52 | 1 |

Every scenario sits **exactly on** its floor. There is no slack anywhere: a
single event lost on any scenario halts the task that lost it. Placed count
(non-null `pool_start`) equals `scheduledCount` on all eight.

`warnCountsByCause`, per scenario:

| Scenario | DEADLINE_BREACH | RESOURCE_EXHAUSTION | SCHEDULE_ACCEPTED_WITH_WARNINGS |
|---|---:|---:|---:|
| B1 | – | – | – |
| B2 | – | 6 | 2 |
| B3 | – | – | – |
| B4 | – | 12 | – |
| B5 | – | 12 | – |
| B6 | 9 | 18 | – |
| B7 | – | – | 2 |
| B8 | 1 | 5 | 1 |

`UNAVOIDABLE_CROSSOVER_CONFLICT` — the cause 010's R7 added — appears on no
B1–B8 scenario, matching 010's own prediction. Validation ERROR rule ids: **B4
alone has one**, `feasibility-strip-hours` ×1. B6's 9 ERROR bottlenecks and B8's
1 are *scheduling* errors that reach no validation rule.

### B4's exact bottleneck shape

This is the single ERROR that US1 removes, and the one the ledger's dedicated
B4 test (`driftLedger.test.ts:213`) pins. Recorded both as `scheduleAll` emits it
and as `validateConfig` reports it, because a `Bottleneck` carries no rule id.

As a **bottleneck** (`scheduleAll`), exactly one, and no others of any severity
beyond the 12 `RESOURCE_EXHAUSTION` WARNs above:

| field | value |
|---|---|
| `severity` | `ERROR` |
| `cause` | `RESOURCE_EXHAUSTION` |
| `phase` | `VALIDATION` |
| `competition_id` | `""` (empty — a whole-tournament finding) |
| `day` | absent |
| `message` | `RESOURCE_INSUFFICIENT: 2161 strip-hours needed over 30 events; 1680 available (3d × 40s × 14h). Shortfall 481 (~29%). Add 1 more day(s) OR 12 more strip(s).` |

As a **validation finding** (`validateConfig(…, BINDING)`), exactly one ERROR:

| field | value |
|---|---|
| `rule` | `feasibility-strip-hours` |
| `severity` | `ERROR` |
| `field` | `feasibility` |
| `message` | identical to the bottleneck message above |

The shortfall is **481 strip-hours over 1680, ~29%** — well past the 15% slack
band, so B4 is not a marginal case that a tuning change would rescue. It moves
only because the severity moves.

---

## 3. Agreement with spec §Context

**The expectation holds.** All five templates named in
[spec.md §Context](./spec.md) — `NAC Youth`, `NAC Cadet/Junior`,
`NAC Vet/Div1/Junior`, `ROC Mega`, `Junior Olympics` — measure **zero placed at
their suggested strip count**, and in every case the sole ERROR is
`feasibility-strip-hours` ×1. No sixth template joins them, and none of the five
drops out.

Spec §Context's table reproduces cell for cell:

| Template | Events (spec → measured) | Suggested (spec → measured) | @ suggested (spec → measured) | @ 80/12 (spec → measured) |
|---|---|---|---|---|
| NAC Youth | 24 → **24** | 39 → **39** | 0 → **0** | 22 → **22** |
| NAC Cadet/Junior | 24 → **24** | 39 → **39** | 0 → **0** | 24 → **24** |
| NAC Vet/Div1/Junior | 66 → **66** | 45 → **45** | 0 → **0** | 45 → **45** |
| ROC Mega | 42 → **42** | 20 → **20** | 0 → **0** | 42 → **42** |
| Junior Olympics | 18 → **18** | 39 → **39** | 0 → **0** | 18 → **18** |

**Zero disagreements with spec §Context's table.** Every other §Context claim
that this probe can reach also holds:

- "Five of the ten place zero events at the count the **Suggest** button
  produces" — `[M]` exactly five, and they are exactly the five named.
- "Every one of the five is emptied by a single finding,
  `feasibility-strip-hours`" — `[M]` each has exactly one validation ERROR, and
  its rule id is `feasibility-strip-hours`.
- "every one of the five schedules a substantial board when given more strips" —
  `[M]` 22/24, 24/24, 45/66, 42/42, 18/18.
- The three implementation sites `[R]` are where §Context puts them:
  `src/store/stripSuggestion.ts:9` `suggestStrips`, `src/engine/analysis.ts:22`
  `suggestStripCount`, `src/engine/stripBudget.ts:35` `recommendStripCount`, with
  its live caller at `concurrentScheduler.ts:1450`. `suggestStripCount` has no
  caller anywhere in `src/` — its only importer is
  `__tests__/engine/analysis.test.ts`, so §Context's "dead" is confirmed.
- `concurrentScheduler.ts:526` sets `desired_strip_count` to
  `poolStructure.n_pools`, `:535` carries the "a 3-5 event day has to share the
  strip pool concurrently" comment, and `:1444` is `hasResourceExhaustion`.
  All three line references are exact.

### Two notes that are not disagreements

Recorded so a later reader does not mistake them for drift.

1. **`NAC Div1/Junior` places 13 at its suggested count and 24 at 80/12, where
   010 §3's original table reads 0 and 0.** That movement is 010's own R1
   (`5a3a1a6826`, the deletion of `indiv-team-same-day`) and 010's after-R1 table
   already records it at exactly 13 and 24. This baseline is measured after Wave
   1 merged, so 13/24 is the correct starting point. Spec §Context does not list
   this template.

2. **B6 schedules 45 with 9 errors and 9 `DEADLINE_BREACH` warnings, where 010
   §1 reads 44 / 10 / 12.** That is 010's L9 (`2bacf2aa8e`), which raised
   `SCHEDULED_FLOORS.B6` from 44 to 45 in the same commit. B6 is on its floor.

### What T008 and T012 measure against

- **SC-001** is the five zero cells in §1 becoming non-zero.
- **SC-002** is every cell of §1 being a lower bound: no template may place fewer
  than the number in its row, in either strip column.
- **SC-003** is §2's eight counts holding their floors, with B4 the one scenario
  expected to rise off zero (and its floor rising with it, in the same commit).
- The suggested-strips column of §1 is what US2 moves. It is 39 / 39 / 45 / 45 /
  15 / 15 / 20 / 20 / 19 / 39 today, and T012 records it again.

---

## 4. Ten templates after US1

`[M]` Measured at `d7c58dbd90` (T006), the last US1 commit. Same method as §1,
unchanged: the probe is §The method's `runTemplate` verbatim, written to
`tmp/t008-remeasure-probe.test.ts`, run with

```
timeout 300 pnpm --silent vitest run tmp/t008-remeasure-probe.test.ts > ./tmp/probe-t008.log 2>&1
```

and deleted after the numbers were recorded. Two fields were added to the
returned object (`unplacedIds`, `errorBottleneckCount`) — reporting only, read
off the same `schedule` and `bottlenecks` §1 already read. Nothing in the setup
path moved.

`__tests__/components/workbench/Scorecard.test.tsx` is red at this commit and is
T007's to fix. It does not enter this measurement, which calls the engine and the
store directly.

### Before and after, side by side

"Before" is §1, measured at `8335928dc5`. "After" is this run.

| Template | Events | Suggested (before → after) | Placed @ suggested (before → after) | ERROR rule ids @ suggested (before → after) | Placed @ 80/12 (before → after) |
|---|---:|---|---|---|---|
| **NAC Youth** | 24 | 39 → **39** | 0 → **10** | `feasibility-strip-hours` ×1 → **none** | 22 → **22** |
| **NAC Cadet/Junior** | 24 | 39 → **39** | 0 → **13** | `feasibility-strip-hours` ×1 → **none** | 24 → **24** |
| NAC Div1/Junior | 24 | 45 → **45** | 13 → **13** | none → **none** | 24 → **24** |
| **NAC Vet/Div1/Junior** | 66 | 45 → **45** | 0 → **19** | `feasibility-strip-hours` ×1 → **none** | 45 → **45** |
| ROC Div1A/Vet | 12 | 15 → **15** | 12 → **12** | none → **none** | 12 → **12** |
| ROC Div1A/Div2/Vet | 18 | 15 → **15** | 16 → **16** | none → **none** | 18 → **18** |
| **ROC Mega** | 42 | 20 → **20** | 0 → **12** | `feasibility-strip-hours` ×1 → **none** | 42 → **42** |
| RYC Weekend | 18 | 20 → **20** | 12 → **12** | none → **none** | 18 → **18** |
| RJCC Weekend | 12 | 19 → **19** | 6 → **6** | none → **none** | 12 → **12** |
| **Junior Olympics** | 18 | 39 → **39** | 0 → **11** | `feasibility-strip-hours` ×1 → **none** | 18 → **18** |

The suggested column did not move on any of the ten, which is the expected
result: US1 changes severity only. US2 (T010–T012) is what moves it.

`validateConfig(…, BINDING)` now returns **zero ERROR findings on all twenty
cells**. The five that carried `feasibility-strip-hours` ×1 as an ERROR carry it
as a WARN — `warnRuleCounts` reads `{ "feasibility-strip-hours": 1 }` on each of
the five, at the suggested count, and empty at 80/12. The rule id, field and
message text are unchanged; only the severity moved. Nothing at 80/12 changed at
all, in any field, on any template — no template was ever emptied there.

### SC-001 verdict: **met, on all five**

> all five named templates must place a non-zero count at their suggested strip
> count

| Template | Placed @ suggested | Non-zero? |
|---|---|---|
| NAC Youth | **10** of 24 | **yes** |
| NAC Cadet/Junior | **13** of 24 | **yes** |
| NAC Vet/Div1/Junior | **19** of 66 | **yes** |
| ROC Mega | **12** of 42 | **yes** |
| Junior Olympics | **11** of 18 | **yes** |

**No template in the table remains at zero**, at either strip count. There is no
row to record against a blocking rule id.

### SC-002 verdict: **met**

> no template may place fewer than it did in T002

Cell by cell against §1, at both strip counts: five cells rose
(0→10, 0→13, 0→19, 0→12, 0→11, all in the suggested column) and the other
**fifteen are identical**. Not one cell fell. The five non-feasibility templates
— NAC Div1/Junior, ROC Div1A/Vet, ROC Div1A/Div2/Vet, RYC Weekend, RJCC Weekend
— are unchanged in every field, which is what a severity-only change should do to
a template the finding never fired on.

### What the demotion did, and what it did not

The demotion did exactly one thing: it stopped the gate aborting before packing.
§1 recorded that each of the five returned **exactly one bottleneck in total** at
its suggested count — the feasibility ERROR — because `scheduleAll` never reached
the packer. Now the packer runs and reports on every event it could not fit. That
is the shape §1 predicted, and it is the demotion working, not drift.

What it did not do is make the boards full. Every one of the five is still a
partial board, and two are small ones:

| Template | Placed @ suggested | Unplaced | Warnings behind the shortfall |
|---|---|---:|---|
| NAC Youth | 10 of 24 | 14 | `DEADLINE_BREACH` ×16, `RESOURCE_EXHAUSTION` ×1 |
| NAC Cadet/Junior | 13 of 24 | 11 | `DEADLINE_BREACH` ×13, `UNAVOIDABLE_CROSSOVER_CONFLICT` ×6, `RESOURCE_EXHAUSTION` ×1 |
| NAC Vet/Div1/Junior | 19 of 66 | 47 | `DEADLINE_BREACH` ×53, `RESOURCE_EXHAUSTION` ×1 |
| ROC Mega | 12 of 42 | 30 | `DEADLINE_BREACH` ×33, `RESOURCE_EXHAUSTION` ×1 |
| Junior Olympics | 11 of 18 | 7 | `DEADLINE_BREACH` ×9, `RESOURCE_EXHAUSTION` ×1 |

The `RESOURCE_EXHAUSTION` ×1 on each of the five is the demoted feasibility
finding itself, now arriving as a WARN bottleneck instead of aborting the run.
The shortfall is `DEADLINE_BREACH` — events that survive validation and then lose
a race against the day's end — which is the shortfall
[spec.md §Out of Scope](./spec.md) explicitly does not fix. NAC Cadet/Junior's
six `UNAVOIDABLE_CROSSOVER_CONFLICT` warnings are 010's R7 reporting the
least-bad-color fallback, the same six §1 recorded at 80/12; they cost it no
events there and they are not what holds back the 11 here.

`NAC Vet/Div1/Junior` (19 of 66) and `ROC Mega` (12 of 42) are the two thin
boards. Both fill substantially when given strips — 45 of 66 and 42 of 42 at
80/12 — so the remaining gap at the suggested count is a strip count too low for
the work, not an engine that cannot place the events. **That is precisely what
US2 exists to fix**, and the numbers above are what T012's after-US2 table is
measured against.

---

## 5. Ten templates after US2

`[M]` Measured at `2d449233c1` (T011) plus T012's working tree — the store copy
deleted and the **Suggest** button routed through `buildTournamentConfig` to
`suggestStripCount`. Same method as §1 and §4, unchanged: §The method's
`runTemplate` verbatim, written to `tmp/t012-remeasure-probe.test.ts`, run with

```
timeout 500 pnpm --silent vitest run tmp/t012-remeasure-probe.test.ts > ./tmp/probe-t012.log 2>&1
```

and deleted after the numbers were recorded. It carries T008's two reporting
fields (`unplacedIds`, `errorBottleneckCount`) and nothing else new. Days stay at
the store's default of 3, tournament type stays NAC on all ten, video strips
resolve to 8 in the suggested column.

### Three-way comparison

"Before" is §1 (`8335928dc5`, pre-feature). "After US1" is §4 (`d7c58dbd90`).
"After US2" is this run.

| Template | Events | Suggested (before / US1 / **US2**) | Placed @ suggested (before / US1 / **US2**) | Placed @ 80/12 (before / US1 / **US2**) |
|---|---:|---|---|---|
| NAC Youth | 24 | 39 / 39 / **258** | 0 / 10 / **24** | 22 / 22 / **22** |
| NAC Cadet/Junior | 24 | 39 / 39 / **192** | 0 / 13 / **24** | 24 / 24 / **24** |
| NAC Div1/Junior | 24 | 45 / 45 / **195** | 13 / 13 / **24** | 24 / 24 / **24** |
| NAC Vet/Div1/Junior | 66 | 45 / 45 / **357** | 0 / 19 / **66** | 45 / 45 / **45** |
| ROC Div1A/Vet | 12 | 15 / 15 / **30** | 12 / 12 / **12** | 12 / 12 / **12** |
| ROC Div1A/Div2/Vet | 18 | 15 / 15 / **49** | 16 / 16 / **18** | 18 / 18 / **18** |
| ROC Mega | 42 | 20 / 20 / **210** | 0 / 12 / **42** | 42 / 42 / **42** |
| RYC Weekend | 18 | 20 / 20 / **100** | 12 / 12 / **18** | 18 / 18 / **18** |
| RJCC Weekend | 12 | 19 / 19 / **72** | 6 / 6 / **12** | 12 / 12 / **12** |
| Junior Olympics | 18 | 39 / 39 / **179** | 0 / 11 / **18** | 18 / 18 / **18** |

**Every template places its whole field at its suggested count** — ten of ten,
`placed == eventCount` on every row. `validateConfig(…, BINDING)` returns zero
ERROR findings and zero WARN findings on all twenty cells. The
`feasibility-strip-hours` WARN that §4 recorded on five templates is gone
entirely: at these strip counts the estimate is no longer short.

`DEADLINE_BREACH` — the shortfall §4 named and spec §Out of Scope does not fix —
vanishes from the suggested column on all ten. It was never a validation problem:
with enough strips to run the day's pools at once, no event loses its race
against the day's end. The only warning left anywhere in the suggested column is
`NAC Cadet/Junior`'s `UNAVOIDABLE_CROSSOVER_CONFLICT` ×6, which is 010's R7
reporting the least-bad-color fallback and costs it no events (it places 24 of
24).

The **80/12 column is byte-identical to §1 and §4 on all ten templates**, which
is the expected result: that column never calls the suggestion.

### SC-002 verdict: **met**

> No template places fewer events after this feature than before it, at either
> the suggested count or at 80 strips / 12 video.

Cell by cell against both §1 and §4, at both strip counts: **not one cell fell.**
Ten cells rose in the suggested column (every template gained, from +6 on
ROC Div1A/Vet's already-full 12 to +47 on NAC Vet/Div1/Junior) and the ten cells
at 80/12 are unchanged. No halt condition fired.

### Is this a number an organizer can act on?

Honestly: **on the four largest templates, no.** The rule is arithmetically
correct and the boards it produces are full, but the number it produces is a
*sufficient* strip count, not a *minimum* one — nothing in the rule searches for
the smallest count that fills the board, and the gap between the two is large.

| Template | Suggested | × the 80-strip column | Placed @ 80 | Placed @ suggested | Events bought by the extra strips |
|---|---:|---:|---:|---:|---|
| NAC Vet/Div1/Junior | **357** | 4.5× | 45 of 66 | 66 of 66 | +21, for +277 strips |
| NAC Youth | **258** | 3.2× | 22 of 24 | 24 of 24 | **+2, for +178 strips** |
| ROC Mega | **210** | 2.6× | 42 of 42 | 42 of 42 | **none** |
| NAC Div1/Junior | **195** | 2.4× | 24 of 24 | 24 of 24 | **none** |
| NAC Cadet/Junior | **192** | 2.4× | 24 of 24 | 24 of 24 | **none** |
| Junior Olympics | **179** | 2.2× | 18 of 18 | 18 of 18 | **none** |
| RYC Weekend | **100** | 1.3× | 18 of 18 | 18 of 18 | none |
| RJCC Weekend | **72** | 0.9× | 12 of 12 | 12 of 12 | none |
| ROC Div1A/Div2/Vet | **49** | 0.6× | 18 of 18 | 18 of 18 | none |
| ROC Div1A/Vet | **30** | 0.4× | 12 of 12 | 12 of 12 | none |

**On eight of the ten templates, 80 strips already place exactly what the
suggested count places.** The suggestion buys additional events on two templates
only, and on `NAC Youth` it costs 178 extra strips to place 2 more events. A
venue asked for 357 strips is being asked to more than quadruple a floor that
already schedules 45 of 66 events.

What US2 fixed is real and is what it was scoped to fix: there is now **one** rule,
it sizes for the busiest day rather than the largest single event (the defect
audit §2.1 L5 named), and the count it returns genuinely runs the tournament —
the five templates that used to return an empty board now return a complete one.
What it did not do, and was not asked to do, is return the *cheapest* count that
works. On the small regionals (30, 49, 72, 100) the answer is plausible as a
venue plan. On the large NACs (179–357) it reads as a theoretical ceiling.

**For the handoff, not fixed here**: the suggestion has no lower bound and no
search. A follow-up that reports the smallest strip count placing every event —
or that presents the busiest-day number as "to run every pool concurrently" next
to a second, smaller "to place every event" figure — is what would make the large
templates actionable. Recording it here rather than treating 258 as a clean win.
