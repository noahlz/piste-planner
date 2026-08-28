# Contract: SerializedState v1 – `pool_round_duration_table` addition

The saved-file and share-URL format (`src/store/serialization.ts`) is the feature's one external interface. Backwards compatibility is a non-goal (the product is unreleased) – the omitted-key row below is schema leniency, not a compatibility promise.

## Schema change

`SerializedState.tournament` gains one key. `schemaVersion` stays `1` (additive optional key, research D3).

```jsonc
{
  "schemaVersion": 1,
  "tournament": {
    "tournament_type": "NAC",
    "days_available": 3,
    "dayConfigs": [ /* unchanged */ ],
    "strips_total": 30,
    "video_strips_total": 4,
    "pool_round_duration_table": {   // NEW – always written on save/share
      "epee": 110,
      "foil": 105,
      "sabre": 75
    }
  },
  "competitions": { /* unchanged */ }
}
```

## Write contract (serialize / encode)

- The table is **always** written, in full, whether or not any value differs from the defaults. Every saved config is self-describing (constitution I).

## Read contract (validate / deserialize / decode)

| Input | Outcome |
|---|---|
| Key present, object with exactly `epee`/`foil`/`sabre`, each an integer 1–999 | Load succeeds, table included in the returned partial state (FR-006) |
| Key absent | Load succeeds, key **omitted** from the returned partial state – `useStore.setState` merge leaves the store's seeded defaults untouched (FR-007). Never emit the key with value `undefined`. Leniency keeps existing fixtures and hand-trimmed configs valid. |
| Key present but wrong type, missing/extra weapon keys, non-integer, `< 1`, or `> 999` | Whole load fails with a field-specific `validateSchema` error naming the problem (FR-008) |

## Reference tests

Pattern to follow: the round-trip and validation tests already in `__tests__/store/serialization.test.ts` (the removed-field tests at lines 257–303 exercise the same setState-merge mechanics the omitted-key row relies on). New tests assert all three read-contract rows plus a full save→load and encode→decode round-trip with a mixed table (one override, two defaults).
