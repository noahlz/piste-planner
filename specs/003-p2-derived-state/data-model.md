# Data Model: P2 Derived State

Shapes and rules for the entities this feature adds or changes. Field-level
meaning for placements is homed in design §State model – this file adds the
store/engine typing decisions, not a second copy of the semantics.

## Placement

Keyed by event (competition) id in a store map `placements:
Record<string, Placement>`.

| Field | Type | Notes |
|---|---|---|
| `day` | `number` | Day index, 0-based |
| `start_time` | `number` | Minutes from midnight, snapped to `SLOT_MINS` |
| `strip_count` | `number` | Strips the event draws |
| `strips` | `number[] \| null` | Explicit strip indices – null until unpacked to blocks (P4) |
| `source` | `PlacementSource` | `'auto' \| 'manual'` – `as const` object + derived union (constitution V) |
| `pinned` | `boolean` | Manual placement implies `true` unless unpinned |

Rules (from design §State model, enforced in store actions and derive):

- Never stores geometry. Blocks derive via `derive.ts` (research D1).
- `Auto-schedule all` replaces the whole map with `source: 'auto'`,
  `pinned: false` entries.
- Removing a competition removes its placement in the same action (spec edge
  case – no orphans).
- A placement whose `day` falls outside the current day range survives as
  intent and surfaces as a finding; derivation returns its blocks flagged
  out-of-range rather than throwing.

## Derived block geometry (never stored)

`derive.ts` output per event, computed from `(placement, competition,
config)`:

- Pool block: start, end, strip count, ref count.
- DE block(s): single block, or staged segments per `de_mode` and bracket
  phases, with flight A/B splits when `use_flighting` derives true.
- Purity contract: same inputs, same output, no store reads (constitution I).

## Finding (extends today's `ValidationError`, `types.ts:362`)

| Field | Type | Notes |
|---|---|---|
| `rule` | `string` | Stable kebab-case rule id, e.g. `same-population` |
| `kind` | `RuleKind` | `'structural' \| 'policy'` |
| `subjects` | `string[]` | Sorted competition ids, or `[field]` for global rules |
| `field` | `string` | Retained – existing UI groups by it |
| `message` | `string` | Human text, magnitudes allowed, excluded from identity |
| `severity` | `BottleneckSeverity` | Computed: structural → ERROR; policy → ERROR (binding) / WARN (advisory) |

Identity: `` `${rule}:${subjects.join('+')}` `` (research D4). Two findings
with equal identity in one recompute are a rule bug – the rule must widen its
subject key, not silently merge.

### Validation modes

`ValidationMode = 'binding' | 'advisory'` (`as const`). `validateConfig`
takes the mode; every rule is defined once. Day bounds: structural 1–14,
policy 2–4 (clarifications 2026-08-28).

## Dismissals

Store map `dismissedFindings: Record<string, true>` keyed by finding
identity. Applies to advisory WARN findings only – dismissing anything else
is rejected at the action level. Sticky: cleared only by an explicit
un-dismiss action, never by rule flicker (spec US3). Serialized (contract:
[serialization-v2](./contracts/serialization-v2.md)).

## Store slice changes

| Slice | Removed | Added |
|---|---|---|
| `UiSlice` | `analysisStale`, `scheduleStale`, `markStale`, `clearStale` | – |
| `ScheduleSlice` | entire slice (`scheduleResults`, `bottlenecks`, `refRequirementsByDay`, setters) | – |
| `AnalysisSlice` | `validationErrors`, `warnings`, `suggestions`, `flightingSuggestions`, `setAnalysisResults`, `clearAnalysis` | – (accept/reject state for flighting suggestions stays – it is user intent) |
| new `PlacementsSlice` | – | `placements`, `setPlacementsFromAuto`, `updatePlacement`, `removePlacement`, `clearPlacements`, `setPinned` |
| new `DismissalsSlice` | – | `dismissedFindings`, `dismissFinding` (advisory-only guard), `undismissFinding` |

Derived reads live in `src/store/derived.ts` as memoized selector helpers
(schedule view model, analysis findings, ref requirements), each a pure
function of store inputs calling engine code – components subscribe to inputs
and derive, so no derived value can outlive its inputs.

## Preset (moves, shape extends)

`src/data/tournaments.ts` exports `SCENARIO_IDS`, `ScenarioId`,
`ScenarioFixture`, `SCENARIOS` – the table from
`__tests__/helpers/scenarios.ts` unchanged in content. `ScenarioFixture`
already carries `label`, `source`, `fencerCounts`, `days`, `strips`,
`videoStrips`, `tournamentType`; design §Presets needs no further fields for
P2. Test helpers re-export from here (research D6).

## State transitions

```text
placements: {} ──auto-schedule──▶ all-auto map ──auto-schedule──▶ replaced
                                      │
                              updatePlacement (store API, P4 UI)
                                      ▼
                            entry {source:'manual', pinned:true}
                                      │
                              remove competition ──▶ entry deleted

dismissal: absent ──dismiss(advisory finding)──▶ present (sticky)
           present ──undismiss──▶ absent
           present ──rule flicker / magnitude change──▶ present (unchanged)
```
