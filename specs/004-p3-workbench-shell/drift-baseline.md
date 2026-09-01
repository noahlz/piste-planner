# B1–B8 drift baseline

This is the pre-change comparison target for the US4 drift gate (T062).
`scheduleAll` output for scenarios B1–B8 does not change between task T002
(this capture) and the start of US4 — only US4 (research D5, D6) is permitted
to move engine output (`tasks.md` Phase 6 note, constitution III). T062 re-runs
the harness below after D5/D6 land and diffs the result against this table.

- **Commit SHA captured against**: `f9a74ca58d949ee63988b806a71c774bd2180ecd`
  (branch `004-p3-workbench-shell`'s merge-base with `main`, identical to
  `main` HEAD at capture time — no source file differs from `main` at this
  SHA).
- **Date**: 2026-08-29.

## Harness

Scratch file, run once and deleted (not a repo artifact — this table is):

```
timeout 180 pnpm --silent vitest run tmp/baseline.capture.test.ts > ./tmp/out.log 2>&1
```

The scratch file drove all eight scenarios through the same pattern
`__tests__/engine/integration.test.ts` and `__tests__/engine/driftLedger.test.ts`
use — `buildCompetitions`/`tournamentConfig` from `__tests__/helpers/scenarios.ts`
into `scheduleAll` (`src/engine/scheduler.ts`) — then computed, per scenario:

- `scheduledCount`: `Object.keys(schedule).length`.
- `peakPool`: for each day in `[0, config.days_available)`, sum
  `peakPoolRefDemand(comp, comp.ref_policy)` (`src/engine/refs.ts`) over every
  competition scheduled that day with `fencer_count > 1`; report the max over
  days. This is the same per-day accumulation `driftLedger.test.ts`'s
  `dayPeakRefDemands` uses, kept as a separate pool-only sum instead of being
  collapsed with `Math.max(poolDemand, deDemand)` per competition, since this
  table needs the pool and DE figures independently.
- `peakDe`: identical accumulation using `peakDeRefDemand(comp, config)` in
  place of `peakPoolRefDemand`.

To reproduce for T062, recreate a vitest file with this body (see git history
of this file's authoring commit for the exact scratch source if needed), run
it against the post-D5/D6 code, and diff the printed numbers against the table
below. `scheduledCount` must not move on any scenario; a drop halts the task
until the cause is identified and recorded (constitution III).

## Baseline table

| Scenario | Tournament type | Scheduled events | Total competitions | Peak pool ref demand | Peak DE ref demand |
|---|---|---:|---:|---:|---:|
| B1 | NAC  | 24 | 24 | 248 | 24 |
| B2 | NAC  | 24 | 24 | 332 | 28 |
| B3 | NAC  | 24 | 24 | 304 | 24 |
| B4 | SYC  | 0  | 30 | 0   | 0  |
| B5 | SJCC | 12 | 12 | 116 | 16 |
| B6 | ROC  | 44 | 54 | 234 | 64 |
| B7 | NAC  | 18 | 18 | 340 | 20 |
| B8 | NAC  | 52 | 53 | 316 | 64 |

B4 trips the upfront `validateFeasibility` gate before any per-day packing
runs (Ruling 11, `__tests__/engine/driftLedger.test.ts`) — 0 scheduled, 0
peak demand on either arm, by design, not a capture error.

## Re-verification before US4

**Date**: 2026-08-31. **Verified against**: `e67fa9cdd0` (`main`, with features
006 and 008 both merged since the original capture). **Original capture SHA**:
`f9a74ca58d949ee63988b806a71c774bd2180ecd`.

Two features landed in `main` between the capture and this check. The ledger
path's inputs were diffed across the two SHAs rather than assumed unmoved:

- `git diff f9a74ca58d..e67fa9cdd0 -- src/engine/` touches only
  `src/engine/resources.ts`, and only its comments — no code line differs.
- `git diff f9a74ca58d..e67fa9cdd0 -- src/data/` is empty — `tournaments.ts`
  and its `SCENARIOS` fixture data are untouched.
- `git diff f9a74ca58d..e67fa9cdd0 -- __tests__/helpers/scenarios.ts` adds
  only a 15-line doc comment (the D2/appPathParity note above) — the
  `buildCompetitions`/`tournamentConfig` bodies are unchanged.

That is comments-only movement on every file the harness touches, not an
assertion that nothing changed — the diffs were read, not skipped.

The harness in §Harness was rebuilt at `tmp/baseline.capture.test.ts` and run
against `e67fa9cdd0`:

| Scenario | Type | Scheduled | Total comps | Peak pool | Peak DE |
|---|---|---:|---:|---:|---:|
| B1 | NAC  | 24 | 24 | 248 | 24 |
| B2 | NAC  | 24 | 24 | 332 | 28 |
| B3 | NAC  | 24 | 24 | 304 | 24 |
| B4 | SYC  | 0  | 30 | 0   | 0  |
| B5 | SJCC | 12 | 12 | 116 | 16 |
| B6 | ROC  | 44 | 54 | 234 | 64 |
| B7 | NAC  | 18 | 18 | 340 | 20 |
| B8 | NAC  | 52 | 53 | 316 | 64 |

Every cell matches the §Baseline table exactly. No harness correction was
needed to reach this table — the first run reproduced the document's shape
and numbers together. The harness was run twice in the same process
(`expect(run2).toEqual(run1)`); both runs produced identical values on every
column for every scenario, ruling out non-determinism as a source of
agreement or disagreement.

**Verdict**: the §Baseline table is still the correct zero point for the US4
drift gate.

## What research D5 and D6 predict will move

Both are documented in `specs/004-p3-workbench-shell/research.md` and are the
only changes T062 is permitted to see against this table.

- **D5** (`RefPolicy.AUTO` resolving per tournament type — two refs per pool
  at NAC/SJCC/SYC, one everywhere else): only **B6** (ROC) moves. Its refs
  per pool go 2 → 1, so B6's peak pool referee demand should drop
  (roughly halve). B1, B2, B3, B4, B5, B7, and B8 (NAC, SJCC, SYC) are
  unchanged by D5.
- **D6** (`de_mode` defaulting to `AUTO` → resolved to `STAGED` at NAC): **B1,
  B2, B3, B7, and B8** move — the five NAC scenarios. Their DE referee demand
  rises steeply; P1's DE referee correction makes staged-DE figures run
  roughly fourfold higher than single-stage. B4 (SYC), B5 (SJCC), and B6
  (ROC) are unchanged by D6.
- **Scheduled event counts must not move on any scenario.** A drop halts T062
  until the cause is identified and recorded (constitution III). Referee
  demand is reported, not scheduled against — ref-availability gating was
  removed — so D5/D6 are expected to move only the two demand columns above,
  never the scheduled-count column.

### Verification against `src/data/tournaments.ts`

The scenario-to-type mapping above was read directly from `SCENARIOS` in
`src/data/tournaments.ts` (not assumed from research.md): B1, B2, B3, B7, B8
are `NAC`; B4 is `SYC`; B5 is `SJCC`; B6 is `ROC`. This matches research D5's
and D6's stated scenario lists exactly — **no discrepancy found** between the
research predictions and the actual preset data.

## T062 — the drift gate run

**Date**: 2026-09-01. **Measured at**: `aaaa409a1c10b00ade2eb366d63c1d0975dc0945`
(branch `004-us4-drift-gate`, with D5, D6, D7 and T061a all landed).
**Diffed against**: the §Baseline table above, whose zero point §Re-verification
before US4 re-confirmed against `e67fa9cdd0` on 2026-08-31. That re-verification
was not re-run – it is taken as settled, per its own verdict.

This section supersedes nothing above it. It does report a measurement that
refutes part of §"What research D5 and D6 predict will move", and that section
is left standing as written so the prediction and its refutation can be read
against each other.

### Part 1 – the ledger path

The §Harness scratch file was rebuilt at `tmp/t062ledger.test.ts`, driving
`buildCompetitions`/`tournamentConfig` from `__tests__/helpers/scenarios.ts`
into `scheduleAll` and accumulating `peakPool`/`peakDe` per day exactly as
§Harness specifies. It was run twice in one process with
`expect(run2).toEqual(run1)`, which passed – non-determinism is not the source
of the agreement below.

| Scenario | Type | Sched. before | Sched. after | Δ | Pool before | Pool after | Δ | DE before | DE after | Δ |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B1 | NAC  | 24 | 24 | 0 | 248 | 248 | 0 | 24 | 24 | 0 |
| B2 | NAC  | 24 | 24 | 0 | 332 | 332 | 0 | 28 | 28 | 0 |
| B3 | NAC  | 24 | 24 | 0 | 304 | 304 | 0 | 24 | 24 | 0 |
| B4 | SYC  | 0  | 0  | 0 | 0   | 0   | 0 | 0  | 0  | 0 |
| B5 | SJCC | 12 | 12 | 0 | 116 | 116 | 0 | 16 | 16 | 0 |
| B6 | ROC  | 44 | 44 | 0 | 234 | 234 | 0 | 64 | 64 | 0 |
| B7 | NAC  | 18 | 18 | 0 | 340 | 340 | 0 | 20 | 20 | 0 |
| B8 | NAC  | 52 | 52 | 0 | 316 | 316 | 0 | 64 | 64 | 0 |

All 48 cells flat. **No scenario's `scheduledCount` dropped**, so constitution
III's halt condition did not fire on the ledger path.

#### Why it is flat – the mechanism, verified line by line

A flat ledger is not a pass on its own. US4's four changes all landed in
`src/store/`, and the ledger harness never enters `src/store/`:

- **D5 cannot reach it.** The resolution is `src/store/buildConfig.ts:147-148`,
  which substitutes `TYPE_DEFAULTS[type].ref_policy` for an `AUTO`. The ledger
  builds competitions through `makeCompetition`, whose `ref_policy` default is
  `RefPolicy.AUTO` (`__tests__/helpers/factories.ts:78`), and nothing resolves
  it. Even if resolution did reach the ledger it would move only B6:
  `peakPoolRefDemand` scores every policy but `ONE` at two refs per pool
  (`src/engine/refs.ts:22`), and `resolveRefsPerPool` does the same
  (`src/engine/pools.ts:170-175`), so `AUTO` and the `TWO` that NAC/SJCC/SYC
  resolve to are already the same number.
- **D6 cannot reach it either.** The ledger sets `de_mode` itself from the
  video policy (`__tests__/helpers/scenarios.ts:66-68`), never from the store.
- **D7 and T061a cannot reach it.** `video_strips_total` resolution and the
  `strips_allocated` pre-allocation are both `buildConfig.ts` code. The ledger
  passes its own `videoStrips` through `tournamentConfig` and pre-allocates
  `max(2, ceil(n/7))` itself (`__tests__/helpers/scenarios.ts:69`) – the very
  value T061a adopted into `buildConfig.ts:182`.

Corroborating evidence held independently of this run:
`__tests__/engine/integration.test.ts` runs the same builders and went and
stayed green across T059–T061a without an assertion being touched.

### Part 2 – the app path

D5, D6, D7 and T061a all move the app path, and no earlier task measured their
referee effect. The instrument is `__tests__/helpers/appPath.ts` – `applyPreset`
→ store → `buildTournamentConfig` → `scheduleAll` – with the same per-day
accumulation Part 1 uses, so the two tables are directly comparable.

The before column is a real measurement, not a reconstruction. `git archive
e67fa9cdd0 src` was extracted whole into `tmp/us4-before/src` and driven from a
scratch harness there. No tracked file was modified and no stash was used. The
extracted tree is self-contained – its store modules import only by relative
path, with no `@` alias that could have leaked the live `src/` into it – and the
two test files it carried were deleted before any suite ran. Both sides were run
twice in one process with `expect(run2).toEqual(run1)`, and both passed.

The instrument was validated against counts already measured this session
before any referee figure was read off it: it reproduced pre-US4 B1 24, B2 24,
B3 24, B4 16, B5 12, B6 43, B7 18, B8 53 and HEAD B1 24, B2 24, B3 24, B4 0,
B5 12, B6 39, B7 18, B8 53, exactly.

| Scenario | Type | Placed before | Placed after | Δ | Pool before | Pool after | Δ | DE before | DE after | Δ |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B1 | NAC  | 24 | 24 | 0   | 244 | 248 | +4   | 28 | 24 | −4 |
| B2 | NAC  | 24 | 24 | 0   | 380 | 332 | −48  | 24 | 28 | +4 |
| B3 | NAC  | 24 | 24 | 0   | 314 | 304 | −10  | 28 | 24 | −4 |
| B4 | SYC  | 16 | 0  | −16 | 140 | 0   | −140 | 24 | 0  | −24 |
| B5 | SJCC | 12 | 12 | 0   | 136 | 116 | −20  | 20 | 16 | −4 |
| B6 | ROC  | 43 | 39 | −4  | 200 | 92  | −108 | 64 | 56 | −8 |
| B7 | NAC  | 18 | 18 | 0   | 362 | 340 | −22  | 24 | 20 | −4 |
| B8 | NAC  | 53 | 53 | 0   | 282 | 368 | +86  | 56 | 64 | +8 |

The two placed-count drops are T061a's, both already isolated and recorded in
`29aabc9031` – B4 16 → 0 as the feasibility gate finally firing on the app
path, B6 43 → 39 as a re-pack with `validateFeasibility` clean either side.
Neither is a ledger-path drop, so constitution III's halt does not apply to
them.

#### What actually moves each referee column

Two facts, established by reading the code and confirmed by measurement, carry
almost the whole table.

**`peakDe` is not a referee-policy quantity at all.**
`peakDeRefDemand` returns `config.DE_REFS * min(de_round_of_16_strips,
max(de_round_of_16_strips, strips_allocated))`, which is just
`DE_REFS × de_round_of_16_strips` because the inner `max` can never fall below
`de_round_of_16_strips` (`src/engine/refs.ts:31-42`). `DE_REFS` is the constant
`1` (`src/engine/constants.ts:67`) and `de_round_of_16_strips` is hardcoded `4`
on every path – `buildConfig.ts:168` after US4, `buildConfig.ts:146` before it,
and `factories.ts:88` on the ledger. The function never reads `de_mode`. So
every competition contributes exactly 4, and the column is `4 ×` the number of
events with `fencer_count > 1` on the busiest day. That identity was asserted
per scenario on both sides of the change and held in all sixteen cases. Every
`peakDe` movement above is therefore a day-packing movement, reported in
referee units.

**The D5 policy effect was isolated from the packing effect.** On the *same*
pre-US4 schedule, `peakPool` was recomputed substituting the resolved policy
`buildConfig.ts:147-148` now writes. The policy-only delta:

| Scenario | Type | Resolved policy | Pool as-is | Pool with resolution | Policy Δ |
|---|---|---|---:|---:|---:|
| B1 | NAC  | TWO | 244 | 244 | 0 |
| B2 | NAC  | TWO | 380 | 380 | 0 |
| B3 | NAC  | TWO | 314 | 314 | 0 |
| B4 | SYC  | TWO | 140 | 140 | 0 |
| B5 | SJCC | TWO | 136 | 136 | 0 |
| B6 | ROC  | ONE | 200 | 100 | −100 |
| B7 | NAC  | TWO | 362 | 362 | 0 |
| B8 | NAC  | TWO | 282 | 282 | 0 |

D5 moves exactly one number in the whole app-path table, and it halves it.

#### Per scenario

- **B1 (NAC).** Placed 24 → 24. Pool 244 → 248 (+4), DE 28 → 24 (−4). Policy Δ
  0 – both are re-packing. All 24 competitions resolve to `STAGED` under D6 and
  all gain pre-allocated strips under T061a, which redistributes events across
  days: the busiest DE day goes from 7 events to 6. The pool column rises while
  the DE column falls because the accumulation takes an independent maximum per
  column, so the peak-pool day and the peak-DE day need not be the same day.
- **B2 (NAC).** Placed 24 → 24. Pool 380 → 332 (−48), DE 24 → 28 (+4). Policy Δ
  0. Re-packing under D6 (24 of 24 staged) and T061a. The busiest DE day goes
  from 6 events to 7, and the heaviest pool day sheds large-field events.
- **B3 (NAC).** Placed 24 → 24. Pool 314 → 304 (−10), DE 28 → 24 (−4). Policy Δ
  0. Same two causes, busiest DE day 7 → 6.
- **B4 (SYC).** Placed 16 → 0, pool 140 → 0, DE 24 → 0. Not a referee movement.
  T061a's `strips_allocated: max(2, ceil(n/7))` restores the DE term of
  `estimateCompetitionStripHours` that `strips_allocated: 0` had zeroed, so the
  upfront `validateFeasibility` gate now fires and nothing is scheduled. Zero
  events scheduled means zero referee demand on both arms, by definition. This
  is the app path converging onto the ledger's long-standing B4 behavior, and
  it closes the FR-004a exception that had the app at 16 against the ledger's
  0. Note that D5's SYC resolution is `TWO`, which is what `AUTO` already
  scored – SYC contributes nothing here.
- **B5 (SJCC).** Placed 12 → 12. Pool 136 → 116 (−20), DE 20 → 16 (−4). Policy
  Δ 0, and 0 of 12 competitions are staged – SJCC's D6 default is
  `SINGLE_STAGE`, the same value the store hardcoded before. So B5's movement
  is **T061a alone**: pre-allocated strips change the feasibility and packing
  arithmetic, the busiest DE day goes 5 events → 4, and the peak pool day
  lightens with it.
- **B6 (ROC).** Placed 43 → 39. Pool 200 → 92 (−108), DE 64 → 56 (−8). The only
  scenario where D5 bites, and it decomposes cleanly: 200 → 100 is D5 halving
  refs per pool on all 54 competitions (`onePolicyCount` 54 of 54), and 100 →
  92 is T061a's re-pack on top of it. 0 of 54 are staged, so D6 contributes
  nothing. The DE column follows the re-pack: busiest day 16 events → 14.
- **B7 (NAC).** Placed 18 → 18. Pool 362 → 340 (−22), DE 24 → 20 (−4). Policy Δ
  0. Re-packing under D6 (18 of 18 staged) and T061a, busiest DE day 6 → 5.
- **B8 (NAC).** Placed 53 → 53. Pool 282 → 368 (+86), DE 56 → 64 (+8). Policy Δ
  0. The largest pool rise in the table, and the only one that is not a
  lightening. 53 of 53 staged plus pre-allocated strips pack more events onto
  the heaviest day – the busiest DE day goes 14 → 16, and the peak pool day
  gains large-field events with it. The placed count holds at 53, which remains
  one above the ledger's 52 and leaves `specs/008-team-event-cut/b8-residual.md`
  open.

#### Convergence, as a side effect worth recording

After US4 the app path's referee figures equal the ledger's exactly on six of
eight scenarios – B1 248/24, B2 332/28, B3 304/24, B4 0/0, B5 116/16, B7
340/20. B6 and B8 remain apart. B6 cannot converge on the pool column by
construction: the app now runs ROC at one ref per pool while the ledger's
factory still runs it at `AUTO`, which scores two. That is D5 working, not a
gap. B8's 368/64 against 316/64 is the same open residual its placed count has.

### Verdict on §"What research D5 and D6 predict will move"

That section was written believing the resolution would reach the ledger path.
It does not, and on its own terms the section is wrong.

- **D5's ledger prediction – wrong, and for a second reason beyond reach.** B6
  did not move on the ledger. It could not: resolution lives in
  `buildConfig.ts`, which the ledger harness never calls. The prediction was
  nonetheless *correct about the effect*, and the app path proves it – B6's
  pool demand went 200 → 100, a halving to the unit, isolated from every other
  cause.
- **D6's prediction – wrong on this instrument, on every path.** "DE referee
  demand rises steeply… roughly fourfold" cannot happen in this table, because
  `peakDeRefDemand` is `DE_REFS × de_round_of_16_strips` and reads neither
  `de_mode` nor anything staging changes. Staging did land – 24, 24, 24, 18 and
  53 competitions resolved to `STAGED` on B1, B2, B3, B7 and B8 – and it moved
  DE demand by −4, +4, −4, −4 and +8, entirely through re-packing. A fourfold
  claim needs an instrument that reads the staged strip counts themselves
  (`de_prelims_strip_count` and `de_round_of_16_strip_count`, both already in
  `driftLedger.test.ts`'s digest), not this peak estimate. Whether the fourfold
  figure is right under that instrument is untested here and should not be
  assumed either way.
- **"Scheduled event counts must not move on any scenario" – held.** On the
  ledger path every count is identical. On the app path B4 and B6 dropped, both
  attributable to T061a and both recorded in `29aabc9031` before this run.

The lasting correction: the drift ledger measures the engine through the test
factories, so a change confined to `src/store/` is invisible to it by
construction. Predicting ledger movement from a store-side change is a category
error, and any future US-level change to resolution defaults should state which
of the two paths it expects to move before it is measured.

### Determinism

Every harness in this section – ledger, app-path before, app-path after, and
the policy decomposition – ran its full B1–B8 sweep twice inside one process
and asserted the two sweeps equal. All four assertions passed. Every scratch
harness and the extracted `tmp/us4-before` tree were deleted before the suite
was counted.
