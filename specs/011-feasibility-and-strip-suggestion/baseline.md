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
