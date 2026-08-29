# Research: P2 Derived State

Decisions resolved before design. Code references are to the state of `main`
at d7f44c410b.

## D1: Block geometry is derivable – no scheduler state needs storing

**Decision**: A new pure module `src/engine/derive.ts` computes one event's
block geometry (pool block, DE block or staged DE segments, flight A/B splits)
from `(placement, competition, config)` using only existing math:
`computePoolStructure`, `weightedPoolDuration` (pools.ts), `computeBracketSize`,
`dePhasesForBracket`, `deBlockDurations`, `calculateDeDuration` (de.ts).

**Rationale**: The two facts that make this safe were verified in code:
- `use_flighting` is input-derived, not a scheduler choice –
  `concurrentScheduler.ts:306` sets it from `comp.flighted ||
  comp.flighting_group_id !== null`, both of which are competition inputs.
- Staged-DE segmentation is a function of `de_mode`, bracket size, and the
  duration tables – all config.

So `(day, start_time, strip_count)` plus competition plus config determines
every drawn block deterministically, exactly as design §State model claims.

**Alternatives considered**: Storing `ScheduleResult` alongside placements
(rejected – reintroduces the derived-state-as-truth problem this phase
exists to kill). Extending `Placement` with per-phase geometry (rejected –
design §State model forbids storing derived geometry).

## D2: Auto-schedule writes placements; scheduler diagnostics become derived

**Decision**: `runScheduleAll` extracts a `Placement` per scheduled event from
`scheduleAll`'s output (`assigned_day`, pool start, strip counts) and writes
only those to the store with `source: 'auto'`. `scheduleResults`,
`bottlenecks`, and `refRequirementsByDay` leave the store. Components read
through memoized selectors in a new `src/store/derived.ts`: the schedule table
view derives from placements via D1, analysis/validation findings derive from
current inputs. The `AnalysisSlice`'s result fields
(`validationErrors`, `warnings`, `suggestions`) go the same way – flighting
suggestion accept/reject state stays, because it is user intent.

**Rationale**: 9ms full-schedule cost (design §Motivation) makes
derive-on-read affordable. Anything cached in state can go stale – the phase's
goal is to make staleness unrepresentable, so nothing derived is state.

**Alternatives considered**: Recompute-on-write into the same slices
(rejected – keeps derived data in state, staleness merely unlikely instead of
impossible). Web-worker recompute (rejected – measured cost is 3 orders of
magnitude under any budget that would justify one).

## D3: Validation split – rule kind on the rule, severity from the consumer

**Decision**: Each check in `validation.ts` is tagged with a kind:
`structural` (fencer bounds, days outside 1–14, strips below 1, undefined
duration-table entries – anything that leaves nothing to draw) or `policy`
(same-population, team-requires-individual, cut-on-team, strip minimum
shortfalls, feasibility, regional cut overrides, day count outside 2–4).
`validateConfig` gains a mode argument (`binding` | `advisory`). Severity is
computed: structural → ERROR always; policy → ERROR when binding, WARN when
advisory. The existing hard-coded `err()`/`warn()` severity choices are
replaced by the kind+mode mapping. The days check at `validation.ts:379`
becomes: structural bounds 1–14 (clarification 2026-08-28), policy warning
outside 2–4.

**Rationale**: Design §Validation and decision 5 – one rule set, two
consumers. Tagging the rule rather than duplicating rule lists per mode is
what makes SC-003 ("zero rules duplicated") checkable.

**Alternatives considered**: Two rule registries filtered per mode (rejected –
two homes for one rule). Post-hoc severity rewrite of ERROR findings in
advisory mode (rejected – existing WARNs like the regional-cut notice would
be indistinguishable from downgraded ERRORs, and per-rule intent is lost).

### Correction (2026-08-29): three rule kinds, not two

**Decision**: The flat structural/policy split above is replaced by a third
kind, `notice` – WARN in both `binding` and `advisory` modes, never escalates,
never blocks. `RuleKind = 'structural' | 'policy' | 'notice'`. Reclassified
from `policy` to `notice`: regional cut overrides, the video dead-config hint
(REQUIRED + SINGLE_STAGE, no effect), `de_round_of_16_strips` over the DE
strip cap, and `days_available` outside 2–4. Everything else D3 named as
`policy` keeps that kind (ERROR binding / WARN advisory). `structural` is
unchanged (ERROR both modes, days bounds 1–14).

**Rationale**: T015's failing-test drift probe ran `validateConfig` over the
B1–B8 drift-ledger fixtures under the flat model and found the regional-cut
override rule (`validation.ts:213`) firing on B4 (12×), B5 (12×), B6 (18×),
and the video dead-config rule (`validation.ts:172`) firing on B2 (6×) and B8
(5×). Under `policy` these escalate to ERROR in binding mode, and
`concurrentScheduler.ts:195` aborts scheduling on any ERROR – so binding-mode
validation would newly collapse B2, B5, B6, and B8 (D7's `SCHEDULED_FLOORS`
of 24, 12, 43, 50 – all currently nonzero) and inflate B4's dedicated pinned
test (0 scheduled, 1 validation error) by 12 more errors it does not have
today. Constitution III treats that as a halting drop, not a modeling
nuance.
Separately, `days_available` outside 2–4 as `policy`→ERROR-binding
contradicts spec acceptance scenario 3 (`spec.md:106-108`): a 5-day
tournament must warn while remaining schedulable, not abort. The DE
strip-cap rule (`de_round_of_16_strips` over cap) fires zero times across
B1–B8 so it carries no drift risk, but it is the same "soft, user may have
intentionally overridden" class as the other three – the code's own comment
at `validation.ts:184` already frames it that way – so it moves with them for
consistency rather than staying `policy` on a technicality of the current
fixture set.

Net effect: because these four rules were WARN-only in the codebase before
this feature (never ERROR, in any mode, today), `notice` reproduces exactly
that – binding-mode severities across the whole rule set come out
byte-identical to `main` at d7f44c410b. Advisory mode is the only mode that
changes shape, and only by gaining `kind` tags on findings that were already
WARN.

**Alternatives considered**: Keep the flat model and re-tune
`SCHEDULED_FLOORS` downward for the newly-blocked scenarios (rejected –
Constitution III requires the cause of a drop to be identified and recorded,
not absorbed into a new floor; here the cause is a modeling gap, not a real
regression). Keep the flat model and special-case these four rules to WARN
under `binding` at the call site (rejected – reintroduces the "post-hoc
severity rewrite" alternative D3 already rejected, for the same reason: an
intentional-WARN rule becomes indistinguishable from a downgraded ERROR).

## D4: Finding identity – rule id plus canonical subject key

**Decision**: `ValidationError` grows into a finding with `rule` (stable
kebab-case rule id), `kind`, and `subjects` (sorted competition ids, or a
config field name for global rules). Identity is the string
`rule + ':' + subjects.join('+')` – no magnitudes, no message text
(clarification 2026-08-28). Dismissals are a store map
`Record<findingId, true>` applying to advisory WARNs only, sticky until the
organizer clears them, serialized with the tournament.

**Rationale**: The current `{field, message, severity}` shape
(`types.ts:362`) embeds computed numbers in `message`, so message equality
cannot be identity. Rule+subjects is the clarified semantic: magnitude changes
and rule flicker do not resurrect a dismissal.

**Alternatives considered**: Hash of the full message (rejected – any
recompute that changes a number resurrects the finding). Sequential ids
(rejected – not stable across recomputes at all).

## D5: Serialization schema v2 – placements and dismissals ride the URL

**Decision**: `schemaVersion` bumps to 2. Added: `placements` (map keyed by
event id) and `dismissedFindings` (array of finding ids). Changed:
`days_available` accepted range widens from 2–4 (`serialization.ts:93`) to
1–14, matching D3's structural bounds. Version 1 payloads are rejected, not
migrated. Unknown event ids in `placements` or unknown finding ids in
`dismissedFindings` are dropped leniently on load with a reported notice.

**Rationale**: Spec FR-003/FR-010 and the no-backwards-compatibility policy
(product unreleased). The 2–4 check in the serializer would otherwise
contradict the widened validation range.

**Alternatives considered**: Accepting v1 with defaults (rejected – explicit
policy against back-compat stories). Serializing dismissals as a map with
timestamps (rejected – nothing consumes a timestamp, and each fact should
earn its bytes).

## D6: Presets move – data to `src/data`, builders stay with the tests

**Decision**: The `SCENARIOS` fixture table, `SCENARIO_IDS`, and the
`ScenarioFixture` type move from `__tests__/helpers/scenarios.ts` to
`src/data/tournaments.ts`, extended with the display-name field design
§Presets lists (`label` and `source` already exist). `scenarios.ts` keeps
`buildCompetitions` and `tournamentConfig` (they depend on test factories) and
re-exports the data from `src/data` so both test suites keep their import
surface.

**Rationale**: Design §Presets – app and tests must consume one copy. The
builders translate rosters into engine `Competition[]` using test factories;
the production loading path (preset picker, boot-with-preset) is P3's and will
build its own store-level loader against the same data.

**Alternatives considered**: Moving builders into `src/data` too (rejected –
they import `__tests__/helpers/factories.ts`, and shipping test factories in
app code inverts the dependency direction). Duplicating rosters (rejected –
the drift this design exists to prevent).

## D7: Integration floors re-baselined to measured counts

**Decision**: The `toBeGreaterThanOrEqual` floors in
`__tests__/engine/integration.test.ts` (B1 currently `>= 14` at line 175)
are raised to the counts each scenario actually schedules, measured at task
time on the feature branch before any engine change. The drift ledger's
`SCHEDULED_FLOORS` (B1: 24, B2: 24, B3: 24, B4: 0, B5: 12, B6: 43, B7: 18,
B8: 50) is the expected reference. B4 keeps its dedicated pinned test
(0 scheduled, 1 validation error – Ruling 11) rather than a generic floor.

**Rationale**: Backlog §Calibration debt and design §Testing – `>= 14`
against an actual 24 is near-vacuous. Measuring on-branch before engine
changes gives the re-tune (D8) an honest baseline to be judged against.

**Alternatives considered**: Floors with slack (e.g. measured − 2) (rejected
– slack is exactly the vacuousness being removed; deliberate floor changes
are cheap to make consciously). Snapshot-only (rejected – defeated by
`vitest -u`, as the ledger header notes).

## D8: `CAPACITY_TARGET_FILL` re-tuned by measured sweep, not chosen here

**Decision**: The re-tune raises `CAPACITY_TARGET_FILL`
(`dayColoring.ts:77`, currently 0.3) by running the B1–B8 suite and drift
ledger across a candidate sweep (e.g. 0.4 through 0.8 in 0.1 steps) and
selecting the highest value at which **no scenario schedules fewer events**
than the D7 baseline and no scenario's ERROR count rises. Before/after
scheduled counts for all eight scenarios are recorded in the task's commit
message. If every candidate above 0.3 drops a scenario, the finding is
recorded and the constant stays – "no change" is an acceptable outcome,
silently absorbing a drop is not.

**Rationale**: Backlog §Calibration debt – the 0.3 rationale (serial-scheduler
underutilization) died with the serial scheduler. Constitution III makes the
acceptance bar behavioral, so the number must come from measurement, not this
document.

**Alternatives considered**: Picking a value analytically from
strip-hour math (rejected – the constant feeds a greedy day-count heuristic
at `dayColoring.ts:619` whose interaction with penalty minimization is
exactly what the scenarios measure). Deleting the derating entirely (fill =
1.0) (rejected as a starting assumption – it may fall out of the sweep, but
only the sweep can say so).
