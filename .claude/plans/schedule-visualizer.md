# Schedule Visualizer — Standalone SVG Tool

## Dependency

This plan depends on **Phase A of `2026-04-23-concurrent-scheduler.md`** (the interval-list strip allocation data model). The visualizer reads `state.strip_allocations: StripAllocation[][]` to render strip occupancy. Do not begin this plan until Phase A has shipped and `scheduleAll` exposes strip allocations in its return value.

## Context

A visual Gantt timeline makes strip contention, day over-packing, and scheduling gaps immediately obvious — far cheaper to read than raw JSON output. The visualizer is a standalone tool in `src/tools/` that generates SVG strings from schedule data. Integration tests use it to emit one SVG per scenario to `tmp/`.

The visualizer is rendering-only. It does not modify engine state or behavior. It consumes:

- `schedule: Record<string, ScheduleResult>` — per-event phase timestamps
- `state.strip_allocations: StripAllocation[][]` — per-strip interval list (from Phase A)
- `config: TournamentConfig`, `competitions: Competition[]`, `bottlenecks: Bottleneck[]`

---

## Files to Create / Modify

| Action | File |
|--------|------|
| Modify | `src/engine/scheduler.ts` (or wherever `scheduleAll` lives) — return `strip_allocations` alongside `schedule`/`bottlenecks` |
| Create | `src/tools/scheduleRenderer.ts` |
| Modify | `__tests__/engine/integration.test.ts` |

No changes to `scheduleOne.ts`, `phaseSchedulers.ts`, or any allocation-site code. The data the visualizer needs is already populated by Phase A.

---

## Task 1: Expose `strip_allocations` from `scheduleAll`

Phase A populates `state.strip_allocations` during scheduling. The current `scheduleAll` discards `state` after returning `schedule` + `bottlenecks` + `ref_requirements_by_day`. Expose the strip allocations on the return shape so the visualizer (and any future consumer) can read them.

Suggested return shape (additive — existing fields unchanged):

```ts
{
  schedule: Record<string, ScheduleResult>,
  bottlenecks: Bottleneck[],
  ref_requirements_by_day: RefRequirementsByDay,
  strip_allocations: StripAllocation[][],   // NEW
}
```

No new types or transforms required. The visualizer derives a per-event view internally when it needs to draw Gantt rows:

```ts
// inside scheduleRenderer.ts
function stripUsageForEvent(
  event_id: string,
  strip_allocations: StripAllocation[][],
): { strip_index: number; phase: Phase; start: number; end: number }[] {
  const out = []
  for (let strip_index = 0; strip_index < strip_allocations.length; strip_index++) {
    for (const a of strip_allocations[strip_index]) {
      if (a.event_id === event_id) {
        out.push({ strip_index, phase: a.phase, start: a.start_time, end: a.end_time })
      }
    }
  }
  return out
}
```

---

## Task 2: Create `src/tools/scheduleRenderer.ts`

Pure function. Takes schedule data, returns SVG string. No file I/O. Lives in `src/tools/` so it can be used by tests, CLI scripts, or the UI.

### Signature

```ts
export function renderScheduleSVG(
  label: string,
  schedule: Record<string, ScheduleResult>,
  strip_allocations: StripAllocation[][],
  config: TournamentConfig,
  competitions: Competition[],
  bottlenecks: Bottleneck[],
): string
```

### SVG Layout

- **Canvas width:** 1400px
- **Left margin:** 180px (labels)
- **Timeline width:** 1180px
- **Gantt row height:** 26px, gap 4px → 30px per event
- **Strip row height:** 20px, gap 2px → 22px per strip (only strips with allocations on that day)
- Per-day section: Gantt panel stacked above strip panel, separated by a 16px gap
- **Inter-day gap:** 40px between day sections
- **SVG height:** computed dynamically from content

### Structure (top to bottom), per day

1. **Header:** scenario label, `N scheduled / M total`, error count.
2. **Per-day pair of panels** (one pair per day that has at least one scheduled event):
   - **Day header bar** with label ("Day 1").
   - **Gantt panel** — one row per competition on that day, sorted by `pool_start`.
     - Time axis tick marks at every 30 min (HH:MM labels).
     - Each row: colored phase blocks + competition ID label in left margin.
   - **Strip panel** — one row per strip that has at least one allocation on that day.
     - Filter out strips with zero same-day allocations to keep the SVG bounded (80 strips × 22px = 1760px otherwise).
     - Strip label in left margin (`S1`, `S2`… or `V1` for `config.strips[i].video_capable`).
     - Colored blocks showing which competition occupies each strip at each time.
     - Same time axis as the Gantt panel above.
     - **Pod grouping (optional, post-MVP):** if Phase B of the concurrent scheduler is shipped, color the left edge of each strip block by `pod_id` so refs-per-pod is visible at a glance.
3. **Failed events section** (if any): gray text list of unscheduled competition IDs, deduplicated by `competition_id` (multiple ERROR bottlenecks can exist per failed event).

### Time → X coordinate

Use the existing `dayStart(d, config)` and `dayEnd(d, config)` helpers from `types.ts`. Do NOT reimplement — the fallback logic differs from the `DAY_START_MINS`/`DAY_END_MINS` clock-face values.

```ts
import { dayStart, dayEnd } from '../engine/types.ts'

const dStart = dayStart(day, config)
const dEnd   = dayEnd(day, config)
const scale  = timelineWidth / (dEnd - dStart)
const x = (t: number) => leftMargin + (t - dStart) * scale
```

### Phase colors

| Phase | Color |
|-------|-------|
| `POOLS` (incl. `FLIGHT_A` / `FLIGHT_B`) | `#4a90d9` (blue) |
| `DE_PRELIMS` | `#e8a838` (amber) |
| `DE` (single-stage) | `#e06b3f` (orange) |
| `DE_ROUND_OF_16` | `#e06b3f` (orange) |
| `DE_FINALS` | `#c0392b` (crimson) |
| `DE_FINALS_BRONZE` | `#8e44ad` (purple) |

Label each block with the phase abbreviation if the block is wide enough (> 30px): `POOL`, `DE`, `R16`, `FIN`, `BRZ`.

Competition ID label goes in the left margin, right-aligned, same row baseline.

### Strip panel data source

Derive per-event usage from `strip_allocations` via the helper sketched in Task 1. Each `(strip_index, phase, start, end)` tuple maps directly to a colored block in the strip panel. Use the competition's phase color from the table above.

### Relaxation / error indicators

- If `schedule[id].constraint_relaxation_level > 0`: draw a small orange triangle on the left edge of the pool block.
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
  strip_allocations,
  config,
  competitions,
  bottlenecks,
)
writeFileSync(`tmp/B1-Feb2026NAC.svg`, svg, 'utf8')
```

`strip_allocations` comes from the destructured `scheduleAll` return value (Task 1 added it).

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

- 7 SVG files created in `tmp/`.
- Each SVG opens in a browser without errors.
- B1 shows events across multiple days with visible phase blocks.
- Strip panel shows only strips that were actually used (not all 80).
- Concurrent events (post Phase C of the scheduler) appear as parallel blocks across different strips at the same time — this is the visual confirmation that concurrent scheduling is working.
- All 7 integration tests still pass (exit code 0).
