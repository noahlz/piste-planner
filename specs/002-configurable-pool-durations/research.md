# Research: Configurable Pool Round Durations

No NEEDS CLARIFICATION markers existed in the Technical Context – the codebase answers every question directly. Decisions below record the design choices and the alternatives rejected.

## D1 – Store location: new field on `TournamentSlice`

**Decision**: Add `pool_round_duration_table: Record<Weapon, number>` to `TournamentSlice` in `src/store/store.ts`, with actions `setPoolRoundDuration(weapon, minutes)` and `resetPoolRoundDuration(weapon)`. Both mark analysis and schedule stale, matching every other tournament-level setter.

**Rationale**: The engine field lives on `TournamentConfig`, and the serialized home is the `tournament` sub-object (D3), so the tournament slice is the matching store home. The existing `GlobalOverrides` (competitions slice) was considered since it already overrides engine constants (`ADMIN_GAP_MINS` etc.), but it is a flat bag of scalars serialized under `competitions`, has no editing UI to share, and would put a tournament-scoped table in the wrong serialization slice.

**Alternatives considered**: Extending `GlobalOverrides` (rejected – wrong slice, wrong shape). A new dedicated slice (rejected – one field does not justify a slice).

## D2 – Semantics: full table seeded from defaults, not a partial overlay

**Decision**: The store holds a complete `Record<Weapon, number>` initialized from `DEFAULT_POOL_ROUND_DURATION_TABLE`. "Overridden" in the UI means the value differs from the default constant. Revert writes the default value back.

**Rationale**: Matches the engine type exactly, so the bridge is a pass-through with no merge logic. Follows the `GlobalOverrides` precedent (defaults copied in at store creation). The spec's edge case – an override equal to the default – behaves identically under either representation, so the partial-overlay design (`Partial<Record<Weapon, number>>` merged at the bridge) buys nothing and costs merge logic in three places (bridge, UI, serialization validation).

**Alternatives considered**: Overrides-only partial map – rejected as above.

## D3 – Serialization: additive key in `tournament`, omitted-key fallback, no version bump

**Decision**: `SerializedState.tournament` gains `pool_round_duration_table`, always written in full on save/share. On load: when the key is present it is validated (D5) and included in the returned partial state, and when absent it is left off the returned object entirely, so `useStore.setState(partial)` merge keeps the store's seeded defaults. `schemaVersion` stays 1.

**Rationale**: Backwards compatibility is a non-goal – the product is unreleased (owner decision, 2026-08-28) – so the optional key is schema leniency, not a compatibility mechanism. It earns its place twice over: every existing `serialization.test.ts` fixture builds a `tournament` object without the key and would need touching if the key were required, and the mechanics come free since `useStore.setState(partial)` merge already keeps seeded defaults for any key the deserializer leaves off (the same mechanics P1's removed-field tests exercise at `__tests__/store/serialization.test.ts:257–303`). The key must be omitted (not set to `undefined`) in the deserialized partial, because a present-but-undefined key would clobber the seeded default through `setState`.

**Alternatives considered**: Making the key required – rejected, it buys no correctness (the app always writes it) and costs churn across every existing serialization fixture. `schemaVersion: 2` – rejected, version bumps are for shape changes that need distinguishing, and with no released users nothing needs distinguishing. Serializing only when overridden – rejected, "always write the full table" makes every saved config self-describing and keeps validation unconditional-when-present.

## D4 – Future per-category dimension extends the same key (FR-009)

**Decision**: Keep the serialized value the engine's flat `Record<Weapon, number>` today. When the youth-event calibration lands (backlog), the same `pool_round_duration_table` key widens to carry an optional per-category layer on top of the weapon-level base values, validated in the same single place, loaded through the same omitted-key leniency. No second override system, no parallel key.

**Rationale**: The backlog entry requires the per-category dimension to "land in the same table rather than a second override system". Centralizing validation of this key (D5) in one function makes widening it a local change. Pre-building the nested shape now would force the UI and bridge to unwrap structure nothing uses.

**Alternatives considered**: Nesting now (`{ base: {...} }`) – rejected as speculative structure with a real cost today and no user today.

## D5 – Validation bounds: integer minutes, 1–999, exact weapon keys

**Decision**: A present serialized table must be an object with exactly the three `Weapon` keys, each value an integer from 1 to 999. Anything else fails `validateSchema` with a field-specific error (FR-008). The UI's `NumberInput` enforces the same bounds, and an invalid entry leaves the last valid value in effect (FR-004).

**Rationale**: The spec demands generous bounds – its own edge case requires 600 to be accepted – while still rejecting garbage (zero, negatives, non-numeric, unknown weapons). Whole minutes match the engine's minutes-from-midnight convention and every other duration in the config. Feasibility of extreme values is the schedule analysis's job, not the input's.

**Alternatives considered**: Tighter bounds near the defaults (rejected – the whole point is absorbing real-world data we cannot predict). Accepting fractional minutes (rejected – nothing else in the config is fractional and the engine has no sub-minute resolution).

## D6 – UI: self-contained `PoolDurationSettings` section beside `TournamentSetup`

**Decision**: New `src/components/sections/PoolDurationSettings.tsx` rendered in `WizardStep1` (with `TournamentSetup`) and `KitchenSinkPage`. One row per weapon: weapon name, `NumberInput` bounded per D5 showing the current value, the default shown persistently (reusing the `DefaultLabel` badge pattern when the value equals the default, and "default: N min" text plus a revert control when it differs). Never a blank input.

**Rationale**: `sections/` components are the unit both current layouts compose, and P3 deletes those layouts, so the section must be self-contained to migrate into the rail's Advanced panel. Pool durations govern how long the day's schedule runs, the same concern as `TournamentSetup`'s day start/end times, which places it on step 1 rather than with strips. `NumberInput` (`src/components/ui/number-input.tsx`) and `DefaultLabel` (`src/components/common/DefaultLabel.tsx`) already exist – no new primitives.

**Alternatives considered**: Placing it in `StripSetup`/step 3 (rejected – strips are spatial capacity, durations are temporal). Deferring all UI to P3's rail (rejected – the spec's P1 story requires an editor now, and a disposable-looking section is exactly what the design doc's unassigned "Global settings" decision needs as a concrete input).

## D7 – Drift verification: zero-diff run of B1–B8 after the bridge change

**Decision**: After the `buildConfig.ts` change, run the drift ledger (`__tests__/engine/driftLedger.test.ts`) and the integration suite. Expected result: zero drift, because the default path emits a config identical to today's. Any diff halts the task until explained (constitution III).

**Rationale**: The bridge is the one touched file on the config path. The seeded store default and the previously hardcoded constant are the same object values, so the no-override config is byte-identical – the ledger run is the proof, not the assumption (SC-004, FR-010).
