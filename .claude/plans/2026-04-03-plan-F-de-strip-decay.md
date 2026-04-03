# Plan F: DE Strip Decay Model

## Problem

`estimateCompetitionStripHours` in `capacity.ts` treats DE strips as fully occupied for the entire DE duration. In reality, each DE round eliminates half the field, freeing strips progressively. A 256-bracket epee DE uses 8 strips for the first hour, then 4, then 2, then 1. The current model overestimates DE strip-hours by roughly 2×, making the capacity penalty overly aggressive for days with large DE events.

## Design

### Strip Half-Life by Weapon

After N minutes of DE, half the allocated strips are freed. Derived from the DE duration table (bracket=8, 3 rounds, no batching):

| Weapon | Bout duration | Rounded (nearest 10) | ×4 bouts per strip | Half-life |
|--------|--------------|----------------------|--------------------|-----------|
| Epee   | 15 min       | 20 min               | 80 min             | **80 min** |
| Foil   | 15 min       | 20 min               | 80 min             | **80 min** |
| Sabre  | 10 min       | 10 min               | 40 min             | **40 min** |

The ×4 factor reflects that DEs run batches of ~4 bouts on each strip before the bracket halves and strips are released.

### Decay Model

Model DE strip usage as exponential decay with the weapon-specific half-life:

```
effective_strip_hours = strips × half_life × (1 - 0.5^(duration / half_life)) / ln(2)
```

Or the simpler piecewise approximation:
- First half-life: `strips × half_life / 60` strip-hours
- Second half-life: `(strips/2) × half_life / 60` strip-hours
- Third half-life: `(strips/4) × half_life / 60` strip-hours
- Continue until duration exhausted

The piecewise model is easier to reason about and test. For a 240-min epee DE on 8 strips:
- Current model: 8 × 240/60 = 32 strip-hours
- Decay model: 8×80/60 + 4×80/60 + 2×80/60 = 10.67 + 5.33 + 2.67 = 18.67 strip-hours (~42% reduction)

### Constants

Add to `constants.ts`:

```
DE_STRIP_HALF_LIFE: Record<Weapon, number> = {
  EPEE: 80,
  FOIL: 80,
  SABRE: 40,
}
```

## Files Changed

| File | Change |
|------|--------|
| `src/engine/constants.ts` | Add `DE_STRIP_HALF_LIFE` |
| `src/engine/capacity.ts` | Update `estimateCompetitionStripHours` DE calculation to use decay model |
| `__tests__/engine/capacity.test.ts` | Update DE strip-hour expectations, add decay-specific tests |
| `METHODOLOGY.md` | Document DE strip decay model |

## What Doesn't Change

- Pool strip-hour estimation — pools finish all at once, no decay
- Day assignment penalties — they consume the improved estimates automatically
- Video strip-hour tracking — STAGED_DE_BLOCKS phases (R16, finals) are short enough that decay within a phase is negligible
