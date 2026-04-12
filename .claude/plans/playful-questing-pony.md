# Improve Post-Scheduling Diagnostics

## Context

When events fail to schedule (22 of 24 in a typical NAC), users see generic "No resource window found" errors and a global "Minimum recommended strips: X" message. There's no breakdown by day, no distinction between pool vs DE failures, and no delta ("add N more"). The data needed for richer diagnostics already exists in `GlobalState` at failure time but isn't surfaced.

## Approach

Three layers of improvement, each independent and testable:

1. **Enrich `NO_WINDOW` failures** with a reason (strips / refs / time)
2. **Add per-day resource summaries** after scheduling completes
3. **Rewrite global recommendations** with delta messaging

No changes to `Bottleneck` interface shape — all enrichment goes through `message` strings and new `BottleneckCause` values.

---

## Tasks

### Task 1: Add BottleneckCause values

**File:** `src/engine/types.ts` (line ~157)

Add to the `BottleneckCause` const object:
- `DAY_RESOURCE_SUMMARY` — per-day strip/ref usage summary
- `NO_WINDOW_DIAGNOSTIC` — enriched failure reason when `earliestResourceWindow` returns NO_WINDOW

### Task 2: Enrich `NO_WINDOW` return type

**File:** `src/engine/resources.ts` (lines 18-20, 342-459)

Add a `NoWindowReason` type:
```
| { kind: 'STRIPS'; needed: number; available: number; earliest_free: number }
| { kind: 'REFS'; needed: number; available: number; earliest_free: number }
| { kind: 'TIME'; candidate: number; latest_start: number }
```

Extend `ResourceWindowResult`:
```
| { type: 'NO_WINDOW'; reason?: NoWindowReason }
```

Add a pure helper `diagNoWindowReason(...)` that determines the limiting factor from the last-known `stripFreeMax`, `tRefs`, `candidate`, and `latestStart`. Hoist `stripFreeMax` and `tRefs` to variables before the loop so they're available at the loop-exhaustion exit (line 458).

Update the 5 `return { type: 'NO_WINDOW' }` sites (lines 370, 379, 400, 407, 458) to include a `reason`.

### Task 3: Emit diagnostic bottlenecks before throw in `scheduleOne.ts`

**File:** `src/engine/scheduleOne.ts` (7 NO_WINDOW sites: lines 255, 290, 455, 513, 584, 623, 660)

Add a helper:
```typescript
function emitNoWindowDiagnostic(
  window: { type: 'NO_WINDOW'; reason?: NoWindowReason },
  competitionId: string,
  phase: Phase,
  state: GlobalState,
): void
```

Translates `window.reason` into a bottleneck with cause `NO_WINDOW_DIAGNOSTIC`, severity `INFO`, and a message like:
- `"MEN-DIV1-EPEE-IND pools: need 45 strips, 3 available on day 1, earliest free at 14:30"`
- `"WOM-JR-FOIL-IND DE: need 4 refs, 2 available on day 2, next release at 15:00"`
- `"MEN-CDT-SABRE-IND pools: candidate 17:00 exceeds latest start 16:00 on day 3"`

Call `emitNoWindowDiagnostic(window, ...)` before each existing `throw new SchedulingError(...)`.

### Task 4: Per-day resource summaries

**File:** `src/engine/scheduler.ts`

New pure function:
```typescript
export function postScheduleDayBreakdown(
  competitions: Competition[],
  config: TournamentConfig,
  state: GlobalState,
): Bottleneck[]
```

For each day 0..days_available-1:
- **Strip-hours**: use existing `dayConsumedCapacity(day, state, competitions, config)` from `capacity.ts`. Compare consumed vs available (`strips_total * DAY_LENGTH_MINS / 60`). Emit INFO/WARN bottleneck with cause `DAY_RESOURCE_SUMMARY`.
- **Ref demand**: count competitions assigned to this day from `state.schedule`, sum their peak pool ref demand. Compare to configured `referee_availability[day]`. Emit INFO/WARN bottleneck.

Only emit summaries for days that have at least one failed event (to avoid noise on successful days).

**File:** `src/engine/refs.ts` — export `peakPoolRefDemand` (line 63) and `peakDeRefDemand` (line 75), currently private.

Wire `postScheduleDayBreakdown` into `scheduleAll` after `postScheduleDiagnostics`.

### Task 5: Delta messaging in `postScheduleDiagnostics`

**File:** `src/engine/scheduler.ts` (lines 299-342)

Change strip message from:
> `Minimum recommended strips: 13 (configured: 4). Consider adding strips or enabling flighting.`

To:
> `Strips: need 13, have 4 — add 9 more (or enable flighting for large events).`

Change ref message from:
> `Minimum recommended refs: 8 three-weapon + 2 foil/epee (configured: 2). Add referees.`

To:
> `Refs: need 8 three-weapon + 2 foil/epee (10 total), have 2 — add 8 more.`

### Task 6: Tests

**Updated tests:**
- `__tests__/engine/scheduler.test.ts` — update 4 existing `postScheduleDiagnostics` message assertions to match new delta format

**New tests:**
- `__tests__/engine/resources.test.ts` — `NO_WINDOW` reason enrichment (STRIPS, REFS, TIME cases)
- `__tests__/engine/scheduler.test.ts` — `postScheduleDayBreakdown` (per-day summaries, severity logic, empty schedule)
- `__tests__/engine/scheduleOne.test.ts` or equivalent — `NO_WINDOW_DIAGNOSTIC` bottleneck emitted before ERROR

Run test-quality-reviewer agent after tests are written.

---

## Files Modified

| File | Changes |
|------|---------|
| `src/engine/types.ts` | 2 new BottleneckCause values |
| `src/engine/resources.ts` | `NoWindowReason` type, enriched `NO_WINDOW`, `diagNoWindowReason` helper |
| `src/engine/scheduleOne.ts` | `emitNoWindowDiagnostic` helper, 7 call sites updated |
| `src/engine/scheduler.ts` | `postScheduleDayBreakdown` function, delta messaging in `postScheduleDiagnostics`, wired into `scheduleAll` |
| `src/engine/refs.ts` | Export 2 existing private functions |
| `src/engine/capacity.ts` | No changes (already exports `dayConsumedCapacity`) |
| `__tests__/engine/scheduler.test.ts` | Updated + new tests |
| `__tests__/engine/resources.test.ts` | New NO_WINDOW reason tests |

## Verification

1. `pnpm --silent test` — all existing tests pass (updated message assertions)
2. Integration tests B1-B7 still pass with same scheduled/error counts (diagnostics are additive)
3. New tests cover: NO_WINDOW reason enrichment, per-day summaries, delta messaging
4. Inspect integration test bottleneck output to verify richer messages appear for failed events
