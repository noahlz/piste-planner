# Data Model: Team-Event Cut Default

**Feature**: 008-team-event-cut | **Phase**: 1 | **Date**: 2026-08-31

No persisted schema changes. What follows is the shape of the one derivation
this feature corrects, and the surfaces that read it.

## The default competition config

When a competition first appears — the user selects competitions, adds one, or
applies a template — the store builds a `CompetitionConfig` from its catalogue
entry. Every field is derived from the entry; none is asked of the user.

| Field | Keyed off | Changed here |
|---|---|---|
| `fencer_count` | category × weapon × gender, or category × TEAM, from the template's fencer-default table; `0` with no template | no |
| `ref_policy` | constant `AUTO` | no |
| `cut_mode` | **category alone** → **category and event type** | **yes** |
| `cut_value` | **category alone** → **category and event type** | **yes** |
| `de_mode` | constant `SINGLE_STAGE` | no — 004 US4's |
| `de_video_policy` | category | no |
| `use_single_pool_override` | constant `false` | no |

The `fencer_count` row is the one already event-type aware: its default table
is keyed `category:TEAM` for team events and `category:weapon:gender`
otherwise. The cut pair is the field that was missed when that branch was
added.

## The rule being satisfied

The engine states it as a requirement, not a preference: a team event must
carry `cut_mode = DISABLED` (`src/engine/validation.ts:157-159`, rule
`cut-on-team`). It is a `policy` finding, so under BINDING validation it is an
ERROR, and `scheduleAllConcurrent` returns an empty schedule when any BINDING
error is present. The blast radius is the tournament, not the event — which is
what turns a wrong default on one event into a blank board.

The store is the only side that changes. The rule, its severity, and the
empty-schedule response all stay exactly as they are.

## The three creation routes

All three must go through the same derivation, or a competition's defaults
depend on how it was added:

| Route | Entry point |
|---|---|
| Select a set of competitions | `selectCompetitions` (`src/store/store.ts`) |
| Add one competition | `addCompetition` (`src/store/store.ts`) |
| Apply a template or preset | `applyTemplate` / `applyPreset`, with a fencer-default table |

Today all three already call `defaultConfigForId`, so the branch lands in one
place and reaches all three. That is asserted rather than assumed
([contracts/competition-defaults.md](./contracts/competition-defaults.md)).

## The second reader

`CompetitionOverrides.tsx` does not create a config — it *re-derives* the
default to decide whether to print "default" beside a field the user can
change. It is a reader of the same rule, and it must read the same helper, or
it reports every newly created team event as user-modified
([research.md D1](./research.md)).

## What is deliberately not unified

The drift ledger's factory (`__tests__/helpers/scenarios.ts`) derives the same
defaults independently and keeps doing so. That independence is what gives the
app-path parity check its power to detect divergence; the reasoning is
[research.md D2](./research.md).
