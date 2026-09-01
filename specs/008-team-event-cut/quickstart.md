# Quickstart: verifying the team-event cut fix

**Feature**: 008-team-event-cut | **Phase**: 1 | **Date**: 2026-08-31

Run from the feature worktree,
`.claude/worktrees/008-team-event-cut`. Every command writes to `./tmp/`;
read a log only when its command fails.

## 1. The defect, before the fix

```bash
timeout 120 pnpm --silent vitest run __tests__/store/appPathParity.test.ts > ./tmp/test.log 2>&1
```

On `main`, before this feature, B2 and B8 were pinned at `0` — two of the eight
reference tournaments placed nothing. On this branch the pins are `24` and
`53`, so the command above passes rather than reproducing the defect. The
pre-fix numbers are `main`'s and are recorded in
[006's parity-exceptions.md](../006-day-axis-parity/parity-exceptions.md) and
[006's baseline.md](../006-day-axis-parity/baseline.md).

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
- an exception survived after its pin reached the ledger's count — this
  feature closed B2's exception this way, deleting it from the table once its
  pin and ledger count both read `24`.

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

Baseline at `main` is **1274 passed / 55 files**. This feature's after-state is
**1566 passed / 57 files**, 0 skipped, with both runs agreeing. Both runs must
be green and must agree, and the delta from the baseline must be accounted for
file by file — see T017's commit (`181eae4699`) for that table rather than
restating it here.

## 6. The live app

The procedure is the `live-smoke` skill's; it is not restated here. What this
feature adds to it: the driver applies a team-bearing template
(`NAC Cadet/Junior`) and asserts a placed count measured against the running
app, alongside the boot assertion and the `ROC Div1A/Vet` step already there.
That count is **15** of the template's 24 events, at **39** suggested strips,
and — as `scripts/smoke.mjs` notes beside the assertion — it is read at that
point in the driver's accumulated session state, after the ROC template, a
fencer-count edit to 99, and the share round-trip, not from a fresh boot, so
it need not match a fresh-store measurement of the same template elsewhere.

Pass condition: `SMOKE PASS`, zero console errors, the boot count still `24` —
B1's team events are Veteran, which already defaulted to all-advance, so this
feature must leave that number exactly where 006 put it — and `ROC Div1A/Vet`
still `12`.

## 7. By hand, if you want to see it

Start the app (`pnpm dev`), open the rail's **Presets…**, pick
**NAC Cadet/Junior**, set fencer counts, and auto-schedule. Before this
feature the board comes back completely empty — including every individual
event in the tournament. After it, a fresh-store run places **10 of the
template's 24 events**, and each team event's cut reads as its default rather
than as user-modified. Partial placement is normal for these 3-day NAC
templates — `baseline.md` records `NAC Youth` at 9 of 24 and `RYC Weekend` at
8 of 18 with no team events involved at all — so 10 of 24 is not a shortfall
this feature owns.

This recovery does not reach every team-bearing template. Of the four,
**two recover** (`NAC Cadet/Junior` 10 of 24, `Junior Olympics` 9 of 18) and
**two stay at zero** (`NAC Div1/Junior`, `NAC Vet/Div1/Junior`), blocked by an
unrelated engine rule this feature does not touch. See
[`docs/design/backlog.md`](../../docs/design/backlog.md)'s "Team events block
their whole tournament" for why.
