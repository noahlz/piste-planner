# Phase 4 — Matrix drag-drop editor (interactive repair)

Part of the four-phase Strip-Time Matrix Allocation Model rollout. See the
meta-plan at `~/.claude/plans/i-want-to-adjust-calm-rabin.md` for the full
vision and locked decisions. Depends on Phases 1–3; Phase 2's
`enumerateBoutDag` helper is required for the "split block into bouts"
operation.

## Context

The visx matrix viewer from Phase 3 is read-only. Real tournament
operators routinely make ad-hoc adjustments on the day of: moving an
event's R16 onto a freed video strip, splitting a stuck DE block across
strips, etc. This phase makes the matrix the primary post-scheduler
**editing surface**, with engine-side validation enforcing the
non-negotiable constraints.

Phase 4 is the most ambitious and most open-ended phase. The phase plan
proposes a milestone breakdown so the work can ship incrementally rather
than as a single big-bang.

## Milestone breakdown (proposed)

### Milestone 4a — Move and resize on a single allocation
- Click and drag an allocation rectangle to move in time (snap to 5-min grid).
- Click and drag the right edge to resize duration.
- Validation: no overlap on the same strip; cannot cross day boundary.
- Visual: dashed outline on drag, red outline on invalid drop with tooltip explaining why.
- Undo/redo on a single edit.

### Milestone 4b — Cross-strip move with type compatibility
- Drag an allocation onto a different strip row.
- Validation: video-required allocations may only land on `video_capable=true` strips.
- Visual: forbidden target rows highlighted on hover.

### Milestone 4c — Split DE block into per-bout rectangles
- Right-click (or context-menu) on a DE block → "Split into bouts".
- Uses Phase 2's `enumerateBoutDag` to break the block into one rectangle per bout, each labeled with round and bout index.
- After splitting, individual bouts can be moved/resized independently subject to parent-bout precedence.
- "Recombine" action collapses bouts back into a single block if their layout is contiguous on one strip.

### Milestone 4d — Pool atomicity guard
- Pool blocks for the same event are treated as a contiguous bank.
- Moving any one of them moves all of them as a group (preserving relative strip indices and start time).
- Cannot resize an individual pool block; only the whole bank.

### Milestone 4e — Apply to store and re-derive ScheduleResult
- "Apply changes" button persists edited `strip_allocations` back to the Zustand store.
- Recompute `ScheduleResult` summaries (`pool_start/end`, `de_start/end`, `de_total_end`, etc.) from the new allocation timestamps.
- Recompute `ref_requirements_by_day` via `peakConcurrentStrips`.
- Mark the schedule as "edited" with a badge in the UI.

### Milestone 4f — Bottleneck re-evaluation
- After apply, re-run the bottleneck detector on the edited schedule.
- New violations are surfaced as warnings; the user can accept them as `AcceptedWarning` entries.

## Scope (cross-cutting concerns)

### Validation engine (`src/engine/editValidation.ts` — new)
Pure functions that take a proposed `StripAllocation[][]` change and return
`ValidationError[]`:
- `validateNoOverlap(strip_allocations)` — sweep-line per strip.
- `validateVideoConstraint(strip_allocations, strips)` — every allocation with `requires_video=true` lands on `strips[i].video_capable=true`.
- `validateBoutPrecedence(strip_allocations, bout_dag)` — for any bout-level allocation, both parent bouts' end_time ≤ this bout's start_time.
- `validatePoolAtomicity(strip_allocations, schedule)` — all pool allocations for an event share start_time and end_time.
- `validateDayBoundary(strip_allocations, config)` — every allocation falls within `[dayStart(day), dayEnd(day)]`.
- Returns granular errors so the UI can highlight specific bars.

### Drag-drop infrastructure
- Decision to make during execution: hand-rolled SVG drag handlers vs. a library like `react-dnd` or `@use-gesture/react`. Recommendation: `@use-gesture/react` for low-friction drag binding without committing to a full DnD library.
- Snap-to-grid logic: every drag delta rounds to the nearest 5-min slot in time and to the nearest strip row in y.

### Undo/redo
- Stack of `{ before: StripAllocation[][], after: StripAllocation[][], description: string }` snapshots, one per applied edit.
- Keyboard shortcuts: `Cmd-Z` / `Cmd-Shift-Z`.

### State model
- The matrix component holds local edit state (uncommitted changes).
- `scheduleResultsEdited` is the persisted version on the store after "Apply changes".
- Strict and Fluid baselines remain on the store unchanged for comparison.

## Files to modify (summary)

- `src/engine/editValidation.ts` (new)
- `src/components/ScheduleMatrixVisx.tsx` (extended with drag handlers)
- `src/components/ScheduleMatrixEditor.tsx` (new wrapper with toolbar, undo/redo)
- `src/store/store.ts` (`scheduleResultsEdited`, edit actions)
- `package.json` (add `@use-gesture/react` if chosen)
- `__tests__/engine/editValidation.test.ts` (new)
- `__tests__/components/ScheduleMatrixEditor.test.tsx` (new)
- `METHODOLOGY.md` (brief mention of editor as a post-scheduler tool)

## Reused functions and primitives

- `peakConcurrentStrips` for ref-demand recompute.
- `enumerateBoutDag` (Phase 2) for the split-into-bouts operation.
- `findAvailableStripsInWindow` is *not* used for editing (the user is the
  allocator); validation uses overlap detection instead.

## Acceptance per milestone

| Milestone | Acceptance |
|-----------|------------|
| 4a | Drag a DE block to a different time, save, reopen — change persisted; invalid drop (overlap) shows red outline and is rejected. |
| 4b | Drag a video-only block to a non-video strip — shows red outline; non-video block can move freely. |
| 4c | "Split into bouts" on a 256-bracket DE block produces N rectangles with correct round labels; moving a child bout violating parent precedence shows red outline. |
| 4d | Move one pool block — all sibling pool blocks for the same event move together. Resize attempt on a single pool block is disabled. |
| 4e | "Apply changes" updates the store; the read-only viewer reflects the edited schedule. |
| 4f | Re-running the bottleneck detector on an edited schedule surfaces any new conflicts as warnings. |

## Verification

```
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1
pnpm dev
# open a B-scenario, perform a representative repair, confirm save/reload
```

A representative manual test script is captured at the bottom of this
plan when the work is picked up.

## Risks

- **Scope creep**: drag-drop editors expand in scope quickly. Treat each
  milestone as an independent ship-able feature.
- **State synchronization**: edited allocations diverge from the engine's
  `ScheduleResult` until "Apply changes" is hit. Make this divergence
  visible (badge, color cue) to avoid confusion.
- **Validation performance**: revalidating the entire schedule on every
  drag tick may be expensive on B6/B8. Validate only the affected strip
  and its neighbors during drag; full validation on drop.
- **Bout DAG correctness**: the split-into-bouts feature relies on Phase
  2's DAG being accurate. Add cross-validation tests that
  `enumerateBoutDag` produces a topological order whose precedence
  matches real bracket structure.
- **Browser compatibility**: drag events behave differently across
  Firefox/Safari/Chrome. Smoke-test all three.

## Out of scope

- Multi-block selection and group drag.
- Conflict auto-resolution suggestions.
- Templated repair patterns ("collapse all video stages").
- Mobile / touch-screen drag.
- Collaborative editing.

## Notes for the executing session

- No pre-written code in this plan. Implementation during execution.
- User runs commits manually.
- This phase is the right candidate for a milestone-based execution: ship
  4a behind a feature flag, gather feedback, then 4b, etc.
- After each milestone, dispatch `react-code-reviewer` and
  `test-quality-reviewer` agents per project methodology.
