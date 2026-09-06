# Quickstart: verifying 012

How to confirm the feature works, in the order the confidence builds: the engine
agrees with itself, the app agrees with the engine, and the running browser
agrees with both. A green suite proves the first two and **not** the third
(constitution VI).

## Prerequisites

- The worktree at `/Users/noahlz/projects/piste-planner-012-actionable-strip-suggestion`, branch `012-actionable-strip-suggestion`
- `pnpm install` complete
- `baseline.md` written, so there is something to compare against

## 1. The gates

```bash
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
```

Read the logs only on failure. All three must be clean before anything below is
worth running.

## 2. The suggestion is minimal, from both sides

The claim is not "the suggested count works" — 011 already delivered that. It is
"**no smaller count works**". Both halves need checking, because a search that
silently returns its own starting point passes the first and fails the second.

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/stripSearch.test.ts > ./tmp/test.log 2>&1
```

Expected, per template:

- the returned count places every event
- the returned count **minus one** does not
- the returned count is at or below what the concurrency ceiling would have
  returned for the same board

A fixture whose floor already places every event exercises the one-run path, and
must be present — otherwise a scan that never iterates would pass unnoticed.

## 3. The ten templates, at days=4

The whole-feature measurement. Re-run the harness `baseline.md` §The method
describes, with `setDays(4)`.

| Template | Events | Suggested before | Expected after `[M]` |
|---|---:|---:|---:|
| NAC Youth | 24 | 197 | **76** |
| NAC Cadet/Junior | 24 | 144 | **48** |
| NAC Div1/Junior | 24 | 147 | **49** |
| NAC Vet/Div1/Junior | 66 | 268 | **96** |
| ROC Div1A/Vet | 12 | 23 | **15** |
| ROC Div1A/Div2/Vet | 18 | 37 | **16** |
| ROC Mega | 42 | 158 | **48** |
| RYC Weekend | 18 | 78 | **32** |
| RJCC Weekend | 12 | 54 | **24** |
| Junior Olympics | 18 | 135 | **49** |

Every "after" cell must place its template's full field, and no cell may exceed
its "before".

**Do not compare these against `011/baseline.md` §5.** That table is days=3 and
reads 258 / 192 / 195 / 357 / 30 / 49 / 210 / 100 / 72 / 179. Both are the rule
working correctly on different day counts.

## 4. The drift ledger

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/driftLedger.test.ts > ./tmp/test.log 2>&1
```

`stripRecommendation` moves on **all eight** scenarios and now records the
searched count rather than the concurrency ceiling — expected, per
[research.md D7](./research.md). The ledger test gains roughly two seconds `[M]`;
that is the cost of keeping drift coverage on the number users see.

What must not move is any scheduled count: all eight sit exactly on their floors
with no slack, so one lost event halts the task.

Record all eight before-and-after recommendation values in the commit message.
Reviewing the snapshot diff means reading each of the eight and saying why it
moved, not accepting the file wholesale.

## 5. The advice names four levers, in order

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/concurrentScheduler.test.ts > ./tmp/test.log 2>&1
```

Expected on a board that does not fit: days, flighting, entry caps, strips —
in that order, strips last, and **no strip count of its own**. On a board that
fits: no lever advice at all.

Grep the rendered findings for the floor and the ceiling values of the fixture
under test. Neither may appear in any user-visible string (SC-005a).

Also confirm scheduling performs exactly **one** scheduler run. A search reaching
`postScheduleDiagnostics` would recurse, so this is a correctness check, not a
performance one.

## 6. The indicator

```bash
timeout 120 pnpm --silent vitest run __tests__/components/sections/StripSetup.test.tsx > ./tmp/test.log 2>&1
```

- A search longer than the reveal delay shows the indicator, which then clears
- A search shorter than the delay never shows it
- The strip field shows no intermediate candidate counts during a search

## 7. Live, in the browser

The step nothing above substitutes for. Use the `live-smoke` skill; the driver is
`scripts/smoke.mjs`, repaired **in place** and never rewritten — its selectors
are the accumulated record of corrections against the real DOM.

The new step: load a large template, press **Suggest**, read the strip field,
schedule, and measure a full board at that count.

Pass condition: SMOKE PASS twice, 0 console errors, and the count read from the
field matching §3's table for that template.

## What "done" means

1. `tsc -b`, `lint` and the full suite clean
2. §3's ten cells measured and matching, each placing its full field
3. Eight `stripRecommendation` values recorded before and after, no scheduled
   count fallen
4. Four levers in order, one scheduler run per schedule
5. Indicator appears and clears on a large template, never flashes on a small one
6. `scripts/smoke.mjs` passes twice with 0 console errors
7. `handoff.md` written, with what this feature deliberately did not fix

Then stop and hand the branch to the user. The merge commit is theirs, and the
merged tree runs `tsc -b`, `lint` and the full suite before it is written.
