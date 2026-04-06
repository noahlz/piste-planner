# Plan F: DE Strip-Hour Capacity Models

## Problem

`estimateCompetitionStripHours` in `capacity.ts` treats DE strips as fully occupied for the entire DE duration. In reality, large DEs run across multiple pods (typically 4 strips each) and consolidate to a single pod at the round of 16. The current model overestimates DE strip-hours because it assumes all `strips_allocated` are busy for the full duration.

The capacity model estimates strip-hours up to "gold medal bout ready to start" — the finals bout runs on a dedicated strip and is excluded from capacity planning.

## Design

### Two Capacity Modes

Add `de_capacity_mode: 'pod' | 'greedy'` to `TournamentConfig`.

### Mode 1: Pod Model (`'pod'`)

DE strips are organized into pods. Strips are distributed as evenly as possible across pods, with larger pods receiving one extra strip when `strips_allocated` is not divisible by `DE_POD_SIZE`. At R16 (16 fencers remaining), all pods consolidate to a single pod.

```
n_pods = ceil(strips_allocated / DE_POD_SIZE)
pod_sizes = distribute strips_allocated across n_pods as evenly as possible
```

Example: 6 strips → 2 pods (3 + 3). 10 strips → 3 pods (4 + 3 + 3).

A bracket of N promoted fencers is split into `n_pods` sub-brackets, each running independently on its pod.

**Pre-R16 phase** (per-pod, all pods run in parallel):

Each pod handles a sub-bracket of `promoted_fencers / n_pods` fencers. Walk down the sub-bracket round by round, using that pod's actual strip count:

```
n_pods = ceil(strips_allocated / DE_POD_SIZE)
sub_bracket_fencers = promoted_fencers / n_pods

per pod (with pod_strip_count strips):
  pod_batches = 0
  fencers = sub_bracket_fencers
  while fencers > sub_bracket_r16_cutoff:
    bouts = fencers / 2
    pod_batches += ceil(bouts / pod_strip_count)
    fencers = fencers / 2

pre_r16_duration = max(pod_batches across all pods) × bout_duration
pre_r16_strip_hours = strips_allocated × pre_r16_duration / 60
```

The sub-bracket's R16 cutoff is the point where 16 fencers remain in the overall bracket (= 16 / n_pods fencers per pod).

**R16 phase onward** (single pod, 4 strips; finals bout excluded — dedicated strip):

```
r16_strip_hours = sum over rounds R16..SF of:
  min(bouts_in_round, DE_POD_SIZE) × bout_duration / 60
```

During SF (2 bouts on 2 strips), the other 2 pod strips are freed and available for other events' bouts (e.g., a smaller event's SF that only needs video strips). This cross-event strip sharing is a capacity credit — subtract those freed strip-hours from the day's consumed capacity.

**Total**: `pre_r16_strip_hours + r16_strip_hours`

For brackets ≤ 16, everything runs on a single pod from the start.

**Example — 256-bracket epee on 16 strips (4 pods)**:

Per pod: 64-fencer sub-bracket on 4 strips:
- R32 (within pod): 32 bouts / 4 strips = 8 batches
- R16 (within pod): 16 / 4 = 4 batches
- R8 (within pod): 8 / 4 = 2 batches
- QF (within pod): 4 / 4 = 1 batch → produces top 4 fencers for consolidation
- Total: 15 batches × 20 min = 300 min
- Pre-R16 strip-hours: 16 × 300/60 = 80.0

R16 onward (overall bracket, 1 pod of 4 strips; finals excluded):
- R16: 8 bouts / 4 strips = 2 batches × 20 = 40 min → 4 × 40/60 = 2.67 sh
- QF: 4 bouts / 4 strips = 1 batch × 20 = 20 min → 4 × 20/60 = 1.33 sh
- SF: 2 bouts / 2 strips = 1 batch × 20 = 20 min → 2 × 20/60 = 0.67 sh (2 strips freed)
- F: excluded (dedicated finals strip)
- R16+ strip-hours: 4.67

**Unscaled total: 84.67 strip-hours** (bout-based elapsed time: 300 + 80 = 380 min)

After duration scaling: `84.67 × (240 / 380) = 53.47 strip-hours`
Current flat model: `16 × 240/60 = 64.0 strip-hours`
**Net improvement: ~16% reduction** — the pod model correctly accounts for 12 strips freeing at R16 consolidation, plus SF strip sharing.

### Mode 2: Greedy Model (`'greedy'`)

No pods. All strips available as a single pool. Bouts pipeline — next-round bouts start as strips free. Strip-hours are approximated as:

```
total_bouts = promoted_fencer_count - 2   (exclude finals bout — dedicated strip)
greedy_strip_hours = total_bouts × bout_duration / 60
```

This is strip-count-independent: more strips = faster completion, same total work. It's a clean lower bound for strip-hours consumed. No duration-table scaling is applied to the greedy model.

**Example — 256 fencers, 20% cut → 205 promoted (epee)**: `203 × 20 / 60 = 67.67 strip-hours`

### Team Events

Team events always use the greedy model regardless of `de_capacity_mode`. Every bout in a round runs simultaneously (one strip per bout), and rounds are strictly sequential — the next round does not start until all bouts in the current round finish.

Computed round-by-round to account for byes in non-power-of-2 entries:

```
total_bouts = team_count - 2   (exclude finals bout — dedicated strip)
team_strip_hours = sum per round of: actual_bouts_in_round × bout_duration / 60
```

When `team_count` is not a power of 2, the bracket rounds up but early rounds are play-in bouts for the overflow teams. Only overflow teams fence in the play-in round; all other teams wait.

```
play_in_bouts = team_count - next_lower_power_of_2(team_count)
  (0 if team_count is already a power of 2)
```

After play-ins, the bracket is a clean power of 2 and every round has exactly half the remaining field.

**Example — 33 teams (epee, bracket = 64)**:
- R64 (play-in): 33 - 32 = 1 bout, 1 strip → 1 × 20/60 = 0.33 sh
- R32: 16 bouts, 16 strips → 16 × 20/60 = 5.33
- R16: 8 → 2.67
- QF: 4 → 1.33
- SF: 2 → 0.67
- F: excluded (dedicated finals strip)
- **Total: 31 bouts × 20/60 = 10.33 strip-hours**

**Example — 32 teams (epee, bracket = 32, no play-ins)**:
- R32: 16 bouts → 5.33
- R16: 8 → 2.67
- QF: 4 → 1.33
- SF: 2 → 0.67
- F: excluded
- **Total: 30 bouts × 20/60 = 10.0 strip-hours**

### Duration Source

The pod model computes elapsed time from bout counts × bout duration, which may exceed the DE duration table values (the table is empirical/compressed). Two options exist:

1. **Use precomputed bout-based durations** — consistent with the step model but produces longer elapsed times than the table.
2. **Scale to match the DE duration table** — compute the ratio of bout-based total to table total, apply as a scaling factor to strip-hours. Keeps the model grounded in empirical data.

We use option 2 for the pod model only: compute the bout-based total elapsed time, then scale strip-hours by `table_duration / bout_based_duration`. This preserves the step-function shape while staying calibrated to real-world durations. The greedy model uses raw bout-based strip-hours without scaling.

### Constants

Add to `constants.ts`:

```
DE_POD_SIZE = 4
DE_BOUT_DURATION: Record<Weapon, number> = { EPEE: 20, FOIL: 20, SABRE: 10 }
```

Add to `TournamentConfig` in `types.ts`:

```
de_capacity_mode: 'pod' | 'greedy'
```

Default: `'pod'`.

### STAGED_DE_BLOCKS Interaction

For STAGED_DE_BLOCKS competitions:
- **Prelims phase**: Uses the selected capacity model (pod or greedy) to estimate strip-hours for bouts before R16. This replaces the current flat `strips_allocated × prelims_dur / 60`.
- **R16 and finals phases**: Already use their own strip counts (`de_round_of_16_strips`, `de_finals_strips`) and durations. No change needed.

## Files Changed

| File | Change |
|------|--------|
| `src/engine/types.ts` | Add `de_capacity_mode` to `TournamentConfig` |
| `src/engine/constants.ts` | Add `DE_POD_SIZE`, `DE_BOUT_DURATION` |
| `src/engine/capacity.ts` | Replace flat DE formula with pod/greedy models; pod scaling; team round-by-round |
| `src/store/buildConfig.ts` | Supply `de_capacity_mode` default when building TournamentConfig |
| `__tests__/helpers/factories.ts` | Add `de_capacity_mode` to test config factory |
| `__tests__/engine/capacity.test.ts` | Tests for both modes + team events, edge cases (bracket ≤ 16, non-divisible strips) |
| `METHODOLOGY.md` | New section: DE strip allocation models — 4-strip pod structure for individual DEs (sub-brackets, R16 consolidation, SF strip sharing), greedy pool model, team events (all bouts simultaneous, strict round boundaries, no pods), finals bout exclusion, duration scaling |

## What Doesn't Change

- Pool strip-hour estimation — pools finish all at once, no phasing
- Day assignment penalties — consume improved estimates automatically
- DE duration table — still used for scheduling start/end times and as scaling reference
- R16/finals strip-hours in STAGED_DE_BLOCKS — already use per-phase strip counts (only prelims changes)

## Appendix: Domain Knowledge from Plan Review

These observations emerged during plan review and should inform implementation.

### How Individual DEs Actually Run at USA Fencing Events

- Large brackets (e.g., 256) are split across **pods of 4 strips**. Each pod runs an independent sub-bracket.
- All pods fence in parallel. A 256-bracket on 16 strips = 4 pods, each running a 64-fencer sub-bracket.
- At the **round of 16** (16 fencers remaining overall), all pods **consolidate to a single pod** of 4 strips. The other pods' strips are freed for other events.
- **QF** (4 bouts) runs on all 4 pod strips simultaneously.
- **SF** (2 bouts) runs on 2 of the 4 pod strips. The other **2 strips are freed** and can be used by other events (e.g., a smaller event needing video strips for its SF).
- **Finals** (gold medal bout) runs on a **dedicated finals strip**, separate from the pod. It is excluded from capacity planning entirely.
- **STAGED_DE_BLOCKS** generally uses pods (the staging is driven by video strip requirements at R16+).
- **SINGLE_STAGE** can use either pods or the greedy approach — this is controlled by the `de_capacity_mode` config.

### How Team DEs Differ

- Team events do **not** use pods. All strips are a single shared pool.
- Every bout in a round runs **simultaneously** — one strip per bout. A 32-team R1 needs 16 strips all at once.
- Rounds are **strictly sequential**: the next round cannot start until every bout in the current round finishes. No pipelining.
- Non-power-of-2 entries cause **play-in bouts** (e.g., 33 teams → 1 play-in bout on 1 strip, then a clean 32-team bracket).

### Bout Counting

- Total actual bouts = **entry count - 1** (every participant loses once except the winner), minus the finals bout.
- Byes (from rounding up to a power of 2) are not bouts — no fencing, no strip usage.
- For individual events, "entry count" is the **promoted fencer count** after pool cuts, not the original registration.

### Duration Table vs Bout-Based Calculation

- The DE duration table (e.g., 256 epee = 240 min) is **empirical** — based on real tournament timing.
- Computing elapsed time from bout counts × bout duration gives a **longer theoretical time** (e.g., 380 min for 256 epee) because it assumes every bout takes the maximum time.
- The pod model computes strip-hour **shape** (how strips free up over time) from bout math, then **scales** to match the empirical duration table. This preserves the correct proportions while staying calibrated to reality.
- The greedy model uses raw bout-based strip-hours without scaling.

### USA Fencing Rule Change (Upcoming)

- Maximum DE bracket size will be capped at **256** (hard cut). This bounds the problem space for all capacity models.
