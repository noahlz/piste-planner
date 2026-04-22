# Stage 6: Remaining Scheduling Density Failures

## Context

Stage 5 (commit `69c604be`) added capacity-aware day expansion and Phase 2 load balancing to `src/engine/dayColoring.ts`. The day-assignment layer is now as good as it's going to get without deeper architectural changes. **The remaining scheduling failures in B5, B7, and several other scenarios are NOT caused by day assignment** — they are caused by within-day resource contention that the current scheduler cannot resolve.

This document captures the diagnosis and lays out hypotheses to test in the next session.

## Results After Stage 5

Run baseline and current results:

```bash
timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1
grep -E "events \|.*scheduled" ./tmp/test.log
```

| Scenario | Pre-Stage-5 baseline | Post-Stage-5 | Stage 5 target | Met |
|---|---|---|---|---|
| B1 (Feb 2026 NAC, 4d/24 events) | 15 | 14 | no decrease | ✗ -1 |
| B2 (Nov 2025 NAC) | 10 | 11 | no decrease | ✓ +1 |
| B3 (Mar 2026 NAC Youth) | 5 | 7 | > 5 | ✓ |
| B4 (Jan 2026 SYC) | 9 | 9 | no decrease | ✓ |
| B5 (Jan 2026 SJCC, 3d/12 events) | 3 | 3 | ≥ 4 | ✗ |
| B6 (Sep 2025 ROC) | 17 | 17 | no decrease | ✓ |
| B7 (Oct 2025 NAC, 4d/18 events) | 4 | 4 | > 4 | ✗ |

Net: +2 scheduled across scenarios. B3 gain is the primary Stage 5 win.

## Diagnosis — What Blocks B5/B7

Ran diagnostic on B5 (12 JR/CDT events, 3 days, 60 strips, 8 video strips) — only 3 events scheduled, one per day. Every other event fails with:

```
DEADLINE_BREACH_UNRESOLVABLE: No resource window for <event> DE_ROUND_OF_16 on day <d>
DEADLINE_BREACH_UNRESOLVABLE: No resource window for <event> DE_PRELIMS on day <d>
DEADLINE_BREACH_UNRESOLVABLE: No resource window for <event> DE_FINALS on day <d>
```

**Interpretation:** the first event placed on each day consumes the available video-capable strips (8) through its STAGED DE phases (R16 → QF → SF → Finals serialized on video strips). Subsequent events on the same day cannot fit their own R16/Finals phases before day-end because the video strips are booked.

The day-assignment coloring now correctly spreads events across 3 days. It cannot help when *within* each day the scheduler can only fit one STAGED DE.

Same pattern blocks B7. Plausibly also the reason B1 with 4 days and DIV1 events cannot scale past 14.

## Where to Look in Code

- `src/engine/scheduleOne.ts` — per-event scheduling driver. Where `DEADLINE_BREACH_UNRESOLVABLE` likely originates.
- `src/engine/daySequencing.ts` — within-day event ordering. Currently determines who gets video strips first; may be naive.
- `src/engine/resources.ts` — `GlobalState`, resource allocation, snapshot/restore.
- `src/engine/de.ts` — DE phase planning (pool → R16 → finals time blocks).
- `src/engine/scheduler.ts` — master orchestrator and repair loop. Repair currently tries alternate *days* for failed events — it does not try re-sequencing within a day.

## Hypotheses for Stage 6

Ordered by plausibility / expected impact:

1. **Video-strip DE parallelism model is too serialized.** If R16 of event A and Prelims of event B could run simultaneously on different video strips, more events would fit. Check whether the current DE phase scheduler treats `video_strips_total` as a shared pool (parallel across events) or as exclusively owned by one event at a time.

2. **Day-sequencing heuristic may pick a poor leader.** When event A starts at 8am and owns the video strips through finals at 8pm, event B can't fit. A better sequencer might stagger: run A's pools 8–10am, hand off video to B's R16, then back to A for QF/SF. Requires phase-interleaving rather than full-event-at-a-time.

3. **Repair loop is too shallow.** When an event fails on day *d*, the repair loop only tries alternate days. It could also try different *sequencing positions* within the same day, or try relaxing the event's own video-policy (BEST_EFFORT → allow staged→single-stage fallback).

4. **B1 −1 regression specifically:** when chromaticN=3 and expansion to 4 days runs, Phase 2 spreads DIV1 events more thinly, but one event ends up on a day that now has a ref-shortage or strip-allocation clash it didn't have at 3 days. Could be fixed by gating expansion to only fire when the chromaticN-day distribution is genuinely over-packed, not just "capacity target says so". Likely needs the fill metric to be calibrated against actual scheduler success, not raw strip-hours.

## Files Modified in Stage 5 (for context)

- `src/engine/dayColoring.ts` — added `capacityPenalty` (exported), `CAPACITY_TARGET_FILL`, `MAX_EXPANDED_DAYS`, capacity-aware Phase 2 penalty, day expansion logic.
- `__tests__/engine/dayColoring.test.ts` — 5 new tests (expansion cap, chromatic floor, days_available suppression, load-balance, `capacityPenalty` ramp).

## Reproducing / Verifying Next Session

```bash
# Full suite (should be 702 passing)
timeout 180 pnpm --silent test > ./tmp/test.log 2>&1

# Integration only (read B-scenario counts from output)
timeout 120 pnpm --silent vitest run __tests__/engine/integration.test.ts > ./tmp/test.log 2>&1

# Debug B5 specifically — see bottleneck causes
# (temporarily add `describe.only` and console.log of bottlenecks in the B5 block;
#  the diagnostic code was removed but is easy to re-add — see Stage 5 debug commit history)
```

## Memory Notes (verified, carry forward)

- `.claude/settings.plugins.commit-with-costs.json` is configured for this repo (sessionId = `-Users-noahlz-projects-piste-planner`)
- User owns git commits; do not run `git` commands except as part of the `commit-with-costs` skill
- `pnpm`, not `npm`. Test output to `./tmp/test.log`, read only on failure
- ts-morph MCP: use `./tsconfig.app.json`
- Day/strip-hour model: `estimateCompetitionStripHours` (`src/engine/capacity.ts`) — models raw parallel work; under-predicts real scheduling capacity pressure by roughly 3×, which is why `CAPACITY_TARGET_FILL = 0.3`

## Suggested Starting Point for Next Session

1. Confirm the diagnosis: re-add the B5 bottleneck debug print, verify all 9 failures are `DEADLINE_BREACH_UNRESOLVABLE` on DE phases.
2. Read `scheduleOne.ts` and `daySequencing.ts` to understand how video strips are currently allocated across events within a day.
3. Propose a minimal change (probably in `daySequencing.ts` or the DE phase scheduler) that lets two events share video strips by interleaving phases.
4. Gate the B1 regression fix: either make Stage 5 expansion more conservative, or let it stand if the within-day fix recovers B1 to ≥15.
