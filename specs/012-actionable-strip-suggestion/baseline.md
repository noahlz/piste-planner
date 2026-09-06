# Baseline: 012

`[M]` means measured by running code, `[R]` read from source, `[E]` derived by
arithmetic from measured figures and marked as an estimate.

## 0. Branch starting numbers

- HEAD: `9efed59259` (branch `012-actionable-strip-suggestion`, cut from `main`
  at `670c4da36e`)
- `pnpm test`: Test Files 66 passed (66), Tests 1829 passed (1829), 0 skipped
- `tsc -b`: clean (exit 0)
- `lint`: clean (exit 0)

Nothing under `src/` or `__tests__/` is touched by this task. The probe lived
under `tmp/` and was deleted once its numbers were recorded.

### The per-run cost assumption holds

[spec.md §Context](./spec.md) rests on "a scheduler run costs 0.6–12ms",
measured at days=3 on the predecessor branch. `[M]` re-measured here at days=4,
one `scheduleAll` at each template's smallest working strip count:

| | ms |
|---|---:|
| Cheapest run (ROC Div1A/Vet) | 0.17 |
| Dearest run (NAC Vet/Div1/Junior) | 9.08 |

The assumption is confirmed. Nothing is materially slower than the design
expects, and the low end is roughly 3× cheaper than the spec's figure. The
spec's ~350ms worst-case scan estimate is also confirmed for the scans that
find an answer: `[M]` the dearest full scan is **203ms**, on
NAC Vet/Div1/Junior.

**One cost the spec does not state, recorded here for T008.** Every scan in §1
stops at its answer. A scan that finds *no* answer runs the full
`ceiling − floor + 1` range, which on NAC Vet/Div1/Junior is **203 candidates**.
`[M]` §1a swept exactly that range on that template, and it cost **1468ms**, or
7.2ms per candidate. An exhausting scan on the largest template therefore
finishes **inside SC-007's two-second bound**, with roughly a quarter of the
budget to spare.

Recorded because this file's first revision estimated `[E]` 1.8–2.2s from the
per-run figure above and was wrong on the pessimistic side. Candidates far above
the answer are cheaper than candidates near it, so the average over a full sweep
sits below the per-run cost measured at the answer. `[M]` all ten sweeps
together are 946 scheduler runs for 2436ms.

---

## The method

`[M]` Everything in §1 is produced by a temporary probe at
`tmp/probe-012-baseline.test.ts`, run with

```
timeout 600 pnpm --silent vitest run tmp/probe-012-baseline.test.ts > ./tmp/probe.log 2>&1
```

and deleted after the numbers were recorded. It reads `src/` and never writes
to it. Every loop is bounded by a fixed collection or by a count computed before
entry. `vitest.config.ts` sets no `include`, so a `*.test.ts` under `tmp/` is
picked up by the default glob.

The probe is [`011/baseline.md`](../011-feasibility-and-strip-suggestion/baseline.md)
§The method's `runTemplate` with **one change**, the one
[plan.md §The measurement instrument](./plan.md) names:

```ts
state().setDays(4)   // was setDays(state().days_available), which is 3 pre-boot
```

`[R]` `boot.ts:41` applies preset B1, whose fixture is four days, so 4 is the
day count a user actually sees. Per standing rule 5, **no number in this file is
comparable to `011/baseline.md` §5**, which is days=3.

Per template, the probe:

1. `useStore.setState(useStore.getInitialState(), true)`
2. `state().setDays(4)`
3. `state().applyTemplate(name)`
4. strips: either `state().suggestStrips()` (the app's own **Suggest** action,
   synchronous today) or `state().setStrips(80)`
5. `state().setVideoStrips(null)` in the suggested column, `12` in the other
6. `buildTournamentConfig(state())`, then `scheduleAll(competitions, config)`

**Placed** counts schedule entries with a non-null `pool_start`, the rule
`src/store/runActions.ts:31` uses. **ERROR rule ids** come from
`validateConfig(config, competitions, ValidationMode.BINDING)` called directly,
because `scheduleAll` discards a finding's rule id when it turns it into a
`Bottleneck`.

Fixed conditions, all supplied by the app and none changed by `applyTemplate`:

- **Days: 4** on all ten. `[M]` confirmed: `config.days_available` is 4 on every
  run.
- **Tournament type: NAC** for all ten. `applyTemplate` does not set the type,
  so a template picked from initial state runs as a NAC even when its name says
  ROC. `[M]` confirmed: `config.tournament_type` is `NAC` on all ten.
- **Video strips in the suggested column: `null` → resolves to the NAC default
  of 8.** `[M]` confirmed at 8 on all ten.

### The three derived quantities

**Ceiling** is the current suggestion read back from `state().strips_total`
after `suggestStrips()` — that is `suggestStripCount`, which becomes the
search's upper bound.

**Floor** is computed inline, since the named function does not exist yet. It is
`validation.ts:355-362`'s summation verbatim, including its filter:

```
sum over competitions with config.MIN_FENCERS <= fencer_count <= config.MAX_FENCERS
  of estimateCompetitionStripHours(c, config).total_strip_hours
÷ (4 × config.DAY_LENGTH_MINS / 60)
rounded up, minimum 1
```

`[M]` `DAY_LENGTH_MINS / 60` is 14 on every template, so the divisor is 56
strip-hours per strip.

**Smallest working count** is found by scanning upward from `floor` to `ceiling`
inclusive, stopping at the first candidate whose placed count equals the event
count. Each candidate's config is the suggested-column config with **only**
`strips_total` and `strips` replaced, where `strips` is
`buildStrips(n, config.video_strips_total)` — `src/store/buildConfig.ts:114`
verbatim. Every other field is held, so a candidate is exactly the config
`buildTournamentConfig` would produce at that count. The scan is bounded by
`ceiling − floor + 1` iterations, computed before entry.

### Reproducibility

The probe was run twice, the second time with two fields added
(`stripHoursExact`, `placedAtFloor`). **Every ceiling, floor, smallest working
count, candidate count and placed count is identical across both runs.** Only
the millisecond figures differ, by under 0.4ms per run and under 1.3ms per scan.

---

## 1. Ten templates before any change

`[M]` Measured at `9efed59259`, days=4, before any file under `src/` was edited.

| Template | Events | Ceiling | Placed @ ceiling | Floor | **Smallest working** | Candidates evaluated | Placed @ smallest−1 | Placed @ 80/12 | ms per run | ms scan |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| NAC Youth | 24 | 197 | 24 | 53 | **66** | 14 | 22 | 24 | 1.77 | 33.95 |
| NAC Cadet/Junior | 24 | 144 | 24 | 39 | **48** | 10 | 21 | 24 | 0.93 | 9.06 |
| NAC Div1/Junior | 24 | 147 | 24 | 39 | **49** | 11 | 23 | 24 | 1.13 | 5.92 |
| NAC Vet/Div1/Junior | 66 | 268 | 66 | 66 | **85** | 20 | 65 | 66 | 8.85 | 202.71 |
| ROC Div1A/Vet | 12 | 23 | 12 | 5 | **15** | 11 | 0 | 12 | 0.17 | 0.34 |
| ROC Div1A/Div2/Vet | 18 | 37 | 18 | 7 | **16** | 10 | 17 | 18 | 0.35 | 0.86 |
| ROC Mega | 42 | 158 | 42 | 32 | **46** | 15 | 41 | 42 | 3.41 | 44.75 |
| RYC Weekend | 18 | 78 | 18 | 16 | **32** | 17 | 17 | 18 | 0.60 | 7.25 |
| RJCC Weekend | 12 | 54 | 12 | 11 | **24** | 14 | 11 | 12 | 0.26 | 1.76 |
| Junior Olympics | 18 | 135 | 18 | 37 | **49** | 13 | 17 | 18 | 0.56 | 5.32 |

**Every template places its whole field at its ceiling and at 80/12.** Ten of
ten in both columns — this is 011's delivered state, and it is why the defect is
about size rather than correctness.

`validateConfig(…, BINDING)` returns **zero ERROR findings on all twenty cells**
— at the ceiling and at 80/12, on every template. This matches the dispatch's
expectation.

### The strip-hours behind each floor

`[M]` Unrounded, because one floor turns on the third decimal place (§3).

| Template | Aggregate strip-hours | ÷ 56 | Floor | Placed @ floor |
|---|---:|---:|---:|---:|
| NAC Youth | 2940.667 | 52.512 | 53 | 18 |
| NAC Cadet/Junior | 2128.233 | **38.004** | **39** | 20 |
| NAC Div1/Junior | 2170.133 | 38.752 | 39 | 0 |
| NAC Vet/Div1/Junior | 3670.333 | 65.542 | 66 | 51 |
| ROC Div1A/Vet | 230.050 | 4.108 | 5 | 0 |
| ROC Div1A/Div2/Vet | 376.817 | 6.729 | 7 | 0 |
| ROC Mega | 1775.383 | 31.703 | 32 | 25 |
| RYC Weekend | 882.583 | 15.760 | 16 | 0 |
| RJCC Weekend | 583.183 | 10.414 | 11 | 0 |
| Junior Olympics | 2026.900 | 36.195 | 37 | 0 |

**The floor places fewer than every event on all ten templates.** This is the
`[M]` T005 cites when it asks for a fixture where the floor and the answer
differ by construction: the floor is a necessary condition and never a
sufficient one on any template this project measures. Six of the ten place
**zero** events at their floor, so a search that returned its own starting point
would be wrong by the whole board on more than half the catalogue.

### The one sharp cliff

`[M]` ROC Div1A/Vet places **0 events at 14 strips and 12 of 12 at 15**. It is
the only template whose smallest−1 figure is zero rather than one or two events
short. Recorded so that a later reader does not mistake it for a broken
measurement: the scan evaluated 11 candidates from 5 to 15 and the first ten
placed fewer than 12.

### 1a. Monotonicity above the answer

`[M]` A second probe, `tmp/probe-012-monotonicity.test.ts`, evaluated **every**
candidate from floor to ceiling inclusive on all ten templates — 946 scheduler
runs, 2436ms — using the same per-candidate config as §1. It was run with

```
timeout 900 pnpm --silent vitest run tmp/probe-012-monotonicity.test.ts > ./tmp/mono.log 2>&1
```

and deleted after the numbers were recorded. Two quantities per template:
**shortfalls above** is every candidate strictly greater than the smallest
working count that places fewer than every event, and the **monotone threshold**
is the smallest count at or above which every candidate up to the ceiling places
every event.

| Template | Smallest working | Candidates above it that fall short | Monotone threshold | Decreases anywhere in range |
|---|---:|---|---:|---:|
| NAC Youth | 66 | **69–75, each placing 23 of 24** | **76** | 3 |
| NAC Cadet/Junior | 48 | **61 (22 of 24), 62–67 (23 of 24)** | **68** | 1 |
| NAC Div1/Junior | 49 | none | 49 | 0 |
| NAC Vet/Div1/Junior | 85 | **86 (65), 87 (65), 88 (64), 90 (65), 91 (64), 92 (65), 93 (64), 94 (64), 95 (65)** — all of 66 | **96** | 9 |
| ROC Div1A/Vet | 15 | none | 15 | 0 |
| ROC Div1A/Div2/Vet | 16 | none | 16 | 0 |
| ROC Mega | 46 | **47, placing 41 of 42** | **48** | 3 |
| RYC Weekend | 32 | none | 32 | 0 |
| RJCC Weekend | 24 | none | 24 | 0 |
| Junior Olympics | 49 | none | 49 | 0 |

**Scheduling is not monotonic in strip count, and this is the first time the
project has observed it.** [research.md D3](./research.md) assumed
non-monotonicity and specified an upward scan rather than a bisection on that
assumption, without a counterexample in hand. Four templates now supply one.
NAC Vet/Div1/Junior loses an event at 86 strips that it places at 85, and does
not hold all 66 reliably until 96. NAC Youth places 24 at 66, 67 and 68, then
places 23 at every count from 69 to 75. `[M]` The largest single drop is
NAC Vet/Div1/Junior falling from 64 placed at 78 strips to 60 at 79.

### Does the 76 → 66 gap have a non-monotonic explanation?

**On the three templates that disagree with the spec, yes, exactly.** `[M]` The
spec's figure equals the measured monotone threshold on each of them, to the
strip:

| Template | Spec §Context | Smallest working `[M]` | Monotone threshold `[M]` |
|---|---:|---:|---:|
| NAC Youth | 76 | 66 | **76** |
| NAC Vet/Div1/Junior | 96 | 85 | **96** |
| ROC Mega | 48 | 46 | **48** |

A method that assumes monotonicity — a bisection, or a scan that samples rather
than steps — cannot return a count below the threshold, because every probe it
takes in the non-monotone band reads as failure and pushes its lower bound up.
The three disagreements are therefore not measurement error in either direction.
Both numbers are correct answers to different questions: 66 is the smallest
count that places every event, and 76 is the smallest count above which *every*
count places every event.

**What this does not establish.** The spec's ten figures are not uniformly the
monotone threshold, so no single method is shown to have produced them.
NAC Cadet/Junior is the counterexample: its threshold is **68** and the spec
records **48**, which is the upward scan's answer.

`[E]` The sweep fixes the pass/fail verdict at every count in every range, so a
bisection can be replayed exactly against it rather than guessed at. A standard
lower-bound bisection returns **76** on NAC Youth, matching the spec, and
**68** on NAC Cadet/Junior, which the spec does not record. So the spec's
numbers agree with the threshold on nine of ten and with the upward scan on the
tenth, and no single method is shown to have produced all ten. No cause is
proposed for the mixture. What is shown is narrower and sufficient: each of the
three disagreements has a precise non-monotonic explanation, and none remains
unaccounted for.

### What this means for T005, T006 and the organizer

Three consequences, each measured rather than argued.

1. **The upward scan is load-bearing, not a precaution.** A bisection would
   return 76, 96 and 48 on the three templates above. Those are the numbers
   this feature exists to shrink, and two of them are within a strip or two of
   what the ceiling-based rule already produces on the small regionals. The
   scan's cost buys 10, 11 and 2 strips on the three largest boards.
2. **T005's "minimality from both sides" case has a real fixture.** Any of the
   four non-monotone templates satisfies it, and NAC Vet/Div1/Junior does so
   most sharply: 85 places 66 of 66 and 86 places 65.
3. **An organizer who adds strips to the suggested count can lose an event.**
   `[M]` On four of ten templates, at least one count above the answer places
   fewer events than the answer does. Nothing in this feature's scope addresses
   that, and nothing in its scope claims otherwise, but it is the first measured
   evidence for the behaviour [spec.md §Edge Cases](./spec.md) describes as "not
   proven impossible". It belongs in the handoff.

---

## 2. B1–B8, as they stand

`[R]` Read, not probed. Scheduled counts and floors from
`__tests__/engine/driftLedger.test.ts:61`; `stripRecommendation` from
`__tests__/engine/__snapshots__/driftLedger.test.ts.snap`, each mapped to its
scenario by the `exports[...]` key above it.

| Scenario | `scheduledCount` | `SCHEDULED_FLOORS` | On floor? | `stripRecommendation` |
|---|---:|---:|---|---:|
| B1 | 24 | 24 | yes | 135 |
| B2 | 24 | 24 | yes | 189 |
| B3 | 24 | 24 | yes | 182 |
| B4 | 17 | 17 | yes | 190 |
| B5 | 12 | 12 | yes | 73 |
| B6 | 45 | 45 | yes | 165 |
| B7 | 18 | 18 | yes | 207 |
| B8 | 52 | 52 | yes | 147 |

**Every scenario sits exactly on its floor.** There is no slack anywhere: a
single event lost on any scenario halts the task that lost it (standing rule 3).

The eight `stripRecommendation` values are **T011's "before"**. T011 re-points
the ledger field from `recommendStripCount` to the search, and all eight are
expected to move. `[R]` The snapshot line numbers, so the diff can be read
scenario by scenario: B1 `:406`, B2 `:814`, B3 `:1225`, B4 `:1521`, B5 `:1745`,
B6 `:2463`, B7 `:2784`, B8 `:3614`.

---

## 3. Agreement with spec §Context

**The ceilings reproduce exactly. Three of the ten smallest-working counts do
not, and one floor does not.** Per standing rule 10 the measurement is right and
the disagreement is recorded, not corrected. Every disagreement is in the same
direction: the true answer is **smaller** than the spec predicted, which
strengthens the feature's case rather than weakening it.

| Template | Ceiling (spec → `[M]`) | Smallest working (spec → `[M]`) | Floor (spec → `[M]`) |
|---|---|---|---|
| NAC Youth | 197 → **197** ✓ | 76 → **66** ✗ | 53 → **53** ✓ |
| NAC Cadet/Junior | 144 → **144** ✓ | 48 → **48** ✓ | 38 → **39** ✗ |
| NAC Div1/Junior | 147 → **147** ✓ | 49 → **49** ✓ | — |
| NAC Vet/Div1/Junior | 268 → **268** ✓ | 96 → **85** ✗ | 66 → **66** ✓ |
| ROC Div1A/Vet | 23 → **23** ✓ | 15 → **15** ✓ | — |
| ROC Div1A/Div2/Vet | 37 → **37** ✓ | 16 → **16** ✓ | — |
| ROC Mega | 158 → **158** ✓ | 48 → **46** ✗ | 32 → **32** ✓ |
| RYC Weekend | 78 → **78** ✓ | 32 → **32** ✓ | — |
| RJCC Weekend | 54 → **54** ✓ | 24 → **24** ✓ | — |
| Junior Olympics | 135 → **135** ✓ | 49 → **49** ✓ | 37 → **37** ✓ |

### The four disagreements

1. **NAC Youth: 76 → 66.** Ten strips lower than the spec's figure, which
   [spec.md §Context](./spec.md) and [spec.md §User Story 1](./spec.md) both
   quote as an example an organizer could take to a facility. The prose figure
   76 is superseded by 66.
2. **NAC Vet/Div1/Junior: 96 → 85.** Eleven lower. This is the number
   [tasks.md T014](./tasks.md) predicts the live smoke step will read (`[M]`
   96); T014 measures it rather than assuming it, so the prediction there is
   now known to be stale and should read 85.
3. **ROC Mega: 48 → 46.** Two lower.
4. **NAC Cadet/Junior floor: 38 → 39.** A rounding artifact, not a rule
   difference. `[M]` the aggregate is 2128.233 strip-hours and 2128.233 ÷ 56 is
   38.004, so the ceiling of the quotient is 39. The spec's 38 is what the
   *rounded* 2128 gives. The floor is computed from the unrounded sum, so 39 is
   correct. This is the one cell where reading the feasibility message's own
   printed strip-hour figure would give the wrong floor, and T003's requirement
   that the aggregate "agrees to the strip-hour" with the message is what keeps
   the two consistent.

**The first three are explained by §1a, and were not when this section was first
written.** `[M]` On each of them the spec's figure is exactly the measured
monotone threshold — the smallest count above which every count places every
event — while the figure here is the smallest count that places every event at
all. Both are correct answers to different questions, and the gap between them
is the non-monotone band §1a measures. Nothing about the day count or the
measurement path differs, which was this section's first conjecture and is
withdrawn.

The numbers above are reproducible from the method in §The method and are what
T008 is judged against.

### The four structural claims

All four hold on all ten templates.

| Claim | Verdict |
|---|---|
| `floor ≤ smallest ≤ ceiling` | **holds, 10/10.** Narrowest margin is NAC Vet/Div1/Junior at 66 ≤ 85 ≤ 268 |
| smallest−1 places fewer than every event | **holds, 10/10.** Shortfalls run from 1 event (NAC Vet/Div1/Junior, ROC Mega, ROC Div1A/Div2/Vet, RYC Weekend, RJCC Weekend, Junior Olympics) to 12 (ROC Div1A/Vet, which places 0) |
| SC-003 — the six templates above 100 have smallest < half of ceiling | **holds, 6/6.** The six are NAC Youth (66 < 98.5), NAC Cadet/Junior (48 < 72), NAC Div1/Junior (49 < 73.5), NAC Vet/Div1/Junior (85 < 134), ROC Mega (46 < 79), Junior Olympics (49 < 67.5) |
| SC-004 — every smallest ≤ 100 | **holds, 10/10.** The largest is 85, on NAC Vet/Div1/Junior |

`[M]` The overshoot the spec describes as 1.53×–3.29× measures **1.53×–3.44×**
at days=4. Both ends fall on the templates the spec puts there. ROC Div1A/Vet is
the mildest, 23 ÷ 15 = 1.53×, unchanged because its smallest working count did
not move. ROC Mega is the worst, 158 ÷ 46 = **3.44×**, above the spec's stated
upper bound of 3.29× — a consequence of its smallest working count measuring 46
rather than 48.

---

## 4. What T008 measures against

T008 re-runs this method through the **app's own path** — `suggestStrips()`
awaited, then `buildTournamentConfig` and `scheduleAll` — and its suggested
column must equal the **Smallest working** column of §1 on all ten templates:
66 / 48 / 49 / 85 / 15 / 16 / 46 / 32 / 24 / 49. A template whose app-path count
differs from the engine-path count above means the search's candidate config and
`buildTournamentConfig` disagree about some field, and halts T008 until that
field is named. SC-001 is every template placing its full event count at its new
suggested count; SC-002 is the **Placed @ smallest−1** column staying below the
event count; SC-003 and SC-004 are already confirmed here against the engine and
are re-confirmed there against the app. SC-007's two-second bound is judged on
the largest template, where §0 records the one case this task did not measure:
a search that exhausts its range rather than finding an answer.

Section 2 is T011's "before". No scheduled count may move, and all eight
`stripRecommendation` values are expected to.
