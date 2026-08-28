# Quickstart: Validating Configurable Pool Round Durations

Prerequisites: `pnpm install` done, repo root as working directory.

## Automated checks

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1                     # full suite
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1                        # typecheck
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1                     # lint
```

Read logs only on failure. Targeted suites while iterating:

```bash
timeout 120 pnpm --silent vitest run __tests__/store/serialization.test.ts > ./tmp/test.log 2>&1
timeout 120 pnpm --silent vitest run __tests__/store/buildConfig.test.ts > ./tmp/test.log 2>&1
timeout 120 pnpm --silent vitest run __tests__/store/store.test.ts > ./tmp/test.log 2>&1
timeout 120 pnpm --silent vitest run __tests__/components/sections/PoolDurationSettings.test.tsx > ./tmp/test.log 2>&1
timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1   # must show ZERO drift (SC-003)
```

## End-to-end scenarios (`pnpm dev`, browser)

1. **Override flows to the schedule (US1)**: Open pool duration settings – three inputs pre-filled with 120/105/75, each badged as default, none blank. Set epee to 110, recompute, and confirm epee pool rounds shorten while foil and sabre are unchanged. The default (120) stays visible next to the overridden value with a revert control. Revert returns 120 and recompute restores the original schedule.
2. **Invalid entry (FR-004)**: Enter 0, a negative number, and clear the field – each is rejected and the last valid value remains in effect.
3. **Share round-trip (US2)**: With epee at 110, generate a share URL and open it in a fresh tab or private window. The override and the computed schedule match the original exactly ([contracts/serialization-schema.md](./contracts/serialization-schema.md)).
4. **Save/load round-trip (US2)**: Save to file with a mixed table (one override, two defaults), reload the app, load the file, and confirm the same values and schedule.
5. **Omitted key (FR-007)**: Hand-delete the `pool_round_duration_table` key from a saved file. It loads without error and all three durations show as defaults.
6. **Malformed table (FR-008)**: Hand-edit a saved file to `"epee": -5` (and separately to `"epee": "fast"`). Load fails with a validation error naming the field, and the app state is unchanged.

## Expected outcomes

- All suites green, typecheck and lint clean.
- Drift ledger reports zero drift on B1–B8 – any diff halts work until explained (constitution III).
- Scenario results match the acceptance scenarios in [spec.md](./spec.md).
