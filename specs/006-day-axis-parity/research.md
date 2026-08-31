# Research: Day-Axis Parity

**Feature**: 006-day-axis-parity | **Date**: 2026-08-31

Findings below were established by reading the code at `main` (`1040c9f7a3`) on
2026-08-31. Line references are to that commit. The originating record —
repro, isolation runs, and the count of 11 of 24 — is
[`docs/design/reassessment-2026-08-31.md` §2](../../docs/design/reassessment-2026-08-31.md)
and is not restated here.

## D1 — The mechanism is a shared strip pool, not a misbehaving heuristic

**Finding**: `createGlobalState` (`src/engine/resources.ts:57-64`) builds
`strip_allocations` as one flat interval list per strip. It carries **no day
dimension**. Two events on different days are kept off the same strip solely
because their day windows occupy disjoint stretches of the absolute minute axis.

When the store writes `[480, 1320)` as the window for *every* day, all days land
on the same 840 minutes. A four-day tournament then has one day's worth of strip
time in total, and roughly half its events cannot be placed. The 11-of-24 count
is a capacity result, not a heuristic misfire.

**Second symptom, same cause**: `computePostScheduleRefDemand`
(`src/engine/concurrentScheduler.ts:1227`) resolves an allocation's day with
`findDayForTime(config, w.start)`, which returns the *first* day whose window
contains the time. With coincident windows that is always day 0, so the app's
per-day referee peaks are all attributed to day 1. This is fixed by the same
change and should be checked as an outcome, not assumed.

**Rationale for recording this**: it sets the acceptance bar. A fix is correct
when the day windows are pairwise disjoint and ordered, and nothing weaker.

## D2 — Rules that compare days use day indices, never minutes

**Finding**: every "how far apart are these two days" rule reads integer day
indices, not elapsed time.

| Rule | Site | Quantity compared |
|---|---|---|
| Crossover same-population / day-gap penalty | `crossover.ts:195-199` | `Math.abs(proposedDay - sr.assigned_day)`, clamped at 3 |
| Individual/team ordering bonus | `crossover.ts:248` | `proposedDay - sr.assigned_day` |
| Individual/team ordering (coloring) | `dayColoring.ts:176-180` | `proposedDay - indDay` |
| Vet-combined sibling ordering | `dayColoring.ts:238-242` | `proposedDay - siblingDay` |
| Rest-day and proximity adjustments | `dayColoring.ts:285-286` | `Math.abs(c - neighborColor)`, adjacency only |
| Day sequencing | `daySequencing.ts` | within-day ordering only |

**Consequence**: changing the *spacing* between day windows from 840 to 1440
minutes cannot change any of these decisions. This satisfies the plan's
obligation under FR-006 by construction; the drift-ledger run and the parity run
are the confirmation, not the argument.

## D3 — The absolute axis is read in exactly three places

`dayStart` / `dayEnd` (`src/engine/types.ts:436-452`) are imported by
`concurrentScheduler.ts` and `resources.ts` and nowhere else. `findDayForTime`
has a single caller (`concurrentScheduler.ts:1227`).

The reads that matter:

1. **Phase seeding** — the first phase becomes READY at
   `max(dayStart(assigned_day), earliest_start)` (`concurrentScheduler.ts:616-623`,
   repeated for retries at `:816`).
2. **Day hard end** — `Math.min(dayEnd(day, config), competition.latest_end)`
   (`concurrentScheduler.ts:873`), which gates fit, defer, and the
   `SAME_DAY_VIOLATION` bottleneck.
3. **Strip-window probe** — `findAvailableStripsInWindow`'s day-end clamp
   (`resources.ts:246-251`).

**Both scheduler call sites pass `day` explicitly**
(`concurrentScheduler.ts:903` and `:915`), so the inference fallback at
`resources.ts:246-251` — `floor(startTime / DAY_LENGTH_MINS)` — is unreachable
from a real scheduling run and is exercised only by `resources.test.ts`. It is
nonetheless wrong under any non-compacted axis, and it only ever selects the
`STRIPS`-versus-`TIME` label on a miss.

**Decision**: leave the fallback's behavior alone but state its precondition in
the code and cover it with a test that fails if a caller ever drops the `day`
argument. Rewriting it is a change to engine behavior with no observable
benefit, which is exactly what constitution III asks us not to do casually.

**Alternative rejected**: deleting the fallback and making `day` required. It is
a wider engine signature change than this feature needs, and `resources.test.ts`
depends on the optional form.

## D4 — The conversion boundary is two functions wide

**Finding**: `deriveEventSchedule` (`src/engine/derive.ts:57-260`) computes every
block from `placement.start_time` and durations alone. It never calls
`dayStart`, `dayEnd`, or reads `config.dayConfigs`. So the entire derived path —
`store/derived.ts`, the canvas geometry, the schedule table, the tooltip, the
shared link — is **axis-agnostic** and already correct in clock time.

Consequently only two places need to know about the engine's axis:

- **Forward**: the config handed to `scheduleAll` must carry day windows on a
  disjoint, ordered axis.
- **Back**: the schedule `scheduleAll` returns must have its day offset removed
  before it becomes a `Placement` (`src/store/runActions.ts:29-36`).

**One exception to clean up**: `MatrixCanvas.dayHours`
(`src/components/canvas/MatrixCanvas.tsx:507-513`) reads `config.dayConfigs` —
an engine value — to draw a UI band. That is the one place a shifted config
would leak into the screen. It should read the store's `dayConfigs` instead,
which is the authoring home for those hours and is already in scope in that
component.

**Note**: `__tests__/store/buildConfig.test.ts` asserts nothing about
`dayConfigs` pass-through. The seam that produced this defect had no coverage at
all.

## D5 — The axis: calendar-day spacing at 1440 minutes

**Decision**: for the config handed to the scheduler, day *d* spans
`[d*1440 + day_start_time_d, d*1440 + day_end_time_d)`, and a returned time *t*
on day *d* converts back with `t - d*1440`.

**Rationale**:
- Windows are pairwise disjoint and strictly ordered for any per-day hours the
  UI can author (start and end both within a single day), which is the property
  D1 identifies as the acceptance bar.
- Per-day hours survive intact — the day's own start and end are carried, not
  normalized away.
- 1440 is the calendar day, so the reverse conversion is `t - day*1440` and the
  clock time round-trips exactly, with no dependence on day length.
- `1440` and the day boundaries `480`/`1320` are all multiples of `SLOT_MINS`
  (5), so `snapToSlot` behaves identically on either axis.

**Alternatives considered**:

| Option | Rejected because |
|---|---|
| Emit `dayConfigs: []` when all days share the same hours | Silently discards per-day hours the UI already offers, and preserves two divergent code paths — the exact condition that hid this defect. |
| Teach the engine per-day windows natively (compacted axis plus per-day lengths) | Cleaner long-term, but it is an engine change under the full constitution III treatment for no behavior gain today. The reassessment names it as the alternative; it stays available if D5 proves unsound. |
| Space days by the longest configured day rather than 1440 | Makes the reverse conversion depend on the day table, so a later edit to one day's hours silently re-interprets stored placements. |

## D6 — Risk: the `latest_end: 9999` sentinel becomes days-dependent

**Finding**: `buildConfig.ts:122` sets every competition's `latest_end` to
`9999`, and `concurrentScheduler.ts:873` caps the day at
`min(dayEnd(day), latest_end)`.

- Under the compacted axis the last minute of an 8-day tournament is 6720, so
  the sentinel never binds.
- Under 1440-spacing, day *d* ends at `d*1440 + 1320`, which passes 9999 at day
  7 — an 8-day tournament would have its last two days silently truncated.

The UI offers 2, 3, or 4 days today (`TournamentSetup.tsx:110-112`), so the last
day currently ends at 5640 and nothing binds. But a sentinel whose correctness
depends on the number of days is a trap of exactly the kind this feature exists
to remove.

**Decision**: make the "no constraint" case genuinely unconstrained rather than a
magic number, and cover it with a test at a day count beyond what the UI offers.

**Alternative rejected**: leaving the sentinel and adding a comment. The defect
being fixed here was a comment away from being noticed for three features.

## D7 — Parity exceptions are pinned, not closed

Resolved with the user on 2026-08-31 (spec Clarifications, FR-004a).

The app and the ledger also differ in two per-competition defaults: the ledger's
factory derives `de_mode` from the video policy and pre-allocates
`strips_allocated` (`__tests__/helpers/scenarios.ts:51-54`), while the store
sends `SINGLE_STAGE` and `0` (`buildConfig.ts:116`, `:129`). Those defaults are
004's US4.

The parity check therefore asserts a **pinned number per tournament**, equal to
the ledger's count wherever the paths agree, and — where they do not — the
app-path number recorded beside the ledger's count, the cause, and the feature
that closes it. An exception is admissible only for a per-competition default,
never for anything about the day axis.

## D8 — Flow: worktree

Per the constitution's Git Ownership table, this feature uses the **worktree**
flow on branch `006-day-axis-parity`. Implementation subagents commit to that
branch at the checkpoints `tasks.md` marks, and the before/after counts from the
drift and parity runs belong in those commit messages. The user lands the branch
with `git merge --no-ff --no-commit` completed by `commit-with-costs`.

Chosen over the root flow because the feature's value is its evidence: the
numbers measured at each step are the record, and worktree commits are where the
constitution puts them.
