# Contract: Serialized State v2 (share URL)

The share URL is the app's one external interface: `#config=` + base64url of
the JSON below. This contract governs what `serializeState` writes and what
`validateSchema`/`deserializeState` accept in `src/store/serialization.ts`.

## Shape

```jsonc
{
  "schemaVersion": 2,
  "tournament": {
    "tournament_type": "NAC",
    "days_available": 4,          // v2: 1–14 (was 2–4)
    "dayConfigs": [ { "day_start_time": 480, "day_end_time": 1320 } ],
    "strips_total": 80,
    "video_strips_total": 12,
    "pool_round_duration_table": { "EPEE": 120, "FOIL": 120, "SABRE": 100 }  // optional, as v1
  },
  "competitions": {
    "selectedCompetitions": { "<eventId>": { /* CompetitionConfig, as v1 */ } },
    "globalOverrides": { /* as v1 */ }
  },
  "placements": {                 // NEW – may be empty, must be present
    "<eventId>": {
      "day": 0,
      "start_time": 480,
      "strip_count": 12,
      "strips": null,             // or number[]
      "source": "manual",         // "auto" | "manual"
      "pinned": true
    }
  },
  "dismissedFindings": [          // NEW – finding identities, may be empty
    "same-population:D1-M-EPEE-IND+JR-M-EPEE-IND"
  ]
}
```

## Acceptance rules

- `schemaVersion` must be exactly `2`. Version 1 payloads are rejected with a
  clear error – no migration (research D5).
- `days_available`: number in 1–14 inclusive.
- `placements`: required key. Entries whose event id is not in
  `selectedCompetitions` are dropped on load and reported in the result, not
  errors (spec edge case – lenient load).
- Placement field validation: `day` integer ≥ 0, `start_time` integer ≥ 0,
  `strip_count` integer ≥ 1, `source` one of `auto`/`manual`, `pinned`
  boolean, `strips` null or array of integers ≥ 0. A `day` beyond
  `days_available − 1` is accepted (stored intent surfaces as a finding, spec
  edge case).
- `dismissedFindings`: required key, array of strings. Unknown identities
  load fine – they are sticky records that may match future findings.
- Unknown top-level keys remain rejected, unknown nested extras remain
  silently dropped, both as v1 behaved.

## Round-trip guarantee

`deserializeState(serializeState(state))` reproduces `placements` and
`dismissedFindings` exactly (spec SC-001). Derived data never appears in the
payload – a v2 document fully determines the derived schedule via the engine.
