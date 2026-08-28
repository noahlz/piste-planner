# Data Model: Configurable Pool Round Durations

One entity, four homes. Each home already exists except the store field – the feature threads one value through them.

## Entity: Pool round duration table

Average completion time in whole minutes, per weapon, for the baseline 6-fencer/15-bout pool round. Other pool sizes scale from the baseline via `poolDurationForSize` (`src/engine/pools.ts:62`) – that scaling is engine behavior and out of scope.

| Weapon | Default (min) |
|---|---|
| epee | 120 |
| foil | 105 |
| sabre | 75 |

Defaults are `DEFAULT_POOL_ROUND_DURATION_TABLE` (`src/engine/constants.ts:114`) and do not change.

### Homes

| Home | Shape | Status |
|---|---|---|
| Engine config | `TournamentConfig.pool_round_duration_table: Record<Weapon, number>` (`src/engine/types.ts:216`) | exists, unchanged |
| Store | `TournamentSlice.pool_round_duration_table: Record<Weapon, number>`, seeded from the default constant | **new** |
| Bridge | `buildTournamentConfig` copies the store field into the engine config (replaces the hardcoded constant at `src/store/buildConfig.ts:66`) | **changed** |
| Serialized | `SerializedState.tournament.pool_round_duration_table`, always written, optional on read | **new key** – see [contracts/serialization-schema.md](./contracts/serialization-schema.md) |

### Validation rules

Applied wherever a value enters the system (UI input and `validateSchema`):

- Object with exactly the three `Weapon` keys – no extras, none missing (when the table is present at all).
- Each value an integer, `1 <= v <= 999`.
- UI: invalid entry is rejected and the last valid value stays in effect (FR-004).
- Load: invalid table fails the whole load with a field-specific error (FR-008), matching existing `validateSchema` behavior.

### States and transitions

| State | Meaning | UI presentation |
|---|---|---|
| Default | value equals the default constant for that weapon | value shown with "Default" badge (`DefaultLabel` pattern) |
| Overridden | value differs from the default | value shown with "default: N min" reference and a revert control |

Transitions, all per weapon and all marking analysis + schedule stale:

- `setPoolRoundDuration(weapon, minutes)` – Default → Overridden, or Overridden → Overridden. Setting the exact default value lands in Default (state is derived by comparison, never stored as a flag).
- `resetPoolRoundDuration(weapon)` – Overridden → Default.
- Load (file or URL) – table present: replace all three values. Table absent: no write, store keeps its current seeded defaults.

### Relationships

- Consumed by `weightedPoolDuration` / `poolDurationForSize` through config – engine, unchanged.
- Future: the youth per-category calibration widens this same entity with a per-category layer over the weapon base values (research D4). Nothing in this feature stores category data.
