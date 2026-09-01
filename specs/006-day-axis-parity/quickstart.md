# Quickstart: Verifying Day-Axis Parity

**Feature**: 006-day-axis-parity | **Date**: 2026-08-31

How to see the defect, and how to confirm it is gone. Run from the repo root
(or the feature worktree). Read the logs only on failure, per `CLAUDE.md`.

## Prerequisites

```bash
pnpm install
```

## 1. See the defect

The repro from
[`docs/design/reassessment-2026-08-31.md` §2](../../docs/design/reassessment-2026-08-31.md)
drives the app path directly: apply the boot preset, auto-schedule, count
placements against selected competitions.

**Before the fix**: `11 of 24`. **After the fix (landed)**: `24 of 24`, and
that is what the app boots into today.

There is no `tsx` binary in this project — run the repro through Vitest (a
temporary spec, or the parity test at `__tests__/store/appPathParity.test.ts`,
which now carries this exact assertion) rather than `npx tsx`. A self-contained
one-off, using the harness `appPathParity.test.ts` itself is built on:

```bash
cat > tmp/see-the-fix.test.ts <<'EOF'
import { describe, it } from 'vitest'
import { runAppPath } from '../__tests__/helpers/appPath.ts'

describe('see the fix', () => {
  it('prints B1\'s app-path placed count', () => {
    console.log('B1 placedCount:', runAppPath('B1').placedCount)
  })
})
EOF
timeout 60 pnpm --silent vitest run tmp/see-the-fix.test.ts
rm tmp/see-the-fix.test.ts
```

Prints `B1 placedCount: 24` (verified 2026-08-31 against the landed fix).

## 2. The parity gate

```bash
timeout 120 pnpm --silent vitest run __tests__/store/appPathParity.test.ts > ./tmp/test.log 2>&1
```

Green means: for each of B1–B8, the app path places its pinned number, and that
number equals the drift ledger's scheduled count except where FR-004a records a
per-default exception with its cause.

Expected first run of the feature: **red**, naming the real current counts. That
red run is the before-column and belongs in the commit message. Now that the
feature has landed, this gate runs **green** — 17/17, all eight scenarios
pinned, four at the ledger's exact count and four at documented FR-004a
exceptions (`parity-exceptions.md`).

## 3. The drift gate

```bash
timeout 200 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1
git diff --stat -- __tests__/engine/__snapshots__/driftLedger.test.ts.snap
```

The suite passes **and** the snapshot diff is empty. A non-empty diff halts the
task (constitution III) — identify the cause and record both counts before
deciding anything. Never accept the snapshot to make the run green.

Same check for the engine itself:

```bash
git diff --stat main -- src/engine/
```

This was wrong as originally written: the `latest_end` sentinel change
([research.md D6](./research.md)) lives in `src/store/buildConfig.ts`, not
`src/engine/`. What actually shows up here is T015's day-inference
precondition — comments only, no behavior change, in
`src/engine/resources.ts` — plus its own two-site call-argument guard added in
`__tests__/engine/resources.test.ts` (not part of this diff, since that's a
test file). Verified 2026-08-31: `git diff --stat main -- src/engine/` shows
exactly `src/engine/resources.ts | 28 ++++++++++++++++++++--------`, and every
added/removed line in that diff starts with `*`, `//`, or `/*`.

## 4. Per-day hours still work

Set two days to different hours, auto-schedule, and confirm every event falls
inside its own day's window and that narrowing one day leaves the other day's
events where they were (spec US2). Covered by tests in the store suite; check it
by hand once in the running app as well.

## 5. Full suite, types, lint

```bash
timeout 200 pnpm --silent test > ./tmp/test.log 2>&1
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
```

Baseline at the start of this feature: **1221 passed / 51 files** — that is now
the *starting* number, not the current one. Verified 2026-08-31 against the
landed feature: **1274 passed / 55 files**, `tsc -b` and lint both clean.

## 6. The live gate

```bash
pnpm dev            # in one terminal
pnpm smoke          # in another
```

Use the `live-smoke` skill for the procedure. After this feature the driver
reports and **asserts** a specific placed-event count at boot rather than
"non-empty", and its block and row floors are the numbers actually measured
against the fixed axis, with the reason recorded in the driver.

Screenshots land in `scripts/smoke-shots/`. `01-initial.png` is the one that
showed the symptom — 13 chips in the unplaced tray at boot. After the fix the
tray at boot holds only what the engine genuinely could not place.

## What "done" looks like

- App path and drift ledger agree on all eight tournaments, asserted.
- Drift-ledger snapshot and floors byte-identical to before.
- `src/engine/` diff limited to T015's comments-only precondition note in
  `resources.ts` (the `latest_end` sentinel itself is a store-side change).
- Full suite, types, lint clean.
- Smoke passes with a real asserted boot count.
- 004's `sessions/S6.md` records that its gate is satisfied.

All of the above is now true — verified 2026-08-31 against the landed
feature, commands and numbers recorded above.
