# Contract: the defaults the store chooses must be ones the engine accepts

**Feature**: 008-team-event-cut | **Phase**: 1 | **Date**: 2026-08-31

The seam this feature repairs is not "team events". It is that the store
picks per-competition defaults with no check that the engine will accept them,
and the engine's rejection is tournament-wide. One wrong default on one event
type went unnoticed until 006 ran the two paths side by side and found two
reference tournaments placing nothing.

This contract states the invariant that would have caught it on the day it was
written, and it is checked across the whole catalogue rather than across the
eight tournaments that happen to be fixtures.

## C1 — Store-chosen defaults raise no BINDING error

For **every** entry in the competition catalogue, the config the store derives
for it — given a fencer count in range, which the store does not choose — must
produce no ERROR-severity finding under BINDING validation that is attributable
to a field the store defaulted.

**Scoped deliberately.** The store defaults `fencer_count` to `0`, which is a
structural error for every competition until the user or a template supplies a
real number. That is the user's input, not the store's choice, so the check
supplies a valid count and holds the store responsible only for what it picked:
`cut_mode`, `cut_value`, `ref_policy`, `de_mode`, `de_video_policy`,
`use_single_pool_override`.

**What it catches**: `cut-on-team` today. Tomorrow, any new catalogue category
or event type whose defaults the store derives without checking them against
the rules the engine already publishes.

**What it must not do**: assert a *count* of findings, or a snapshot of them.
A finding that is not attributable to a store-chosen default is out of this
contract's scope and belongs in the backlog, not in a tightened assertion that
future work has to fight.

## C2 — The team default is all-advance, in every creation route

A team competition created through any of the three routes — selecting a set,
adding one, applying a template — carries `cut_mode = DISABLED` and
`cut_value = 100`.

Stated per route rather than per function because the defect class is "one
route learned the rule and the others did not", which is exactly what the
`fencer_count` table's `category:TEAM` key did when it was added.

## C3 — Individual defaults are unchanged, value for value

For every non-team catalogue entry, the derived `cut_mode` and `cut_value`
equal the category's published defaults, unchanged from before this feature.

This is the contract that makes the six unaffected reference tournaments'
counts meaningful: if they hold their numbers *and* this holds, the change
reached exactly what it was supposed to reach.

## C4 — What the store shows as "default" is what the store applies

Any surface that marks a field as being at its default must derive that
default from the same place the store derives the value it applies. A surface
that re-derives it independently is a second copy of the rule, and the two
copies disagreeing is a user-visible defect (a freshly created team event
reading as user-modified) rather than a silent one.

## C5 — This contract does not bind the drift ledger's factory

The ledger's factory derives the same defaults independently and deliberately
([research.md D2](../research.md)). It is not required to import what the
store imports, and a future session that "unifies" them removes the app-path
parity check's ability to detect divergence. C1–C3 exist so that the
independence is checked against the engine's published rules rather than
against the other copy.
