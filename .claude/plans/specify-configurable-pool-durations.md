# Prompt: /speckit-specify — Configurable pool round durations

Run after P1 (001-p1-foundations) merges, from the repo root, in a fresh session:

```
/speckit-specify Make pool round durations user-configurable. The engine already
accepts pool_round_duration_table (Record<Weapon, number>, minutes for the
6-person/15-bout baseline) on TournamentConfig, but buildConfig.ts hardcodes
DEFAULT_POOL_ROUND_DURATION_TABLE (epee 120, foil 105, sabre 75) and no store
state or UI writes it. Motivation: USA Fencing may provide better
completion-time data about how long pool rounds actually take, and organizers
should be able to apply it without a code release. Durations are average
completion times - ad-hoc floor practices like double-stripping are absorbed in
the averages, never modeled. Scope: a store field, editor UI showing the
per-weapon defaults with override affordance (defaults stay visible, not blank
inputs), the buildConfig.ts bridge (the only store-to-engine path), and
serialization of the table in saved/shared configs. Serialization is mandatory,
not optional - results must be reproducible from config alone (constitution I),
and a shared URL that omits the table must fall back to defaults via the
omitted-key back-compat pattern used in P1's removed-field tests. Shape the
config so a per-category dimension (the youth-event pool duration calibration
in docs/design/backlog.md) can later land in the same table rather than a
second override system - but per-category values themselves are out of scope
here. Engine math is unchanged: poolDurationForSize and weightedPoolDuration
already consume the table. See the "Configurable pool round durations" entry in
docs/design/backlog.md.
```
