# Engine Fixes B: Remove Saber Ref Fill-In

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the incorrect saber ref fill-in concept from the engine, store, and UI.

**Architecture:** Single deletion task that touches 7+ files across engine, store, and UI layers. Remove type definitions first, then follow TypeScript errors to clean up all references.

**Tech Stack:** TypeScript, Vitest, Zustand store, React component

**Prerequisite plans:** Plan A (straightforward wiring) — should be completed first so that the saber ref model is tested with the newly-wired constraints before we simplify it.

---

### Task 1: Remove saber ref fill-in concept

**What & Why:** The engine currently has a feature that lets foil/epee-only referees substitute for 3-weapon referees on saber events when saber refs are in short supply. This concept is wrong — it doesn't reflect how real tournaments work. Saber bouts require referees trained in saber-specific rules and conventions (right-of-way, attack/parry timing). A foil/epee-only ref cannot officiate a saber bout. If a tournament doesn't have enough 3-weapon refs, that's a real staffing problem the tournament organizer needs to solve before the event — not something the scheduler should silently paper over. The fill-in feature creates false confidence: the schedule looks feasible, but on tournament day you'd have unqualified refs on saber strips. Removing this forces the scheduler to surface the actual problem as a validation error, giving organizers a clear signal to hire more 3-weapon refs.

**Files to modify (removal):**
- `src/engine/types.ts` — remove `allow_saber_ref_fillin` from `TournamentConfig`, `saber_fillin_used` from `CompetitionScheduleResult`, `SABER_REF_FILLIN` from `BottleneckCause`
- `src/engine/resources.ts` — remove `allocateRefsForSaber()`, inline simple saber-only allocation
- `src/engine/refs.ts` — remove any fill-in logic references
- `src/engine/scheduleOne.ts` — replace `allocateRefsForSaber()` calls with direct `allocateRefs()` for saber
- `src/store/store.ts` — remove `toggleSaberFillin` action, `allow_saber_ref_fillin` from `DayRefConfig`
- `src/store/buildConfig.ts` — remove fill-in flag from config building
- `src/components/sections/RefereeSetup.tsx` — remove fill-in checkbox UI
- Tests: `__tests__/engine/resources.test.ts`, `__tests__/engine/scheduleOne.test.ts`, `__tests__/store/store.test.ts`, `__tests__/components/WizardShell.test.tsx` — remove fill-in test cases

**Approach:** This is a "delete and fix compilation" task. Remove the type definitions first, then let TypeScript errors guide the remaining cleanup.

- [x] **Step 1: Remove type definitions**

Remove `allow_saber_ref_fillin` from `TournamentConfig` and `DayRefConfig` (via store types). Remove `saber_fillin_used` from `CompetitionScheduleResult`. Remove `SABER_REF_FILLIN` from `BottleneckCause`.

- [x] **Step 2: Fix engine compilation**

Work through TypeScript errors:
- In `resources.ts`: remove `allocateRefsForSaber()`. Where saber ref allocation is needed, call `allocateRefs()` directly with the saber ref count. If saber refs are insufficient, return `INSUFFICIENT` (which the caller handles as a scheduling failure).
- In `scheduleOne.ts`: replace `allocateRefsForSaber()` calls with direct saber ref allocation.
- In `refs.ts`: remove any fill-in references.

- [x] **Step 3: Fix store compilation**

- Remove `toggleSaberFillin` from store.
- Remove `allow_saber_ref_fillin` from `DayRefConfig` and from `buildConfig.ts`.

- [x] **Step 4: Fix UI compilation**

- Remove fill-in checkbox from `RefereeSetup.tsx`.

- [x] **Step 5: Fix tests**

- Remove fill-in-specific test cases.
- Update test factories if they set `allow_saber_ref_fillin`.
- Ensure remaining saber-related tests pass with direct allocation.

- [x] **Step 6: Run full test suite**

Run: `timeout 120 pnpm --silent test > ./tmp/test.log 2>&1`

- [ ] **Step 7: Commit**

---

## Post-Plan B

Update METHODOLOGY.md:
- Move saber ref fill-in from "Known Engine Limitations and Open Bugs" to "Resolved" section.
- Remove any references to `allow_saber_ref_fillin` or saber fill-in as a feature.
