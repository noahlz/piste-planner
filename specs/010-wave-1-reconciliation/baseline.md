# Baseline: the tree before Wave 1 touches it

**Feature**: `010-wave-1-reconciliation` · **Task**: T002
**Measured**: 2026-09-05, on branch `010-wave-1-reconciliation` at
`516ecb797a` (`main` at `a2dc363e45`), before any file under `src/` was edited.
**Gate at measurement time**: `pnpm test` 67 files / 1799 tests passed,
`tsc -b` clean.

Every figure below is `[M]` measured by running code, or `[R]` read from source.
Where a measurement disagrees with
[`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md),
both numbers are recorded and §6 names the disagreement. **The measurement is
the number this feature uses.**

The probe that produced §1, §2, §3 and §4 is Appendix A. It lived at
`tmp/baseline-probe.test.ts`, was run by `pnpm vitest run`, and was deleted
after this file was written. Appendix B holds the coverage run behind §2.

---

## §1 B1–B8: the drift-ledger digest fields

`[M]` Produced by running `scheduleAll` on the same `buildCompetitions` /
`tournamentConfig` pair `__tests__/engine/driftLedger.test.ts` uses, and
tallying the three digest fields the same way `buildDigest` does. Each figure
was cross-checked against the committed snapshot
(`__tests__/engine/__snapshots__/driftLedger.test.ts.snap`), which the green
suite proves current. All eight agree.

| Scenario | Fixture (days / strips / video / type) | competitionCount | scheduledCount | `SCHEDULED_FLOORS` | errorCount |
|---|---|---|---|---|---|
| B1 | 4 / 80 / 12 / NAC | 24 | **24** | 24 | 0 |
| B2 | 4 / 80 / 12 / NAC | 24 | **24** | 24 | 0 |
| B3 | 4 / 80 / 12 / NAC | 24 | **24** | 24 | 0 |
| B4 | 3 / 40 / 12 / SYC | 30 | **0** | 0 | 1 |
| B5 | 3 / 60 / 12 / SJCC | 12 | **12** | 12 | 0 |
| B6 | 3 / 48 / 12 / ROC | 54 | **44** | 44 | 10 |
| B7 | 4 / 80 / 12 / NAC | 18 | **18** | 18 | 0 |
| B8 | 4 / 68 / 12 / NAC | 53 | **52** | 52 | 1 |

Every scenario sits **exactly on** its floor. There is no slack anywhere in the
ledger: a single event lost on any scenario halts the task that lost it.

`scheduledCount` (the key count of the returned schedule) and the placed count
(entries with a non-null `pool_start`) are equal on all eight.

### `warnCountsByCause`, per scenario

| Scenario | DEADLINE_BREACH | RESOURCE_EXHAUSTION | SCHEDULE_ACCEPTED_WITH_WARNINGS |
|---|---|---|---|
| B1 | – | – | 1 |
| B2 | – | 6 | 2 |
| B3 | – | – | – |
| B4 | – | 12 | – |
| B5 | – | 12 | – |
| B6 | 12 | 18 | – |
| B7 | – | – | 2 |
| B8 | 1 | 5 | 2 |

B3's `warnCountsByCause` is `{}`.
`BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT` — the cause R7 will emit
([research.md D1](./research.md)) — **appears on no scenario today**.

### The validation findings behind those counts

`[M]` `validateConfig(config, competitions, ValidationMode.BINDING)` — the same
call `concurrentScheduler.ts:186` makes. The scheduler discards the rule id when
it turns a finding into a bottleneck, so the ids below come from calling
`validateConfig` directly.

| Scenario | ERROR rules | WARN rules |
|---|---|---|
| B1, B2, B3, B7 | none | B2: `video-dead-config` ×6 |
| B4 | `feasibility-strip-hours` ×1 | `regional-cut-override` ×12 |
| B5 | none | `regional-cut-override` ×12 |
| B6 | none | `regional-cut-override` ×18 |
| B8 | none | `video-dead-config` ×5 |

B6's 10 ERROR bottlenecks and B8's 1 are **scheduling** errors, not validation
errors: no B6 or B8 finding reaches ERROR severity in `validateConfig`. This
matters for T015 — R2's gate only ever sees validation ERRORs, and on the ledger
only B4 has one.

---

## §2 Does the DSatur least-bad-color fallback fire?

**On B1–B8: no. Not once, in either phase, on any of the eight.**

This is the number that decides whether R7 (T009/T010) moves the ledger. It does
not.

### How it was measured

Two independent methods, agreeing.

**(a) Reconstruction from the returned `dayMap` `[M]`.** For each scenario the
probe builds `buildConstraintGraph(competitions)`, calls
`assignDaysByColoring(graph, competitions, config)`, and reports every pair
sharing a day across an edge whose weight is `Infinity`. `assignDaysByColoring`
compacts phase 2's colors to `0..k-1` (`dayColoring.ts:638-643`), and compaction
preserves equality, so a violation in the compacted map is a violation in phase
2's own coloring. No source was instrumented.

The reconstruction is a *proof* of absence, not merely an absence of evidence:

- The normal branch (`dayColoring.ts:494-504`) can never place a vertex on a
  color a hard neighbour already holds.
- The relaxed branch (`:522-532`) can only break an `INDIV_TEAM_RELAXABLE_BLOCKS`
  edge, and it always records `relaxations.set(id, 3)` (`:559-561`).
- Both least-bad branches (`:534-544`, `:546-556`) leave a trace by
  construction. If `requiredColor` was set and blocked, the chosen color either
  differs from the sibling's day (a Veteran Co-Day break) or equals a blocked
  color (a hard-edge violation). If `requiredColor` was null, every color was
  blocked by a colored hard neighbour, so whichever is chosen carries one.

So **zero violations + zero relaxations + zero Co-Day breaks ⟹ neither fallback
branch fired.** All three are zero on all eight scenarios:

| Scenario | days_available | effectiveDays | colors used | relaxations recorded | hard-edge violations | Vet Co-Day breaks | fallback fired |
|---|---|---|---|---|---|---|---|
| B1 | 4 | 4 | 4 | 0 | **0** | 0 | **no** |
| B2 | 4 | 4 | 4 | 0 | **0** | 0 | **no** |
| B3 | 4 | 4 | 4 | 0 | **0** | 0 | **no** |
| B4 | 3 | 3 | 3 | 0 | **0** | 0 | **no** |
| B5 | 3 | 3 | 3 | 0 | **0** | 0 | **no** |
| B6 | 3 | 3 | 3 | 0 | **0** | 0 | **no** |
| B7 | 4 | 4 | 4 | 0 | **0** | 0 | **no** |
| B8 | 4 | 4 | 4 | 0 | **0** | 0 | **no** |

B4 is listed for completeness: it trips the upfront feasibility gate, so the
scheduler never reaches `assignDaysByColoring` at all. The row above is the
coloring the probe ran directly, outside the gate.

**(b) V8 statement coverage `[M]`.** Appendix B. Running only the B1–B8 probe
test under `--coverage`, every statement of the no-valid-color block —
`dayColoring.ts:507` through `:562`, the relaxed branch and both least-bad
branches — has an execution count of **0**, against 896 executions of the
enclosing per-vertex loop. This also covers **phase 1**, which method (a) cannot
see, so the answer is unconditional: no fallback of any kind runs on the drift
ledger.

### Consequence for R7

**R7 is expected to move the drift ledger by nothing.** `warnCountsByCause`
gains no key on any of B1–B8, no scheduled count moves, and no start time moves.
T010's "expected drift" is therefore *nothing moved*, and any movement at all
means T009 changed the coloring.

`SC-003`'s witness lives outside the ledger, in the templates.

### Where the fallback does fire: the ten templates at 3 days

`[M]` Same reconstruction, run on each template built through the app's own
path (§3), at the store's default 3 days, under both strip columns.

| Template | relaxations | violations | of which non-relaxable | branch that fired |
|---|---|---|---|---|
| NAC Youth | 0 | 0 | 0 | none |
| **NAC Cadet/Junior** | 0 | **6** | **6** | **least-bad (`:546-556`)** |
| NAC Div1/Junior | 6 | 6 | 0 | relaxed (`:522-532`) |
| NAC Vet/Div1/Junior | 6 | 6 | 0 | relaxed (`:522-532`) |
| ROC Div1A/Vet | 0 | 0 | 0 | none |
| ROC Div1A/Div2/Vet | 0 | 0 | 0 | none |
| ROC Mega | 0 | 0 | 0 | none |
| RYC Weekend | 0 | 0 | 0 | none |
| RJCC Weekend | 0 | 0 | 0 | none |
| Junior Olympics | 0 | 0 | 0 | none |

Identical in both strip columns. The branch attribution is proved three ways:

1. `[M]` A relaxed-branch choice can only break a relaxable edge, so
   Cadet/Junior's six — all non-relaxable — can only come from a least-bad
   branch, and Div1/Junior's six — all relaxable, on six vertices carrying
   `relaxations = 3` — are consistent with the relaxed branch.
2. `[R]` The structure says the same. Each (gender, weapon) group of these two
   templates is a K₄. In Div1/Junior the fourth vertex colored has three
   neighbours of which **one** is relaxable (`INDIV_TEAM_RELAXABLE_BLOCKS` is
   DIV1↔JUNIOR only, `constants.ts:560-563`), so at most two colors are blocked
   non-relaxably out of three and `relaxedValidColors` is never empty — the
   relaxed branch always succeeds. In Cadet/Junior **no** edge of the K₄ is
   relaxable (CADET↔JUNIOR is Group 1, ind↔team of one category is
   same-population), so `relaxable.size === 0` and control reaches `:546`.
3. `[M]` Coverage over the template run: `:522-532` executes 48 times
   (6 groups × 2 templates × 2 strip columns × 2 phases) and `:547-556` executes
   24 times (6 × 1 template × 2 columns × 2 phases). `:534-544` — the
   relaxable-but-still-blocked least-bad branch — executes **0** times anywhere.

**The audit's six pairs for `NAC Cadet/Junior` at 3 days is confirmed at 6.**

### Witness pairs — `NAC Cadet/Junior`, 3 days

The count is 6 under both strip columns. **The pairs are not the same**, because
`colorPenalty`'s load-balancing term reads `dayCapacity = strips_total ×
DAY_LENGTH/60` (`dayColoring.ts:612`). A test that pins pairs must pin the strip
count with them. Every violation lands on **day 0**, which is
`chosenColor = 0` never improving because every candidate penalty is `Infinity`.

At the app-suggested 39 strips (video 8):

| a | b | day | edge |
|---|---|---|---|
| CDT-M-EPEE-TEAM | JR-M-EPEE-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-M-FOIL-TEAM | JR-M-FOIL-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-M-SABRE-IND | JR-M-SABRE-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-W-EPEE-IND | JR-W-EPEE-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-W-FOIL-IND | JR-W-FOIL-TEAM | 0 | Group 1 CADET↔JUNIOR |
| JR-W-SABRE-IND | JR-W-SABRE-TEAM | 0 | **same-population** |

At 80 strips / 12 video:

| a | b | day | edge |
|---|---|---|---|
| CDT-M-EPEE-TEAM | JR-M-EPEE-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-M-FOIL-TEAM | JR-M-FOIL-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-M-SABRE-IND | JR-M-SABRE-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-W-EPEE-TEAM | JR-W-EPEE-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-W-FOIL-TEAM | JR-W-FOIL-TEAM | 0 | Group 1 CADET↔JUNIOR |
| CDT-W-SABRE-TEAM | JR-W-SABRE-TEAM | 0 | Group 1 CADET↔JUNIOR |

The suggested-strip column contains a **same-population** violation
(`JR-W-SABRE-IND` with its own team event), which is the strictest edge in the
graph and the one METHODOLOGY:192 says is not relaxed at any level.

`NAC Div1/Junior`'s and `NAC Vet/Div1/Junior`'s six are all
`D1-<g>-<w>-IND` with `JR-<g>-<w>-TEAM`, one per (gender, weapon), on varying
days. Those are the relaxed branch working as designed, and T009 must **not**
collect them — they are already reported through `constraint_relaxation_level`
and a `CONSTRAINT_RELAXED` bottleneck.

---

## §3 The ten templates through the app's own configuration path

`[M]` Per template: reset the store to `getInitialState()`, `setDays(3)`,
`applyTemplate(name)` — which is the `TEMPLATE_FENCER_DEFAULTS` lookup — then set
strips, then `buildTournamentConfig(state)` and `scheduleAll`. "Placed" counts
schedule entries with a non-null `pool_start`, the same rule
`runScheduleAll` uses to build placements (`src/store/runActions.ts:31`).

Fixed conditions, all four of which the app itself supplies and none of which
`applyTemplate` changes:

- **Days: 3.** The store's default (`src/store/store.ts:193`). `setDays(3)` is
  called so `dayConfigs` is populated, as it is after boot.
- **Tournament type: NAC** for all ten. `applyTemplate` does not touch the type,
  so a template picked from the initial store state runs as a NAC even when its
  name says ROC. This is the app's real behavior and it is why some numbers
  below differ from the audit's — see §6 and the supplementary table.
- **Suggested column**: `useStore.getState().suggestStrips()`, which is
  `src/store/stripSuggestion.ts`'s `suggestStrips` over `selectedCompetitions`.
  Video strips left at `null`, which resolves to the NAC default of **8**
  (`src/store/typeDefaults.ts`).
- **80/12 column**: `setStrips(80)`, `setVideoStrips(12)` — the audit's venue.

| Template | Events | Suggested strips | Placed @ suggested | ERROR rules @ suggested | Placed @ 80/12 | ERROR rules @ 80/12 |
|---|---|---|---|---|---|---|
| NAC Youth | 24 | 39 | **0** | `feasibility-strip-hours` ×1 | **22** | none |
| NAC Cadet/Junior | 24 | 39 | **0** | `feasibility-strip-hours` ×1 | **24** | none |
| NAC Div1/Junior | 24 | 45 | **0** | `indiv-team-same-day` ×2 | **0** | `indiv-team-same-day` ×2 |
| NAC Vet/Div1/Junior | 66 | 45 | **0** | `indiv-team-same-day` ×2, `feasibility-strip-hours` ×1 | **0** | `indiv-team-same-day` ×2 |
| ROC Div1A/Vet | 12 | 15 | **12** | none | **12** | none |
| ROC Div1A/Div2/Vet | 18 | 15 | **16** | none | **18** | none |
| ROC Mega | 42 | 20 | **0** | `feasibility-strip-hours` ×1 | **42** | none |
| RYC Weekend | 18 | 20 | **12** | none | **18** | none |
| RJCC Weekend | 12 | 19 | **6** | none | **12** | none |
| Junior Olympics | 18 | 39 | **0** | `feasibility-strip-hours` ×1 | **18** | none |

Both `indiv-team-same-day` findings carry the same first message at every strip
count:

```
Individual D1-M-EPEE-IND + team D1-M-EPEE-TEAM worst-case same-day duration
855 min exceeds DAY_LENGTH_MINS 840 min
```

### What T004 and T006 need from this table

- **T004's premise holds.** `NAC Div1/Junior` at 3 days is empty at both strip
  counts and its **only** ERROR rule is `indiv-team-same-day`, twice. Use 80
  strips / 12 video: at the suggested 45 the answer is the same, but only
  because feasibility happens not to fire on that template.
- **T006 must expect `NAC Vet/Div1/Junior` to stay empty at the suggested strip
  count**, because `feasibility-strip-hours` is there underneath R1's two
  errors. At 80/12 it has nothing underneath, so SC-001 is reachable there and
  not at 45. R1 does not own the feasibility finding — that is Wave 3's R5.
- **`NAC Youth` places 22 of 24 at 80/12**, not 24. The two absent are
  `CDT-W-FOIL-IND` and `Y14-W-FOIL-IND`, with 2 `DEADLINE_BREACH` warnings and
  no error. Contradicts §2.1 L5 — see §6.
- Non-zero placed counts below the event count carry `DEADLINE_BREACH`
  warnings, never errors: ROC Div1A/Div2/Vet @15 → 2, RYC Weekend @20 → 8,
  RJCC Weekend @19 → 6.

### Two supplementary columns, recorded so a re-measurement is not ambiguous

**`dayConfigs` empty.** Repeating every run without `setDays(3)` — the untouched
initial state, where `days_available` is 3 but `dayConfigs` is `[]` and
`dayStart`/`dayEnd` fall back to the uniform day length (`types.ts:442-458`) —
changes exactly one number in the whole table: **RYC Weekend at 20 strips places
11 instead of 12**. Everything else is identical. §3's table is the
`setDays(3)` variant.

**Tournament type matching the template name.** Not the app path —
`applyTemplate` never sets the type — measured only because the audit's figures
imply it typed its runs.

| Template | Type | Placed @ suggested | ERROR rules @ suggested | Placed @ 80/12 |
|---|---|---|---|---|
| ROC Div1A/Vet | ROC | 11 / 12 | none | 12 / 12 |
| ROC Div1A/Div2/Vet | ROC | 10 / 18 | none | 18 / 18 |
| ROC Mega | ROC | 0 / 42 | `feasibility-strip-hours` ×1 | 41 / 42 |
| RYC Weekend | RYC | **0 / 18** | `feasibility-strip-hours` ×1 | 18 / 18 |
| RJCC Weekend | RJCC | 5 / 12 | none | 12 / 12 |

The six NAC/JO templates are unchanged, since their implied type is the default.
Typing the regional templates resolves video strips to 0 and applies
`REGIONAL_CUT_OVERRIDES`, which is what makes RYC Weekend empty on feasibility
at its suggested count — the case §1.2.5 reports and the app path does not
reproduce.

### After R1 — T006, measured at commit `5a3a1a6826`

`[M]` Same method, unchanged: `tmp/t006-remeasure-probe.test.ts`, Appendix C,
run with `pnpm --silent vitest run tmp/t006-remeasure-probe.test.ts`, deleted
after this file was written. `indiv-team-same-day` no longer exists in
`src/engine/validation.ts` as of `5a3a1a6826` (R1). Before/after side by side;
the "before" column is §3's table above, unchanged.

| Template | Placed @ suggested (before → after) | ERROR rules @ suggested (before → after) | Placed @ 80/12 (before → after) | ERROR rules @ 80/12 (before → after) |
|---|---|---|---|---|
| NAC Youth | 0 → **0** | `feasibility-strip-hours` ×1 → **same** | 22 → **22** | none → **same** |
| NAC Cadet/Junior | 0 → **0** | `feasibility-strip-hours` ×1 → **same** | 24 → **24** | none → **same** |
| **NAC Div1/Junior** | 0 → **13** | `indiv-team-same-day` ×2 → **none** | 0 → **24** | `indiv-team-same-day` ×2 → **none** |
| **NAC Vet/Div1/Junior** | 0 → **0** | `indiv-team-same-day` ×2, `feasibility-strip-hours` ×1 → **`feasibility-strip-hours` ×1** | 0 → **45** | `indiv-team-same-day` ×2 → **none** |
| ROC Div1A/Vet | 12 → **12** | none → **same** | 12 → **12** | none → **same** |
| ROC Div1A/Div2/Vet | 16 → **16** | none → **same** | 18 → **18** | none → **same** |
| ROC Mega | 0 → **0** | `feasibility-strip-hours` ×1 → **same** | 42 → **42** | none → **same** |
| RYC Weekend | 12 → **12** | none → **same** | 18 → **18** | none → **same** |
| RJCC Weekend | 6 → **6** | none → **same** | 12 → **12** | none → **same** |
| Junior Olympics | 0 → **0** | `feasibility-strip-hours` ×1 → **same** | 18 → **18** | none → **same** |

Only the two templates R1 targets moved. The other eight are identical in
every field, before and after — `indiv-team-same-day` never fired on them, so
deleting it had nothing to remove.

**NAC Div1/Junior**'s new non-empty schedules carry no ERROR at either strip
count. At suggested (45 strips) it places 13 of 24 with 14 `DEADLINE_BREACH`
warnings; at 80/12 it places all 24 clean.

**NAC Vet/Div1/Junior** stays at 0 at its suggested 45 strips, now on
`feasibility-strip-hours` alone — exactly the dispatch's prediction, and the
reason is unchanged from §3: that finding sits underneath R1's two errors and
belongs to Wave 3's R5, not this feature.

**Correction to the dispatch's prediction:** at 80/12, `NAC Vet/Div1/Junior`
was expected to reach 66/66. It measures **45 of 66**, with 21
`DEADLINE_BREACH` warnings and zero ERRORs — the same warning-driven shortfall
pattern §3 already documented on ROC Div1A/Div2/Vet, RYC Weekend and RJCC
Weekend (events surviving validation but losing a scheduling race against the
deadline). The measurement is the number this feature uses per the tasks.md
standing rule; 45/66 is still non-zero, so SC-001 does not turn on the
discrepancy.

### SC-001 verdict

**Met.** Both named templates now place a non-zero count at the store's
default day count: `NAC Div1/Junior` places 13/24 (suggested) and 24/24
(80/12); `NAC Vet/Div1/Junior` places 0/66 (suggested, blocked by
`feasibility-strip-hours`, not R1's rule) and 45/66 (80/12). SC-001 does not
name a strip count, and both templates clear it at 80/12; `NAC Div1/Junior`
clears it at its suggested count too.

### Still blocked after R1

**`NAC Vet/Div1/Junior` at its suggested 45 strips** is the only cell in the
table still at zero. It is blocked by `feasibility-strip-hours` ×1
(`RESOURCE_INSUFFICIENT: 3670 strip-hours needed over 66 events; 1890
available`), which belongs to Wave 3's R5 per the dispatch brief and is not
touched here.

---

## §4 `crossoverPenalty` today — the five pairs T017 must find

`[M]` Both competitions individual, same gender (MEN) and weapon (FOIL),
built from `makeCompetition`. Symmetric in every case (a↔b equals b↔a).

| Pair | Measured today | Specified | Source of today's value |
|---|---|---|---|
| Y8 ↔ Y10 | **0.8** | 0.0 (L9) | `CROSSOVER_GRAPH[Y8][Y10] = 0.8` (`constants.ts:415`) |
| Y8 ↔ Y12 | **0.3** | 0.0 (L9) | two-hop derivation in `buildPenaltyMatrix`, capped at 0.3, from the Y8→Y10 edge above |
| DIV1 ↔ CADET | **0.8** | 5.0 (L3) | `CROSSOVER_GRAPH[CADET][DIV1] = 0.8` (`constants.ts:426`) |
| DIV1 ↔ DIV2 | **0.0** | 3.0 (L3) | no edge in `CROSSOVER_GRAPH`, direct or two-hop |
| DIV1 ↔ DIV3 | **0.0** | 3.0 (L3) | no edge in `CROSSOVER_GRAPH`, direct or two-hop |

These are the values T017's three red tests must report finding. They match
§2.1 L3 and the L9 finding exactly.

`[R]` `SOFT_SEPARATION_PAIRS` (`constants.ts:471-475`) holds 5.0 / 3.0 / 3.0 and
has no reader in `src/`.

---

## §5 Suite and repository state

`[M]`

- `pnpm test`: **67 files, 1799 tests, all passed**, exit 0.
- `pnpm exec tsc -b`: exit 0, no output.
- `git rev-parse main` → `a2dc363e4508f0d7e3b6ede6ff0de2e026fb287c`
- `git rev-parse HEAD` (branch `010-wave-1-reconciliation`) →
  `516ecb797a347489c6bd28c011700e09bcd1a6e1`

T023 accounts for its delta against 67 / 1799.

---

## §6 Where the measurement contradicts the reconciliation document

Four disagreements. In each, the measurement above is the number this feature
uses.

1. **§2.1 L5: "at 80 it schedules 24/24" for `NAC Youth`.** Measured **22/24**
   at 3 days, 80 strips, 12 video, through the app path. Two events
   (`CDT-W-FOIL-IND`, `Y14-W-FOIL-IND`) go unplaced with 2 `DEADLINE_BREACH`
   warnings and no ERROR. L5's larger claim — that the template empties at the
   suggested count and fills at 80 — holds. Its "24/24" does not. Nothing in
   Wave 1 depends on it.

2. **§1.2.5: "`feasibility-strip-hours` alone empties … RYC Weekend … at the
   strip count the app itself suggests."** Down the app's own path RYC Weekend
   at its suggested 20 strips **places 12 of 18 with zero ERRORs**. It empties
   on feasibility only when the tournament type is also set to RYC, which
   `applyTemplate` does not do. The finding is real, the path to it is not the
   app's.

3. **§1.2.5: "ROC Mega (3 days, 40 strips)".** `suggestStrips` returns **20**
   for ROC Mega, not 40. The template does empty on `feasibility-strip-hours` at
   20, so the conclusion stands and the strip figure does not.

4. **§1.2.2's table is confirmed where it overlaps and is silent where it
   matters most.** `NAC Cadet/Junior` at 3 days measures 6 violations and 0
   relaxations, exactly as the table says, and `NAC Div1/Junior` at 3 days
   measures 6 and 6, also as stated. What the table does not say, and what this
   baseline adds, is that **the drift ledger's own eight scenarios never enter
   the fallback at all**. The audit calls this "the single most serious finding
   in the audit", and it is invisible to B1–B8.

Two further clarifications, not contradictions:

- **§1.2.2 attributes both templates' violations to the least-bad branch.** Only
  `NAC Cadet/Junior`'s six are least-bad. `NAC Div1/Junior`'s six come from the
  relaxed branch (`:522-532`), which already reports itself. T009 collects only
  the two least-bad branches, so it will report Cadet/Junior's six and
  Div1/Junior's none.
- **§1.2.4's 0/24 and 0/66 with two `indiv-team-same-day` ERRORs at 80/12 is
  confirmed exactly**, message included.

---

## Appendix A — the probe

Written to `tmp/baseline-probe.test.ts`, run with
`pnpm --silent vitest run tmp/baseline-probe.test.ts`, and deleted. It reads
`src/` and never writes to it. Every loop is bounded by a fixed collection.

```ts
/**
 * TEMPORARY baseline probe for 010 T002. Deleted after measurement; its source
 * is pasted into specs/010-wave-1-reconciliation/baseline.md as an appendix.
 *
 * Measures, without touching src/:
 *   §1 B1-B8 scheduledCount / errorCount / warnCountsByCause
 *   §2 hard-edge violations in the day map, and their relaxability
 *   §3 the ten TEMPLATES down the app's own path, at two strip counts
 *   §4 crossoverPenalty for the five pairs T017 pins
 *
 * All output is printed as JSON between markers so it can be lifted verbatim.
 */
import { describe, it } from 'vitest'
import { scheduleAll } from '../src/engine/scheduler.ts'
import { buildConstraintGraph } from '../src/engine/constraintGraph.ts'
import type { ConstraintGraph } from '../src/engine/constraintGraph.ts'
import { assignDaysByColoring } from '../src/engine/dayColoring.ts'
import { validateConfig } from '../src/engine/validation.ts'
import { crossoverPenalty } from '../src/engine/crossover.ts'
import {
  BottleneckSeverity, ValidationMode, Category, Gender, Weapon, EventType, VetAgeGroup,
} from '../src/engine/types.ts'
import type { Bottleneck, Competition, TournamentConfig } from '../src/engine/types.ts'
import { INDIV_TEAM_RELAXABLE_BLOCKS } from '../src/engine/constants.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../__tests__/helpers/scenarios.ts'
import type { ScenarioId } from '../__tests__/helpers/scenarios.ts'
import { makeCompetition } from '../__tests__/helpers/factories.ts'
import { TEMPLATES } from '../src/engine/catalogue.ts'
import { useStore } from '../src/store/store.ts'
import { buildTournamentConfig } from '../src/store/buildConfig.ts'

function warnCountsByCause(bottlenecks: Bottleneck[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const b of bottlenecks) {
    if (b.severity !== BottleneckSeverity.WARN) continue
    counts[b.cause] = (counts[b.cause] ?? 0) + 1
  }
  return counts
}

/**
 * Mirrors `findRelaxableEdges` (dayColoring.ts:376) for one ordered pair. An
 * Infinity edge the relaxed branch is allowed to break; every other Infinity
 * edge can only be broken by a least-bad-color branch.
 */
function isRelaxablePair(a: Competition, b: Competition): boolean {
  if (a.gender !== b.gender || a.weapon !== b.weapon) return false
  for (const block of INDIV_TEAM_RELAXABLE_BLOCKS) {
    const aIndiv = a.event_type === EventType.INDIVIDUAL && a.category === block.indivCategory
      && b.event_type === EventType.TEAM && b.category === block.teamCategory
    const aTeam = a.event_type === EventType.TEAM && a.category === block.teamCategory
      && b.event_type === EventType.INDIVIDUAL && b.category === block.indivCategory
    if (aIndiv || aTeam) return true
  }
  return false
}

type Violation = { a: string; b: string; day: number; relaxable: boolean }

/**
 * Runs `assignDaysByColoring` and reconstructs every pair sharing a day across
 * an Infinity edge, from the returned dayMap plus the graph. Day compaction
 * preserves equality, so a violation in the compacted map is a violation in
 * phase 2's own coloring.
 */
function measureColoring(competitions: Competition[], config: TournamentConfig) {
  const graph: ConstraintGraph = buildConstraintGraph(competitions)
  const { dayMap, relaxations, effectiveDays } = assignDaysByColoring(graph, competitions, config)
  const byId = new Map(competitions.map(c => [c.id, c]))

  const seen = new Set<string>()
  const violations: Violation[] = []
  for (const [id, edges] of graph) {
    for (const edge of edges) {
      if (edge.weight !== Infinity) continue
      const day = dayMap.get(id)
      if (day === undefined || dayMap.get(edge.targetId) !== day) continue
      const key = [id, edge.targetId].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      const [a, b] = [id, edge.targetId].sort()
      violations.push({
        a, b, day,
        relaxable: isRelaxablePair(byId.get(a)!, byId.get(b)!),
      })
    }
  }
  violations.sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b))

  // Veteran Co-Day rule (dayColoring.ts:347): age-banded vet individual
  // siblings of the same gender+weapon must share a day. A break can only come
  // from a fallback branch, so it is a second witness that one fired.
  const coDayBreaks: string[] = []
  const banded = competitions.filter(c =>
    c.category === Category.VETERAN
    && c.event_type === EventType.INDIVIDUAL
    && c.vet_age_group !== null
    && c.vet_age_group !== VetAgeGroup.VET_COMBINED)
  const groups = new Map<string, Competition[]>()
  for (const c of banded) {
    const k = `${c.gender}:${c.weapon}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(c)
  }
  for (const [k, members] of groups) {
    const days = new Set(members.map(m => dayMap.get(m.id)))
    if (days.size > 1) coDayBreaks.push(`${k} -> days ${[...days].sort().join(',')}`)
  }

  const dayHistogram: Record<number, number> = {}
  for (const d of dayMap.values()) dayHistogram[d] = (dayHistogram[d] ?? 0) + 1

  return {
    effectiveDays,
    colorsUsed: new Set(dayMap.values()).size,
    dayHistogram,
    relaxationCount: relaxations.size,
    relaxedIds: [...relaxations.keys()].sort(),
    violationCount: violations.length,
    nonRelaxableViolationCount: violations.filter(v => !v.relaxable).length,
    violations,
    vetCoDayBreaks: coDayBreaks,
  }
}

function errorRules(competitions: Competition[], config: TournamentConfig) {
  const findings = validateConfig(config, competitions, ValidationMode.BINDING)
  const errors = findings.filter(f => f.severity === BottleneckSeverity.ERROR)
  const byRule: Record<string, number> = {}
  for (const e of errors) byRule[e.rule] = (byRule[e.rule] ?? 0) + 1
  return {
    errorRuleCounts: byRule,
    firstErrorMessage: errors.length > 0 ? errors[0].message : null,
    warnRuleCounts: findings
      .filter(f => f.severity === BottleneckSeverity.WARN)
      .reduce<Record<string, number>>((acc, f) => {
        acc[f.rule] = (acc[f.rule] ?? 0) + 1
        return acc
      }, {}),
  }
}

/**
 * The tournament type the template's own name implies. `applyTemplate` does
 * NOT set it — the store stays on its default NAC — so this is a supplementary
 * column only, measured because the audit's own strip figures suggest it typed
 * its ROC/RYC runs.
 */
function impliedType(name: string): string {
  if (name.startsWith('ROC')) return 'ROC'
  if (name.startsWith('RYC')) return 'RYC'
  if (name.startsWith('RJCC')) return 'RJCC'
  return 'NAC'
}

/** Applies one template through the store's own actions, then builds the engine config. */
function runTemplate(
  name: string, strips: 'suggest' | number, videoStrips: number | null,
  setDays: boolean, tournamentType?: string,
) {
  useStore.setState(useStore.getInitialState(), true)
  const state = () => useStore.getState()
  if (tournamentType) state().setTournamentType(tournamentType as never)
  if (setDays) state().setDays(state().days_available) // populates dayConfigs at the default 3
  state().applyTemplate(name)
  if (strips === 'suggest') state().suggestStrips()
  else state().setStrips(strips)
  state().setVideoStrips(videoStrips)

  const { config, competitions } = buildTournamentConfig(state())
  const { schedule, bottlenecks } = scheduleAll(competitions, config)
  const placedIds = Object.entries(schedule)
    .filter(([, r]) => r.pool_start !== null).map(([id]) => id)
  const unplaced = competitions.map(c => c.id).filter(id => !placedIds.includes(id)).sort()

  return {
    days: config.days_available,
    dayConfigCount: config.dayConfigs.length,
    tournamentType: config.tournament_type,
    strips: config.strips_total,
    videoStrips: config.video_strips_total,
    eventCount: competitions.length,
    scheduledKeys: Object.keys(schedule).length,
    placed: placedIds.length,
    unplaced,
    ...errorRules(competitions, config),
    warnCountsByCause: warnCountsByCause(bottlenecks),
  }
}

function emit(label: string, value: unknown) {
  console.log(`\n<<<${label}>>>\n${JSON.stringify(value, null, 1)}\n<<<END ${label}>>>`)
}

describe('T002 baseline probe', () => {
  it('S1+S2: B1-B8 digest figures and hard-edge violations', () => {
    const out: Record<string, unknown> = {}
    for (const id of SCENARIO_IDS as ScenarioId[]) {
      const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
      const competitions = buildCompetitions(fencerCounts)
      const config = tournamentConfig(days, strips, videoStrips, tournamentType)
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      out[id] = {
        fixture: { days, strips, videoStrips, tournamentType },
        competitionCount: competitions.length,
        scheduledCount: Object.keys(schedule).length,
        placedCount: Object.values(schedule).filter(r => r.pool_start !== null).length,
        errorCount: bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR).length,
        warnCountsByCause: warnCountsByCause(bottlenecks),
        ...errorRules(competitions, config),
        coloring: measureColoring(competitions, config),
      }
    }
    emit('S1S2', out)
  })

  it('S2b: templates at 3 days, hard-edge violations at both strip counts', () => {
    const out: Record<string, unknown> = {}
    for (const name of Object.keys(TEMPLATES)) {
      const variants: Record<string, unknown> = {}
      for (const [label, strips, video] of [
        ['suggested', 'suggest', null],
        ['80/12', 80, 12],
      ] as [string, 'suggest' | number, number | null][]) {
        useStore.setState(useStore.getInitialState(), true)
        const state = () => useStore.getState()
        state().setDays(state().days_available)
        state().applyTemplate(name)
        if (strips === 'suggest') state().suggestStrips()
        else state().setStrips(strips)
        state().setVideoStrips(video)
        const { config, competitions } = buildTournamentConfig(state())
        variants[label] = { strips: config.strips_total, ...measureColoring(competitions, config) }
      }
      out[name] = variants
    }
    emit('S2B', out)
  })

  it('S3: the ten templates down the app path, two strip columns', () => {
    const out: Record<string, unknown> = {}
    for (const name of Object.keys(TEMPLATES)) {
      out[name] = {
        suggested: runTemplate(name, 'suggest', null, true),
        '80/12': runTemplate(name, 80, 12, true),
        // Same two, with dayConfigs left empty as the untouched initial state
        // has them, to show whether populating them changes the answer.
        suggested_noDayConfigs: runTemplate(name, 'suggest', null, false),
        '80/12_noDayConfigs': runTemplate(name, 80, 12, false),
        // Supplementary: the same two with the tournament type the template's
        // name implies. Not the app path — applyTemplate never sets the type.
        suggested_typed: runTemplate(name, 'suggest', null, true, impliedType(name)),
        '80/12_typed': runTemplate(name, 80, 12, true, impliedType(name)),
      }
    }
    emit('S3', out)
  })

  it('S4: crossoverPenalty for the five pairs T017 pins', () => {
    const comp = (id: string, category: Category) => makeCompetition({
      id, category, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL,
    })
    const pairs: [string, Category, Category][] = [
      ['Y8<->Y10', Category.Y8, Category.Y10],
      ['Y8<->Y12', Category.Y8, Category.Y12],
      ['DIV1<->CADET', Category.DIV1, Category.CADET],
      ['DIV1<->DIV2', Category.DIV1, Category.DIV2],
      ['DIV1<->DIV3', Category.DIV1, Category.DIV3],
    ]
    const out: Record<string, unknown> = {}
    for (const [label, c1, c2] of pairs) {
      const forward = crossoverPenalty(comp('a', c1), comp('b', c2))
      const reverse = crossoverPenalty(comp('a', c2), comp('b', c1))
      out[label] = { forward, reverse, symmetric: forward === reverse }
    }
    emit('S4', out)
  })
})
```

## Appendix B — the coverage run behind §2

Two runs, each restricted to one probe test by name so the counts are
attributable.

```
# B1–B8 only
pnpm vitest run tmp/baseline-probe.test.ts -t "digest figures" \
  --coverage --coverage.reporter=json --coverage.reportsDirectory=tmp/cov

# the ten templates only
pnpm vitest run tmp/baseline-probe.test.ts -t "templates at 3 days" \
  --coverage --coverage.reporter=json --coverage.reportsDirectory=tmp/cov2
```

Statement execution counts for `src/engine/dayColoring.ts`, read out of
`coverage-final.json` by matching each entry of `statementMap` to its line:

| Line range | What it is | B1–B8 run | templates run |
|---|---|---|---|
| 505 | the `validColors.length > 0` branch point — once per vertex colored | 896 | 1032 |
| 507, 509 | `findRelaxableEdges`, entered on every fallback | **0** | 72 |
| 511–520 | the relaxed re-block, entered only when `relaxable.size > 0` | **0** | 48 |
| 522–532 | relaxed branch, a valid color found | **0** | 48 |
| 534–544 | least-bad, with relaxable edges | **0** | **0** |
| 546–556 | least-bad, no relaxable edges | **0** | 24 |
| 559–561 | `relaxations.set(id, 3)` | **0** | 48 |

The two branch-point totals check out against the work each run did: B1–B8's
896 is 209 competitions coloured inside `scheduleAll` (all but B4's 30, which
aborts at the feasibility gate) plus 239 coloured by the probe's own direct
call, each × 2 phases. The templates' 1032 is 258 competitions × 2 strip
columns × 2 phases.

The B1–B8 column is the answer to §2: the whole fallback is dead code on the
drift ledger, in both phases.

---

## Appendix C — the T006 re-measure probe

Written to `tmp/t006-remeasure-probe.test.ts`, run with
`pnpm --silent vitest run tmp/t006-remeasure-probe.test.ts`, and deleted. It
reads `src/` and never writes to it, and reuses Appendix A's `runTemplate`
function unchanged except for dropping the `tournamentType` parameter and the
`noDayConfigs`/`typed` supplementary variants, which §3's after-R1 table does
not need.

```ts
/**
 * TEMPORARY probe for 010 T006. Deleted after measurement. Re-runs exactly
 * the §3 method from baseline.md Appendix A (`runTemplate`), unchanged, after
 * R1's deletion of `indiv-team-same-day` in commit 5a3a1a6826.
 */
import { describe, it } from 'vitest'
import { scheduleAll } from '../src/engine/scheduler.ts'
import { validateConfig } from '../src/engine/validation.ts'
import { BottleneckSeverity, ValidationMode } from '../src/engine/types.ts'
import type { Bottleneck, Competition, TournamentConfig } from '../src/engine/types.ts'
import { TEMPLATES } from '../src/engine/catalogue.ts'
import { useStore } from '../src/store/store.ts'
import { buildTournamentConfig } from '../src/store/buildConfig.ts'

function warnCountsByCause(bottlenecks: Bottleneck[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const b of bottlenecks) {
    if (b.severity !== BottleneckSeverity.WARN) continue
    counts[b.cause] = (counts[b.cause] ?? 0) + 1
  }
  return counts
}

function errorRules(competitions: Competition[], config: TournamentConfig) {
  const findings = validateConfig(config, competitions, ValidationMode.BINDING)
  const errors = findings.filter(f => f.severity === BottleneckSeverity.ERROR)
  const byRule: Record<string, number> = {}
  for (const e of errors) byRule[e.rule] = (byRule[e.rule] ?? 0) + 1
  return {
    errorRuleCounts: byRule,
    firstErrorMessage: errors.length > 0 ? errors[0].message : null,
    warnRuleCounts: findings
      .filter(f => f.severity === BottleneckSeverity.WARN)
      .reduce<Record<string, number>>((acc, f) => {
        acc[f.rule] = (acc[f.rule] ?? 0) + 1
        return acc
      }, {}),
  }
}

/** Applies one template through the store's own actions, then builds the engine config. */
function runTemplate(name: string, strips: 'suggest' | number, videoStrips: number | null) {
  useStore.setState(useStore.getInitialState(), true)
  const state = () => useStore.getState()
  state().setDays(state().days_available) // populates dayConfigs at the default 3
  state().applyTemplate(name)
  if (strips === 'suggest') state().suggestStrips()
  else state().setStrips(strips)
  state().setVideoStrips(videoStrips)

  const { config, competitions } = buildTournamentConfig(state())
  const { schedule, bottlenecks } = scheduleAll(competitions, config)
  const placedIds = Object.entries(schedule)
    .filter(([, r]) => r.pool_start !== null).map(([id]) => id)

  return {
    days: config.days_available,
    strips: config.strips_total,
    videoStrips: config.video_strips_total,
    eventCount: competitions.length,
    placed: placedIds.length,
    ...errorRules(competitions, config),
    warnCountsByCause: warnCountsByCause(bottlenecks),
  }
}

function emit(label: string, value: unknown) {
  console.log(`\n<<<${label}>>>\n${JSON.stringify(value, null, 1)}\n<<<END ${label}>>>`)
}

describe('T006 re-measure probe', () => {
  it('S3 after R1: the ten templates down the app path, two strip columns', () => {
    const out: Record<string, unknown> = {}
    for (const name of Object.keys(TEMPLATES)) {
      out[name] = {
        suggested: runTemplate(name, 'suggest', null),
        '80/12': runTemplate(name, 80, 12),
      }
    }
    emit('S3_AFTER_R1', out)
  })
})
```
