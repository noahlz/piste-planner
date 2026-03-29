# Engine Fixes C: Resource Precondition Validation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface actionable error messages when strip/ref counts don't meet minimums, instead of opaque "no valid day found" errors.

**Architecture:** Single task adding upfront validation checks to `validateConfig()`. Pure engine change — no store or UI modifications.

**Tech Stack:** TypeScript, Vitest

**Prerequisite plans:** Plan B (saber fill-in removal) — the saber ref model is simpler after removal, so validation logic doesn't need to account for fill-in.

---

### Task 1: Add resource precondition validation

**What & Why:** When the scheduler fails to place an event, it currently throws a generic "no valid day found" error. This is technically accurate but useless to a tournament organizer trying to figure out what went wrong. The real cause is often simple: not enough strips or refs configured for the event's pool round. For example, a 210-fencer event needs 30 pools running simultaneously, so it needs at least 30 strips and 30 refs — but the organizer only configured 24. The scheduler grinds through all days, fails on every one, and reports an opaque error. By validating resource preconditions upfront (before scheduling even starts), we can surface messages like "Men's Junior Epee requires 30 strips for pools but only 24 are configured" — giving the organizer an immediate, actionable fix instead of a cryptic failure.

**Files:**
- Modify: `src/engine/validation.ts` — add upfront strip/ref minimum checks
- Test: `__tests__/engine/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
1. A competition needs 10 strips for pools (ceil(70/7)=10 pools) but config has only 8 strips → ERROR: "Event X requires Y strips for pools but only Z total strips configured."
2. A saber event needs 15 saber refs (15 pools) but config has only 10 saber refs on a given day → ERROR: "Event X requires Y saber refs for pools but only Z configured."
3. Config has adequate resources → no validation errors from these checks.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement upfront validation**

In `validateConfig()`, after existing competition-level checks:
1. For each competition, compute `n_pools = computePoolStructure(fencer_count).n_pools`.
2. Check `n_pools <= config.strips_total` — if not, emit ERROR.
3. Check ref availability: for saber events, check that at least one day has `saber_refs >= n_pools`. For foil/epee, check `foil_epee_refs >= n_pools` on at least one day.
4. If `de_mode === STAGED_DE_BLOCKS && de_video_policy === REQUIRED`, check `video_strips_total >= de_round_of_16_strips` (this check already exists partially — extend it).

- [ ] **Step 4: Run tests to verify pass**

- [ ] **Step 5: Commit**

---

## Post-Plan C

Update METHODOLOGY.md:
- Move "Not yet implemented: Resource precondition validation" from "Known Engine Limitations and Open Bugs" to "Resolved" section.
- Document the upfront validation checks (strips ≥ max pools, refs ≥ pools per weapon type) and the actionable error messages they produce. Add to the validation/preconditions section.
