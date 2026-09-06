# Adding strips can lose an event: a list-scheduling anomaly

**Status**: observed and measured 2026-09-06, not fixed. Recorded so that a
report of "I added a strip and an event fell off the board" can be answered
with the measurement and the literature rather than re-investigated as a bug.

## What was observed

`[M]` Feature 012's baseline swept every strip count from the strip-hours floor
to the concurrency ceiling on all ten templates, at the app's boot day count of
four, 946 scheduler runs in total
([`specs/012-actionable-strip-suggestion/baseline.md` §1a](../../specs/012-actionable-strip-suggestion/baseline.md)).
On four of the ten, some strip count *above* the smallest working count places
*fewer* events than that count does.

| Template | Smallest count placing every event | Counts above it that fall short | Smallest count from which every larger count also works |
|---|---:|---|---:|
| NAC Youth (24 events) | 66 | 69–75, each placing 23 | 76 |
| NAC Cadet/Junior (24) | 48 | 61 places 22; 62–67 place 23 | 68 |
| NAC Vet/Div1/Junior (66) | 85 | 86, 87, 90, 92, 95 place 65; 88, 91, 93, 94 place 64 | 96 |
| ROC Mega (42) | 46 | 47 places 41 | 48 |

The other six templates are monotone: every count above their smallest working
count also places every event. The largest single drop measured is
NAC Vet/Div1/Junior falling from 64 placed at 78 strips to 60 at 79.

The organizer-facing consequence: on those four templates, taking the
**Suggest** button's count and rounding it up by one can lose an event.

## Why it happens in this engine

The scheduler is a greedy list scheduler. It takes events in a fixed priority
order and gives each one strips as it comes to it, never looking ahead. The strip
count enters that process at exactly two points, both caps of the form
`floor(strips_total × pct)`:

- the per-event pool cap, `src/engine/concurrentScheduler.ts:466`
- the per-phase pool and DE caps, `src/engine/concurrentScheduler.ts:958-966`

Add one strip and a cap can tick up. An event early in the order then takes one
more strip per phase. An event later in the order finds fewer free strips at its
preferred start, slides later, and misses its deadline. One strip fewer, and the
earlier event was capped lower, so the later one started alongside it. Nothing
in the packer can see that the extra strip hurt, because nothing in it looks
past the event it is placing.

## Why it is a known class of behaviour, not a coding error

This is the multiprocessing timing anomaly Graham described in 1966 and bounded
in 1969. In a greedy list schedule, *relaxing* the problem – more processors,
shorter tasks, fewer precedence constraints, or a different list order – can
*lengthen* the schedule. Strips are the processors here.

- R. L. Graham, "Bounds for Certain Multiprocessing Anomalies", *Bell System
  Technical Journal* 45(9), pp. 1563–1581, November 1966.
  DOI [10.1002/j.1538-7305.1966.tb01709.x](https://onlinelibrary.wiley.com/doi/abs/10.1002/j.1538-7305.1966.tb01709.x).
  Open copy: [archive.org/details/bstj45-9-1563](https://archive.org/details/bstj45-9-1563).
  Also indexed at [IEEE Xplore 6767827](https://ieeexplore.ieee.org/document/6767827).
- R. L. Graham, "Bounds on Multiprocessing Timing Anomalies", *SIAM Journal on
  Applied Mathematics* 17(2), pp. 416–429, 1969.
  DOI [10.1137/0117039](https://dl.acm.org/doi/10.1137/0117039).
  Open copy: [people.irisa.fr/Sophie.Pinchinat/AA/Graham1969SIAM.pdf](https://people.irisa.fr/Sophie.Pinchinat/AA/Graham1969SIAM.pdf).

The 1969 paper proves the anomaly is bounded: moving from `m` to `m′`
processors under list scheduling cannot lengthen the schedule by more than a
factor of `1 + (m − 1) / m′`. That is a statement about makespan, and this
engine's failure mode is a deadline miss rather than a longer makespan, but the
cause is the same greedy commitment and the bound is the reason the losses
measured above are one to four events rather than a collapse.

## How to answer a report of this as a bug

1. Confirm the shape: more strips, fewer events placed, same board otherwise.
2. It is expected behaviour of a greedy list scheduler, cited above, and the
   project has measured it (table above).
3. The **Suggest** button's count is safe by construction: feature 012's search
   scans upward and returns the first count that places every event, so the
   count it writes always works. The counts just above it may not.
4. If the venue must book more than the suggested count, the right column of
   the table is the count to reach: from there up, every count works on that
   template. Other boards need their own sweep.

## What a fix would look like, and what each costs

None is scheduled. Recorded so the next feature that touches packing starts
from options rather than from zero.

| Option | What it does | Cost |
|---|---|---|
| Retry at lower caps inside `scheduleAll` | Schedule at the requested count; if events fail, re-run with the caps computed at count − 1, − 2, … and keep the best board | A search inside `scheduleAll`, which 012 deliberately keeps out; ~7ms per run `[M]`, so a handful of retries is cheap but it changes what "one scheduler run" means |
| One-step lookahead in the greedy | Before granting an event its full cap, check whether the next event on that day still meets its deadline at that allocation | Touches the packer's core loop; needs its own drift measurement across B1–B8 |
| Report rather than repair | After scheduling, if count N placed fewer events than N − 1 would have, say so | Needs a second run to know, so the same cost as the first option without the benefit |
| Monotone-by-construction | If a schedule exists at k strips, it exists at k + 1 with one strip idle; keep the k-strip board when the k + 1 board is worse | Requires knowing the k-strip board, which is the first option again |

## Where the measurement lives

The full per-candidate sweep, the method, and the probe are in
[`specs/012-actionable-strip-suggestion/baseline.md` §1a](../../specs/012-actionable-strip-suggestion/baseline.md).
[`research.md` D3](../../specs/012-actionable-strip-suggestion/research.md)
records why the search was specified as an upward scan rather than a bisection
before this was observed; the sweep is the counterexample that decision
anticipated.
