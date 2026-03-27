# PRD Addendum: Duration Estimation Corrections

**Date:** 2026-03-27
**Basis:** Empirical analysis of ~17k events from ROC/RYC/RJCC/SYC/NAC/Summer Nationals (`duration-estimate-analysis.md`)

## Change 1: Pool Round Duration Baselines

**Original values:**
```
pool_round_duration_table = { EPEE:120, FOIL:90, SABRE:60 }
```

**Corrected values:**
```
pool_round_duration_table = { EPEE:120, FOIL:105, SABRE:75 }
```

**Rationale:** Foil and sabre pools consistently run longer than originally estimated across the 40-199 fencer range. The gap reflects actual bout time, not scheduling overhead or resource contention. Epee baseline was already accurate.

## Change 2: Single-Pool Double-Strip Adjustment

When `n_pools == 1` and `pool_size >= 8`, the pool round duration returned by `poolDurationForSize` must be halved.

A single pool of 8-9 fencers is typically run on two strips simultaneously. The existing formula correctly computes total bout-minutes, but does not account for this intra-pool parallelism. Dividing by 2 produces estimates that closely match empirical data:

| Weapon | Pool of 8 (formula) | / 2 | Empirical |
|--------|--------------------:|----:|----------:|
| Epee   | 224m               | 112m | ~113m    |
| Foil   | 196m               | 98m  | ~107m    |
| Sabre  | 140m               | 70m  | ~74m     |

This adjustment applies only to the single-pool case (≤9 fencers or 10 with `use_single_pool_override`). Multi-pool events already achieve parallelism through strip allocation across pools.

## Change 3: No Change to DE Duration Table

The original analysis flagged sabre DE durations for large brackets (128, 256) as too low. Further investigation showed the empirical gap is explained by:

1. **Resource contention** (strip/ref shortages) — already modeled dynamically by `estimatePoolDuration`
2. **Flighting** — events with 200+ fencers are typically flighted, which caps duration growth. The duration curve flattens at 200+ and events in the 260-300 range run shorter than 160-199, confirming flighting.

The DE duration baselines remain unchanged.

## Change 4: No Demographic-Specific Adjustments

Y8/Y10 sabre and Vet 70 women's sabre run slower per bout. However, these demographics represent only 10% of sabre data in the 20-120 fencer range and shift the overall median by <2 minutes. Not significant enough to warrant per-demographic duration tables.
