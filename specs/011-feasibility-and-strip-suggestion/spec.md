# Feature Specification: The strip count the app suggests is the strip count that works

**Feature Branch**: `011-feasibility-and-strip-suggestion`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Plan the demotion of feasibility-strip-hours from
a blocking error to a warning (R5), plus the strip-suggestion defect underneath
it (L5). The evidence is in specs/010-wave-1-reconciliation/baseline.md §3 —
four templates still render an empty board at the strip count the app itself
recommends, because that recommendation sizes for the largest event alone and
ignores everything else running the same day."

## Context

[`docs/design/methodology-reconciliation.md`](../../docs/design/methodology-reconciliation.md)
§1.3 R5 and §2.1 L5 name two defects that combine into one user-facing failure:
**the app recommends a strip count, and then refuses to schedule at it.**

`specs/010-wave-1-reconciliation/baseline.md` §3 measures the failure across all
ten templates through the app's own configuration path. Five of the ten place
zero events at the count the **Suggest** button produces:

| Template | Events | Suggested strips | Placed @ suggested | Placed @ 80/12 |
|---|---:|---:|---:|---:|
| NAC Youth | 24 | 39 | **0** | 22 |
| NAC Cadet/Junior | 24 | 39 | **0** | 24 |
| NAC Vet/Div1/Junior | 66 | 45 | **0** | 45 |
| ROC Mega | 42 | 20 | **0** | 42 |
| Junior Olympics | 18 | 39 | **0** | 18 |

Every one of the five is emptied by a single finding, `feasibility-strip-hours`,
and every one of the five schedules a substantial board when given more strips.
The two defects are the two halves of that sentence:

- **R5** — `feasibility-strip-hours` is a blocking ERROR. It is a worst-case
  aggregate estimate with a 15% slack band, computed before any scheduling runs,
  and when it trips the whole tournament is discarded and the board renders
  empty. The concurrent scheduler routinely places more than the estimate
  predicts, so the refusal is frequently wrong and is never checked against a
  real attempt.
- **L5** — the suggestion is "one strip per pool of the largest event." One
  strip per pool is correct and is not in question: it is the physical
  invariant the scheduler itself uses (`concurrentScheduler.ts:526` sets
  `desired_strip_count` to an event's pool count). The defect is **largest**
  where it should be **sum**. A day running five events needs strips for all
  five events' pools at once (`concurrentScheduler.ts:535` — "a 3-5 event day
  has to share the strip pool concurrently"), and the current rule sizes the
  venue for one of them.

Double-stripping — running two pools on one strip — is not a scheduling input
and never appears in this feature. It happens organically on the day and is
absorbed by the averaged pool durations. No rule here trades strips for time.

### Three implementations of one rule

The suggestion exists three times, all with the same max-over-events defect:

| Site | Callers | Notes |
|---|---|---|
| `src/store/stripSuggestion.ts:9` `suggestStrips` | the **Suggest** button, via `store.ts:229` | the live user-facing path |
| `src/engine/analysis.ts:22` `suggestStripCount` | none | dead; §2.1 L5 records it |
| `src/engine/stripBudget.ts:35` `recommendStripCount` | `concurrentScheduler.ts:1450` | live; produces the post-schedule INFO "Strips: need N, have M". Divides by `max_pool_strip_pct` so the pool phase's share of the venue is respected — a term the other two omit |

A user can therefore be told two different strip numbers by the same app.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An oversubscribed tournament returns a partial board instead of a blank one (Priority: P1)

An organizer configures a tournament whose aggregate strip-hour demand exceeds
the venue's supply by more than the 15% slack band. Today the board renders
empty with one red error and no information about which events were the problem.
After this story the scheduler runs, the board shows every event that fits, the
events that did not fit are visible as unplaced, and the shortfall message
survives unchanged as a warning.

**Why this priority**: it is the whole of R5, it is independently shippable, and
it is the half that moves the drift ledger. Landing it alone already restores
five templates from empty to non-empty at their suggested count. Sequencing it
first means its ledger movement is attributable to it and to nothing else.

**Independent Test**: run the ten templates through the app's configuration path
at their suggested strip counts and count placed events. The five templates at
zero must place events. B1–B8 must place at least their floors.

**Acceptance Scenarios**:

1. **Given** any configuration whose aggregate strip-hour demand trips the
   feasibility band, **When** `validateConfig` runs in either validation mode,
   **Then** the finding is produced with severity WARN, with its rule id and its
   message text unchanged.
2. **Given** that same configuration, **When** the schedule runs, **Then** the
   returned schedule is non-empty and no ERROR carries the rule id
   `feasibility-strip-hours` or `feasibility-video-strip-hours`.
3. **Given** a configuration that trips the video feasibility band, **When** the
   schedule runs, **Then** the same holds — both feasibility rules demote
   together, so no aggregate estimate can empty a board.
4. **Given** a configuration that trips feasibility and would benefit from more
   strips, **When** the schedule completes, **Then** the post-schedule "Strips:
   need N, have M" recommendation is still emitted. It is gated today on the
   presence of an ERROR carrying `RESOURCE_EXHAUSTION`
   (`concurrentScheduler.ts:1444`), and the demotion must not silence the
   actionable half of the message it is paired with.
5. **Given** the eight B1–B8 reference tournaments, **When** the drift ledger
   runs, **Then** no scenario's scheduled-event count falls below its floor.
   B4's floor is raised to its new measured count in the same commit that moves
   it.

---

### User Story 2 - The Suggest button produces a strip count the tournament can actually run on (Priority: P2)

An organizer picks a template, presses **Suggest**, and gets a strip count sized
for the busiest day's concurrent pool demand rather than for its single largest
event. Scheduling at that count produces a board with substantially more events
placed than scheduling at today's suggestion does.

**Why this priority**: it is the cause under US1's symptom. US1 stops the app
refusing at its own recommendation; US2 makes the recommendation worth taking.
It is second because it depends on nothing in US1 and moves nothing US1 moves —
the two are separable, and running them in this order keeps each drift review
clean.

**Independent Test**: the ten-template harness, comparing the suggested number
itself and the placed count at that number, before and after.

**Acceptance Scenarios**:

1. **Given** a set of competitions and a day count, **When** the suggestion is
   computed, **Then** it reflects the summed pool demand of the events sharing
   the busiest day, never the demand of the largest single event alone.
2. **Given** a single-event tournament, **When** the suggestion is computed,
   **Then** it is that event's pool count adjusted for the pool phase's share of
   the venue — the current behavior for the degenerate case is preserved.
3. **Given** any set of competitions, **When** the suggestion is computed twice
   with identical inputs, **Then** the two answers are identical. The rule is a
   pure function of the competitions, the day count and the pool strip
   percentage, and in particular is **not** a function of the strip count it is
   being asked to replace.
4. **Given** the **Suggest** button in the running app on a template that places
   zero events today, **When** it is pressed and the schedule runs, **Then** the
   board is non-empty.
5. **Given** the app after this story, **When** a strip count is recommended
   anywhere in the product, **Then** exactly one rule produced it. The three
   implementations named in §Context collapse to one.

---

### Edge Cases

- **No competitions, or every competition below the minimum fencer count.** The
  suggestion has nothing to size for and must say so rather than returning zero,
  which the **Suggest** button would write into the strip field as a valid
  configuration.
- **More days than events.** Some day buckets are empty; the busiest bucket is
  still well defined and the suggestion is the largest single event's demand.
- **One day.** Every event shares it, so the suggestion is the sum over all
  events. This is a large number and it is the correct one — it is what a
  one-day tournament of that size genuinely requires.
- **A genuinely impossible configuration under US1.** The run now costs a full
  scheduling pass and returns a board with many unplaced events and many
  warnings, where it previously returned one clean error. This is the accepted
  cost recorded in §1.3 R5, not a defect.
- **A finding that no longer blocks but still names a real shortfall.** The
  demoted warning must remain visible in the scorecard, not be lost among the
  warnings a busy board already produces.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `feasibility-strip-hours` MUST be produced with severity WARN in
  every validation mode, with its rule id, field and message text unchanged.
- **FR-002**: `feasibility-video-strip-hours` MUST demote on the same terms.
- **FR-003**: Neither feasibility finding MAY cause the scheduler to return an
  empty schedule. A configuration whose only findings are feasibility findings
  MUST be scheduled.
- **FR-004**: The post-schedule strip recommendation MUST continue to be emitted
  for configurations that trip feasibility, notwithstanding that feasibility no
  longer contributes an ERROR to the condition that gates it.
- **FR-005**: The strip suggestion MUST size for the summed pool demand of the
  events sharing the busiest day, computed by distributing the competitions
  across `days_available` by descending pool demand and taking the fullest
  resulting group.
- **FR-006**: The strip suggestion MUST allocate one strip per pool throughout.
  No rule may reduce the strip count by extending a pool round's duration.
- **FR-007**: The strip suggestion MUST account for the pool phase's share of
  the venue (`max_pool_strip_pct`), so that scheduling at the suggested count
  can run the busiest day's pools in one flight.
- **FR-008**: Exactly one implementation of the strip suggestion rule MUST
  remain in the codebase, and it MUST live in `src/engine/` as a pure function.
  The store reaches it through `buildConfig`, per constitution I.
- **FR-009**: The suggestion MUST be a pure function of the competitions, the
  day count and the pool strip percentage. It MUST NOT depend on
  `strips_total`, on day assignment, or on any scheduling result.
- **FR-010**: The suggestion MUST report the absence of an answer distinguishably
  from the number zero when no competition can be sized.

### Key Entities

- **Feasibility finding** — an aggregate estimate over the whole competition
  set, comparing summed strip-hours against `days × strips × day length` with a
  15% slack band. After this feature it is advisory in every mode.
- **Pool demand** — an event's pool count, one strip each. The unit the
  suggestion sums.
- **Busiest day group** — the fullest of `days_available` groups after
  competitions are distributed by descending pool demand. Its total is the
  concurrent strip demand the venue must satisfy.

## Success Criteria *(mandatory)*

- **SC-001**: All five templates that place zero events at their suggested strip
  count (`NAC Youth`, `NAC Cadet/Junior`, `NAC Vet/Div1/Junior`, `ROC Mega`,
  `Junior Olympics`) place a non-zero count at their suggested strip count.
- **SC-002**: No template places fewer events after this feature than before it,
  at either the suggested count or at 80 strips / 12 video.
- **SC-003**: No B1–B8 scenario's scheduled-event count falls below its floor.
  B4 moves off zero and its floor moves with it.
- **SC-004**: No board is returned empty on account of an aggregate estimate.
  Every empty board after this feature is empty for a structural reason.
- **SC-005**: A live smoke step presses **Suggest** on a template that renders
  nothing today and measures a non-empty board in the running app.
- **SC-006**: One strip-suggestion rule exists. `grep` for the other two names
  returns nothing outside their tests' deletion.

## Out of Scope

- **Double-stripping in any form.** It is never a planned input. No toggle, no
  ratio, no strip-for-time trade appears in this feature. Recorded in
  `docs/design/backlog.md`.
- **Tuning the 15% feasibility slack band or the estimate that feeds it.** R5
  demotes the finding's severity and changes nothing about how it is computed.
  An estimate that is wrong in magnitude stays wrong in magnitude — it merely
  stops discarding tournaments.
- **The `DEADLINE_BREACH` shortfall.** Several templates place fewer events than
  they have without any error, on deadline warnings alone
  (`baseline.md` §3). That is a separate defect with a separate cause and this
  feature neither fixes nor measures it beyond recording the counts.
- **Video strip suggestion.** `resolveVideoStrips` picks a video count by
  tournament type. FR-002 demotes the video feasibility finding but no rule here
  recommends a video strip count.
- **Part 3 of the reconciliation.** The eight time-of-day penalty weights stay
  undecided and unaffected.
- **R4, R6, R8, R9 and the rest of Waves 2–4.** R5 is taken out of Wave 3's
  order by product-owner direction on 2026-09-05; nothing else moves with it.

## Assumptions

- **The estimate's pessimism is real, not incidental.** R5's premise is that the
  scheduler places more than `validateFeasibility` predicts. The five templates
  in §Context are the evidence: each is refused on the estimate and each
  schedules a substantial board when the refusal is removed by adding strips.
  US1's own measurement confirms it directly at the suggested counts.
- **Balanced distribution is an approximation, and an honest one.** The
  suggestion distributes events across days by pool demand, which is not what
  `dayColoring` will do — it optimises crossover, rest days and category
  ordering, not strip balance. The suggestion is a starting number the organizer
  adjusts, and buying it independence from the scheduler is worth the
  approximation. The alternative, bootstrapping from a real day assignment, was
  rejected: it would make the answer depend on the strip count it is replacing.
- **Raising B4 off zero is an improvement, not a regression.** B4 is pinned at 0
  scheduled with 1 error solely because feasibility empties it
  (`driftLedger.test.ts:206-222`). Any non-zero count is a strictly better
  answer, and the floor rises to match so a later regression cannot pass
  silently.

## Dependencies

- `010-wave-1-reconciliation` is merged into `main` at `ec3d3aee74`. This
  feature branches from there.
- No new package, no new engine module, no schema change.

## Tests that invert with this feature

Recorded here rather than discovered at merge, per the constitution's
§The merge is gated. Each becomes a task.

| Test | Today | After |
|---|---|---|
| `__tests__/engine/driftLedger.test.ts:213` | pins B4 at 0 scheduled and exactly 1 ERROR | pins B4's new measured count with no feasibility ERROR |
| `__tests__/engine/concurrentScheduler.test.ts:852` | asserts an aggregate shortfall "still empties the schedule" | asserts a non-empty board carrying the WARN |
| `__tests__/components/workbench/Scorecard.test.tsx:65` | B1 at 20 strips counts 11 ERROR / 17 WARN, one of the errors being feasibility | 10 ERROR / 18 WARN |
| `__tests__/engine/stripBudget.test.ts:44-67` | four `recommendStripCount` cases asserting the max-over-events rule | rewritten against the busiest-day rule |
| `src/store/__tests__/stripSuggestion.test.ts` | five cases against the store implementation | move to the engine's test file when the store file is deleted |
| `__tests__/engine/analysis.test.ts:411` | `suggestStripCount` cases against the dead engine copy | rewritten against the live rule |
