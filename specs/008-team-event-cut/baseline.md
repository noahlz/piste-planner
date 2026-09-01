# Baseline: Team-Event Cut Default (pre-change)

**Feature**: 008-team-event-cut | **Captured**: 2026-08-31, before any source
file under `src/`, `__tests__/`, or `scripts/` is edited.

`git rev-parse main`: `e56a491acb525d51076abbcb74357aebfd2e6595`
`git rev-parse HEAD`: `2734005e6edabf6ace374674a1add8bca91d2e49`

(HEAD is one commit ahead of `main` — `008 planning: spec, plan, research,
contract, tasks`, the planning artifacts this feature's own directory holds.
No implementation commit has landed yet.)

## B1–B8: app-path placed vs. drift ledger

Measured via `runAppPath` (`__tests__/helpers/appPath.ts`): `applyPreset(id)`
→ `runScheduleAll()` → `Object.keys(store.placements).length`. The ledger
`scheduledCount` column is not re-derived here — it is copied verbatim from
`LEDGER_SCHEDULED_COUNTS` in `__tests__/store/appPathParity.test.ts:33-35`,
which the suite itself pins against.

| Scenario | Selected | App-path placed | Ledger `scheduledCount` | Match? |
|---|---:|---:|---:|---|
| B1 | 24 | 24 | 24 | match |
| B2 | 24 | **0** | 24 | **mismatch — 24 short** |
| B3 | 24 | 24 | 24 | match |
| B4 | 30 | 16 | 0 | mismatch (pre-existing FR-004a exception, not this feature's) |
| B5 | 12 | 12 | 12 | match |
| B6 | 54 | 43 | 44 | mismatch (pre-existing FR-004a exception, 1 short, not this feature's) |
| B7 | 18 | 18 | 18 | match |
| B8 | 53 | **0** | 52 | **mismatch — 52 short** |

Every number here equals `appPathParity.test.ts`'s current
`PINNED_APP_PATH_COUNTS` (`B1:24, B2:0, B3:24, B4:16, B5:12, B6:43, B7:18,
B8:0`) exactly — the suite is green on `main` today. B4 and B6 are 006's
already-recorded, already-excepted defaults gap (`parity-exceptions.md`),
carried here unchanged and out of this feature's scope. **B2 and B8 are the
two this feature exists to close**, and both place exactly nothing.

## The ten templates

Sequence used, per template, from a freshly reset store:

```text
useStore.setState(useStore.getInitialState(), true)
useStore.getState().applyTemplate(name)          // store.ts:286 — applies TEMPLATE_FENCER_DEFAULTS[name]
useStore.getState().suggestStrips()              // store.ts:185-193 — the "Suggest" button's action
runScheduleAll()                                 // src/store/runActions.ts
placed = Object.keys(useStore.getState().placements).length
hasTeamEvent = TEMPLATES[name].some(id => findCompetition(id)?.event_type === EventType.TEAM)
```

| Template | Selected | Strips suggested | Placed | Has team event |
|---|---:|---:|---:|---|
| NAC Youth | 24 | 39 | 9 | no |
| **NAC Cadet/Junior** | 24 | 39 | **0** | **yes** |
| **NAC Div1/Junior** | 24 | 45 | **0** | **yes** |
| **NAC Vet/Div1/Junior** | 66 | 45 | **0** | **yes** |
| ROC Div1A/Vet | 12 | 15 | 11 | no |
| ROC Div1A/Div2/Vet | 18 | 15 | 12 | no |
| ROC Mega | 42 | 20 | **0** | no |
| RYC Weekend | 18 | 20 | 8 | no |
| RJCC Weekend | 12 | 19 | 5 | no |
| **Junior Olympics** | 18 | 39 | **0** | **yes** |

The four team-bearing templates (`NAC Cadet/Junior`, `NAC Div1/Junior`,
`NAC Vet/Div1/Junior`, `Junior Olympics`) are exactly the four spec.md names
as this feature's targets, and all four place 0 — consistent with the
defect.

**Unanticipated: a fifth template, `ROC Mega`, also places 0 today, and it
contains no team event.** Isolated by re-running `validateConfig` in BINDING
mode against `ROC Mega`'s own `buildTournamentConfig` output:

```
RESOURCE_INSUFFICIENT: 1071 strip-hours needed over 42 events; 840 available
(3d × 20s × 14h). Shortfall 231 (~27%). Add 1 more day(s) OR 6 more strip(s).
```

This is the same "one BINDING error empties the whole tournament"
architecture the spec describes for the team-cut defect
(`concurrentScheduler.ts:186-204`), but the trigger here is a strip-hour
capacity shortfall from `suggestStrips()`'s recommendation (20 strips for 42
events), not `cut-on-team`. It is unrelated to this feature's fix and outside
its scope (spec.md's FR-001–FR-009 are all cut-default scoped); fixing it
would touch strip-count suggestion or capacity estimation, not
`defaultConfigForId`. Recorded here as a measured fact, not something this
feature is expected to move — if `ROC Mega`'s placed count is still 0 after
T005, that is expected and correct, not a regression.

**Also worth noting**: the comment above `'NAC Vet/Div1/Junior'` in
`src/engine/catalogue.ts:217` says "3 categories × 3 weapons × 2 genders ×
(IND + TEAM) = 36", but the measured selected count is 66. Veteran individual
events expand to 6 age groups (`ids()`, `catalogue.ts:167-186`), which the
comment's arithmetic does not account for. `src/engine/` is out of this
feature's scope (tasks.md's standing rule), so this is recorded, not
corrected.

## The defect, in numbers

**Two of the eight reference tournaments (B2, B8) and five of the ten
shipped templates place zero events today.** Of those five templates, four
contain team events (`NAC Cadet/Junior`, `NAC Div1/Junior`,
`NAC Vet/Div1/Junior`, `Junior Olympics`) and fail for the `cut-on-team`
reason this feature fixes; the fifth (`ROC Mega`) contains none and fails for
a strip-capacity shortfall this feature does not touch. B2 and B8 are
themselves the two reference tournaments containing team events (six Cadet
team events and five Div1 team events respectively) — every reference
tournament and every template that contains a team event places nothing
today.

## Suite total

```
Test Files  55 passed (55)
     Tests  1274 passed (1274)
```

Matches `tasks.md`'s and `plan.md`'s expected 1274 passed / 55 files exactly.

## Commands run to produce every number above

```bash
git rev-parse main
git rev-parse HEAD

# B1-B8 app-path placed/selected, and the ten templates' selected/strips/placed/
# hasTeamEvent, all measured in one scratch vitest file,
# __tests__/tmp-baseline-008.test.ts (deleted after this run, never committed):
#
#   for each id in B1..B8: runAppPath(id) -> { selectedCount, placedCount }
#
#   for each name in TEMPLATES:
#     useStore.setState(useStore.getInitialState(), true)
#     useStore.getState().applyTemplate(name)
#     useStore.getState().suggestStrips()
#     selected = Object.keys(selectedCompetitions).length
#     stripsSuggested = strips_total
#     runScheduleAll()
#     placed = Object.keys(placements).length
#     hasTeamEvent = TEMPLATES[name].some(id => findCompetition(id)?.event_type === EventType.TEAM)
#
#   for ROC Mega only (placed 0, no team event — isolating the cause):
#     { config, competitions } = buildTournamentConfig(store.getState())
#     errors = validateConfig(config, competitions, ValidationMode.BINDING).filter(e => e.severity === 'ERROR')
#
mkdir -p ./tmp
timeout 120 pnpm --silent vitest run __tests__/tmp-baseline-008.test.ts > ./tmp/baseline.log 2>&1

# scratch file deleted, confirmed absent from git status, then the suite total:
rm -f __tests__/tmp-baseline-008.test.ts
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1

# confirm no source file was touched to produce this baseline
git status --short
```

## Raw output from the measurement run

```
SCENARIO	selected	appPlaced	ledgerScheduledCount
B1	24	24	24
B2	24	0	24
B3	24	24	24
B4	30	16	0
B5	12	12	12
B6	54	43	44
B7	18	18	18
B8	53	0	52

TEMPLATE	selected	stripsSuggested	placed	hasTeamEvent
NAC Youth	24	39	9	false
NAC Cadet/Junior	24	39	0	true
NAC Div1/Junior	24	45	0	true
NAC Vet/Div1/Junior	66	45	0	true
ROC Div1A/Vet	12	15	11	false
ROC Div1A/Div2/Vet	18	15	12	false
ROC Mega	42	20	0	false
  ROC Mega (no team events) placed 0 — BINDING errors: ["RESOURCE_INSUFFICIENT: 1071 strip-hours needed over 42 events; 840 available (3d × 20s × 14h). Shortfall 231 (~27%). Add 1 more day(s) OR 6 more strip(s)."]
RYC Weekend	18	20	8	false
RJCC Weekend	12	19	5	false
Junior Olympics	18	39	0	true
```
