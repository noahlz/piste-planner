# Schedule Visualizer — Standalone SVG Tool

## Context

The DSatur day-assignment pipeline (Stages 1-3) improved scheduling density but several scenarios still have failures (B5 regression, B3/B7 stall). Debugging requires reading raw JSON test output. A visual Gantt timeline makes strip contention, day over-packing, and scheduling gaps immediately obvious.

The visualizer is a standalone tool in `src/tools/` that generates SVG strings from schedule data. Integration tests use it to emit one SVG per scenario to `tmp/`.

`ScheduleResult` records strip counts but not which specific strips were allocated. Task 1 adds per-allocation strip index tracking. The SVG uses a Gantt-style chart (one row per event, time on X-axis) plus a strip-occupancy panel using the new data.

---

## Files to Create / Modify

| Action | File |
|--------|------|
| Modify | `src/engine/types.ts` |
| Modify | `src/engine/scheduleOne.ts` |
| Create | `src/tools/scheduleRenderer.ts` |
| Modify | `__tests__/engine/integration.test.ts` |

---

## Task 1: Track Strip Usage in Engine

### `src/engine/types.ts`

Add a new type and field to `ScheduleResult`:

```ts
export interface StripUsage {
  strip_index: number
  phase: Phase
  start: number   // absolute minutes
  end: number     // absolute minutes
}
```

Add to `ScheduleResult`:
```ts
strip_usage: StripUsage[]
```

Initialize to `[]` in the result shell in `scheduleOne.ts`.

### `src/engine/scheduleOne.ts`

After each `allocateStrips()` call, push to `result.strip_usage`. The strip indices and time bounds are already computed by `earliestResourceWindow()`.

**CRITICAL: Retry loop safety.** `scheduleCompetition` has a retry loop (lines 186-245) that snapshots/restores `GlobalState` on deadline failures. The `result` object is a local variable NOT covered by `snapshotState`/`restoreState`. Array `push()` accumulates across retries. **Clear `result.strip_usage = []` at the top of each loop iteration** (line 187, right after `const snapshot = snapshotState(state)`).

**Allocation sites and phase mapping:**

- **Non-flighted pools** (`allocateNonFlightedPools`, after line 510): `window.stripIndices` -> `Phase.POOLS`, times `T` to `poolEnd`
- **Flight A** (`allocateFlightedPools`, after line 309): `windowA.stripIndices` -> `Phase.FLIGHT_A`, times `Ta` to `flightAEnd`
- **Flight B** (`allocateFlightedPools`, after line 358): `windowB.stripIndices` -> `Phase.FLIGHT_B`, times `Tb` to `flightBEnd`
- **DE single-stage** (`executeSingleBlockDe`, after line 574): `window.stripIndices` -> `Phase.DE`, times `deStart` to `deEnd`
- **DE prelims** (`executeThreeBlockDe`, after line 646): `prelimsWindow.stripIndices` -> `Phase.DE_PRELIMS`, times `prelimsStart` to `prelimsEnd`
- **DE R16** (`executeThreeBlockDe`, after line 686): `r16Window.stripIndices` -> `Phase.DE_ROUND_OF_16`, times `r16Start` to `r16End`
- **DE finals** (`executeThreeBlockDe`, after line 722): `finWindow.stripIndices` -> `Phase.DE_FINALS`, times `finStart` to `finEnd`
- **Bronze** (`allocateBronzeBout`, after line 809): `[bronzeIdx]` -> `Phase.DE_FINALS_BRONZE`, times `finalsStart` to `finalsEnd`. **Must push inside `allocateBronzeBout` itself** — `bronzeIdx` is a local variable not accessible at the call sites in `executeSingleBlockDe`/`executeThreeBlockDe`. The early return on line 804 (no free strip) naturally skips the push.

All helper functions (`allocateNonFlightedPools`, `allocateFlightedPools`, `executeSingleBlockDe`, `executeThreeBlockDe`, `allocateBronzeBout`) need `result` passed as a parameter — they already receive it.

No changes to existing fields. Existing tests need no updates (new field defaults to `[]`).

---

## Task 2: Create `src/tools/scheduleRenderer.ts`

Standalone tool — pure function, takes schedule data, returns SVG string. No file I/O. Lives in `src/tools/` (not `__tests__/helpers/`) so it can be used by tests, CLI scripts, or the UI.

### Signature

```ts
export function renderScheduleSVG(
  label: string,
  schedule: Record<string, ScheduleResult>,
  config: TournamentConfig,
  competitions: Competition[],
  bottlenecks: Bottleneck[],
): string
```

### SVG Layout

- **Canvas width:** 1400px
- **Left margin:** 180px (labels)
- **Timeline width:** 1180px
- **Gantt row height:** 26px, gap 4px -> 30px per event
- **Strip row height:** 20px, gap 2px -> 22px per strip (only strips with usage)
- Per-day section: Gantt panel stacked above strip panel, separated by a 16px gap
- **Inter-day gap:** 40px between day sections
- **SVG height:** computed dynamically from content

**Structure (top to bottom), per day:**

1. **Header:** scenario label, `N scheduled / M total`, error count
2. **Per-day pair of panels** (one pair per day that has at least one scheduled event):
   - **Day header bar** with label ("Day 1")
   - **Gantt panel** — one row per competition on that day, sorted by pool_start
     - Time axis tick marks at every 30 min (HH:MM labels)
     - Each row: colored phase blocks + competition ID label in left margin
   - **Strip panel** — one row per strip that has at least one usage record on that day (filter out unused strips to keep SVG reasonable — 80 strips at 22px = 1760px otherwise)
     - Strip label in left margin (S1, S2... or V1 for `config.strips[i].video_capable`)
     - Colored blocks showing which competition occupies each strip at each time
     - Same time axis as Gantt panel above
3. **Failed events section** (if any): gray text list of unscheduled competition IDs, deduplicated by `competition_id` (multiple ERROR bottlenecks can exist per failed event)

### Time -> X coordinate

**Use the existing `dayStart(d, config)` and `dayEnd(d, config)` helpers from `types.ts`.** Do NOT reimplement — the fallback logic (`d * DAY_LENGTH_MINS`) differs from `DAY_START_MINS`/`DAY_END_MINS` clock-face values.

```ts
import { dayStart, dayEnd } from '../engine/types.ts'

const dStart = dayStart(day, config)
const dEnd   = dayEnd(day, config)
const scale  = timelineWidth / (dEnd - dStart)
const x = (t: number) => leftMargin + (t - dStart) * scale
```

### Phase colors

| Phase field(s) | Color |
|----------------|-------|
| `pool_start` / `pool_end` (or flight_a + flight_b combined) | `#4a90d9` (blue) |
| `de_prelims_start` / `de_prelims_end` | `#e8a838` (amber) |
| `de_start` / `de_end` (SINGLE_STAGE) | `#e06b3f` (orange) |
| `de_round_of_16_start` / `de_round_of_16_end` | `#e06b3f` (orange) |
| `de_finals_start` / `de_finals_end` | `#c0392b` (crimson) |
| `de_bronze_start` / `de_bronze_end` | `#8e44ad` (purple) |

Label each block with the phase abbreviation if the block is wide enough (> 30px): `POOL`, `DE`, `R16`, `FIN`, `BRZ`.

Competition ID label goes in the left margin, right-aligned, same row baseline.

### Strip panel data source

`result.strip_usage` from Task 1. Each `StripUsage` entry maps directly to a colored block: `strip_index` -> row, `[start, end]` -> x-span, `phase` -> color (same color map as Gantt). Use the competition's phase color for the block.

### Relaxation / error indicators

- If `constraint_relaxation_level > 0`: draw a small orange triangle on the left edge of the pool block.
- Failed events: competitions where `schedule[c.id]` does not exist AND at least one ERROR-severity bottleneck exists for that `competition_id`. Deduplicate by competition ID.

---

## Task 3: Wire into Integration Tests

### Imports to add

```ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderScheduleSVG } from '../../src/tools/scheduleRenderer.ts'
```

### Directory setup

Add at top of `describe('Realistic tournament integration', ...)`:
```ts
beforeAll(() => { mkdirSync('tmp', { recursive: true }) })
```

### Pattern to add inside each `it()` block, after `assertScheduleIntegrity()`

```ts
const svg = renderScheduleSVG(
  'B1-Feb2026NAC',
  schedule,
  config,
  competitions,
  bottlenecks,
)
writeFileSync(`tmp/B1-Feb2026NAC.svg`, svg, 'utf8')
```

All required variables (`schedule`, `bottlenecks`, `competitions`, `config`) are in scope — `schedule`/`bottlenecks` destructured inside the `it()` callback, `competitions`/`config` at `describe` scope.

### Scenario filename slugs

| Scenario | Slug |
|----------|------|
| B1: Feb 2026 NAC | `B1-Feb2026NAC` |
| B2: Nov 2025 NAC | `B2-Nov2025NAC` |
| B3: Mar 2026 NAC | `B3-Mar2026NAC` |
| B4: Jan 2026 SYC | `B4-Jan2026SYC` |
| B5: Jan 2026 SJCC | `B5-Jan2026SJCC` |
| B6: Sep 2025 ROC | `B6-Sep2025ROC` |
| B7: Oct 2025 NAC | `B7-Oct2025NAC` |

---

## Verification

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1
ls tmp/*.svg
open tmp/B1-Feb2026NAC.svg
```

Check:
- 7 SVG files created in `tmp/`
- Each SVG opens in a browser without errors
- B1 shows events across multiple days with visible phase blocks
- Strip panel shows only strips that were actually used (not all 80)
- All 7 integration tests still pass (exit code 0)
