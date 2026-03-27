# Bugs & Improvements Backlog

Discovered during UI implementation. Items for future sessions.

---

## Bugs

### BUG-1: Scheduler throws instead of degrading gracefully on resource exhaustion
- **Severity:** High
- **File:** `src/engine/scheduler.ts`
- **Repro:** RJCC with 30 competitions (174 total pools), 24 strips, 3 days → `scheduleAll` throws "No resource window found for Y12-W-SABRE-IND pools on day 0"
- **Expected:** Scheduler should schedule what it can and emit ERROR bottlenecks for competitions it couldn't place, not throw.
- **Impact:** UI shows a catch-all error instead of a partial schedule with actionable diagnostics.
- **Status: Resolved 2026-03-27** — scheduler now returns partial results with ERROR bottlenecks

---

## Improvements

### IMP-1: Pre-scheduling capacity warning in analysis
- **Context:** 174 pools / 3 days = 58 pools/day vs 24 strips. Analysis should flag this before the user clicks "Generate Schedule".
- **Suggestion:** Add a Pass 0 to `initialAnalysis` that computes total pools per day and warns when pools/day > strips_total.
- **Status: Resolved 2026-03-27** — Pass 0 capacity warning added to initialAnalysis

### IMP-2: Auto-populate referee counts on template/competition change
- **Context:** Currently refs default to 0 and require manual "Suggest" click. Could auto-suggest when competitions or strips change.
- **Priority:** Low — "Suggest" button works for now.
- **Status: Resolved 2026-03-27** — refs auto-populate when competitions or strips change; manual edits preserved
