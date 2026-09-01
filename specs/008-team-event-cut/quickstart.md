# Quickstart: verifying the team-event cut fix

**Feature**: 008-team-event-cut | **Phase**: 1 | **Date**: 2026-08-31

Run from the feature worktree,
`.claude/worktrees/008-team-event-cut`. Every command writes to `./tmp/`;
read a log only when its command fails.

## 1. The defect, before the fix

```bash
timeout 120 pnpm --silent vitest run __tests__/store/appPathParity.test.ts > ./tmp/test.log 2>&1
```

Against unfixed code, B2 and B8 are pinned at `0`. That is the defect: two of
the eight reference tournaments place nothing. The cause and its isolation
evidence are in
[006's parity-exceptions.md](../006-day-axis-parity/parity-exceptions.md).

## 2. The parity gate

```bash
timeout 120 pnpm --silent vitest run __tests__/store/appPathParity.test.ts > ./tmp/test.log 2>&1
```

Passes when every reference tournament places its pinned count, **and** every
pin that differs from the drift ledger's count carries a written exception.
The pins and the exception table live in the test file itself; the file is the
single home for those numbers, so read them there rather than here.

Two failures this gate is built to produce, and both are informative:
- a pin moved without an exception recorded, or
- an exception survived after its pin reached the ledger's count (B2's, once
  this feature lands).

## 3. The drift gate — the ledger must not move

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1
git diff --stat main -- src/engine/
```

The snapshot must be byte-identical and the engine diff must print **nothing**.
This feature changes no engine code and no ledger fixture, so a diff on either
is not a result to interpret — it is a stop signal (constitution III).

## 4. The catalogue contract

```bash
timeout 120 pnpm --silent vitest run __tests__/store/competitionDefaults.test.ts > ./tmp/test.log 2>&1
```

Checks [contracts/competition-defaults.md](./contracts/competition-defaults.md)
C1–C3 across every catalogue entry, not just the eight fixtures: no BINDING
error attributable to a default the store chose, team events all-advance
through every creation route, individual defaults unchanged value for value.

## 5. The full suite, twice

```bash
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
timeout 120 pnpm --silent test > ./tmp/test2.log 2>&1
```

Baseline at `main` is **1274 passed / 55 files**. Both runs must be green and
must agree, and the delta from the baseline must be accounted for file by file
in the commit message — a single green run is not evidence in this repo.

## 6. The live app

The procedure is the `live-smoke` skill's; it is not restated here. What this
feature adds to it: the driver applies a team-bearing template
(`NAC Cadet/Junior`) and asserts a placed count measured against the running
app, alongside the boot assertion and the `ROC Div1A/Vet` step already there.

Pass condition: `SMOKE PASS`, zero console errors, and the boot count still
`24` — B1's team events are Veteran, which already defaulted to all-advance,
so this feature must leave that number exactly where 006 put it.

## 7. By hand, if you want to see it

Start the app (`pnpm dev`), open the rail's **Presets…**, pick
**NAC Cadet/Junior**, set fencer counts, and auto-schedule. Before this
feature the board comes back completely empty — including every individual
event in the tournament. After it, the tournament schedules, and each team
event's cut reads as its default rather than as user-modified.
