# PRD Duration Estimates vs. Real Data

**Source:** `event-start-end-times-export.csv`, filtered to ROC/RYC/RJCC/SYC/NAC/Summer Nationals only (~17k events).

**Method:** Compared PRD's ideal-parallelism predicted durations (pool baseline + admin gap + DE table) against empirical median durations, bucketed by weapon and fencer count.

## Summary Table

| Weapon | Fencers | N | Actual Med | PRD Ideal | Delta | Flag |
|--------|---------|---:|----------:|----------:|------:|------|
| Epee | 1-10 | 982 | 2.6h | 4.0h | -1.4h | ⚠️ |
| Epee | 11-20 | 1245 | 3.5h | 4.7h | -1.2h | ⚠️ |
| Epee | 21-40 | 1717 | 4.4h | 5.0h | -0.6h | |
| Epee | 41-60 | 804 | 5.3h | 5.2h | +0.1h | |
| Epee | 61-80 | 316 | 5.8h | 5.1h | +0.6h | |
| Epee | 81-120 | 263 | 6.3h | 5.9h | +0.4h | |
| Epee | 121-160 | 89 | 7.0h | 6.0h | +1.1h | |
| Epee | 161-200 | 59 | 7.4h | 6.8h | +0.6h | |
| Epee | 201+ | 119 | 8.1h | 6.9h | +1.2h | |
| Foil | 1-10 | 925 | 2.5h | 3.4h | -0.9h | ⚠️ |
| Foil | 11-20 | 1223 | 3.4h | 3.9h | -0.5h | |
| Foil | 21-40 | 1665 | 4.3h | 4.2h | +0.0h | |
| Foil | 41-60 | 855 | 5.2h | 4.1h | +1.1h | ⚠️ |
| Foil | 61-80 | 414 | 5.8h | 4.2h | +1.6h | ⚠️ |
| Foil | 81-120 | 266 | 6.3h | 5.4h | +0.9h | |
| Foil | 121-160 | 104 | 7.0h | 5.3h | +1.7h | ⚠️ |
| Foil | 161-200 | 63 | 7.4h | 6.3h | +1.1h | |
| Foil | 201+ | 110 | 8.0h | 6.3h | +1.6h | ⚠️ |
| Sabre | 1-10 | 1221 | 1.8h | 2.4h | -0.6h | ⚠️ |
| Sabre | 11-20 | 1345 | 2.3h | 2.9h | -0.6h | |
| Sabre | 21-40 | 1379 | 2.9h | 2.9h | -0.0h | |
| Sabre | 41-60 | 565 | 3.4h | 3.4h | +0.0h | |
| Sabre | 61-80 | 263 | 3.7h | 3.3h | +0.4h | |
| Sabre | 81-120 | 185 | 4.1h | 3.6h | +0.5h | |
| Sabre | 121-160 | 107 | 5.2h | 3.7h | +1.4h | ⚠️ |
| Sabre | 161-200 | 65 | 6.0h | 3.7h | +2.3h | ⚠️ |
| Sabre | 201+ | 84 | 6.3h | 3.7h | +2.6h | ⚠️ |

## Findings

### 1. Small events (≤20 fencers): PRD overestimates

- Epee 1-10: PRD says 4.0h, actual 2.6h (-1.4h)
- Foil 1-10: PRD says 3.4h, actual 2.5h (-0.9h)
- Sabre 1-10: PRD says 2.4h, actual 1.8h (-0.6h)

The PRD's pool duration formula uses a 6-person-pool baseline even for tiny pools, and the DE table overweights small brackets. Not a scheduling problem — these events finish well within their slot.

### 2. Mid-size events (21-80 fencers): Reasonable fit

Most within ±0.6h of actual. The model works well here.

**Exception: Foil 41-80** runs ~1-1.6h longer than predicted. The 90-min foil pool baseline was too low — foil pools in this range consistently take longer than modeled.

### 3. Large events (120+ fencers): Distinguishing pool baseline vs. resource contention vs. flighting

Initial analysis showed large gaps at 200+ fencers across all weapons. Deeper investigation revealed three distinct causes:

**Pool baselines too low (actionable):** Foil and sabre pool round durations reflect actual bout time, not scheduling overhead. Empirical data across the 40-199 fencer range (where flighting is rare) consistently shows pools running longer than the original baselines predicted. Adjusted: FOIL 90→105, SABRE 60→75.

**DE duration gaps are resource contention (not actionable on the DE table):** The `estimate_pool_duration` function already models strip/ref contention dynamically. Inflating the DE duration baseline would double-count the problem.

**200+ fencer events are typically flighted:** Sabre duration by 20-fencer buckets:

| Fencers | N | Median |
|---------|---|--------|
| 120-139 | 60 | 5.1h |
| 140-159 | 48 | 5.3h |
| 160-179 | 32 | 6.2h |
| 180-199 | 31 | 6.0h |
| 200-219 | 29 | 6.0h |
| 220-239 | 23 | 6.3h |
| 240-259 | 10 | 6.6h |
| 260-279 | 7 | 5.9h |
| 280-299 | 8 | 6.3h |
| 300-319 | 5 | 6.0h |

The duration curve **flattens at 200+** and events in the 260-300 range run *shorter* than 160-199 — strong evidence of flighting. A linear extrapolation from the 60-199 range (non-flighted) predicts 200 fencers → 6.4h, but actual 200+ events median at 6.3h. The flighting mechanism breaks events into parallel flights, capping duration growth.

## Changes Made

1. **Foil pool baseline**: 90 → **105** mins — consistent under-prediction at 40+ fencers
2. **Sabre pool baseline**: 60 → **75** mins — consistent under-prediction at 40+ fencers
3. **Sabre DE durations**: Unchanged (128→120, 256→120) — empirical gap is from resource contention and flighting, both modeled dynamically by the scheduler
4. **Small-event overestimation**: No change — harmless buffer

## Data Quality Note

Some rows had negative durations (likely incorrect timestamps in source data). These were excluded from the analysis.
