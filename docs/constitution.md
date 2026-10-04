# Piste Planner Constitution

## Core Principles

### I. Pure Engine Core
- Keep `src/engine/` pure: no global state, singletons, store reads, or React imports.
- Express time as minutes from midnight.
- Bridge store to engine only through `buildConfig.ts`.
- Make every result reproducible from its config alone.

### II. Test-First
- Write failing tests first, confirm the failure reason, then implement.
- Update tests in the same task as the behavior change.
- Dispatch `test-quality-reviewer` after test edits and `react-code-reviewer` after React edits.

### III. Behavior Drift Is Measured, Not Assumed
- Run `__tests__/engine/driftLedger.test.ts` after any change to engine math, constants, or allocation, and follow its header.

### IV. Bounded Computation
- Give every loop a direct bound or a max-iteration guard that fails loudly.

### V. Erasable TypeScript
- Use `as const` objects with derived unions – never enums, namespaces, or parameter properties.

### VI. The App Is Verified Live
- End every user-visible feature with `scripts/smoke.mjs` passing against the running app (`live-smoke` skill).
- Update the driver in the task that reshapes the UI – never rewrite it from scratch.

## Planning Artifacts
- Keep in-flight feature work in `specs/<nnn>-<short-name>/`. Planning method for new features: undecided.
- Write intent and expected behavior in plans, never implementation code.
- Put cross-phase design in `docs/design/` and point to it.
- Give each fact one home – other copies are pointers.

## Git Ownership
- Never `push`, `merge`, `rebase`, `reset --hard`, delete branches, or make a feature's closing commit – the user owns `main`.
- Run read-only git freely.
- Name one flow per feature in `plan.md`:

| Flow | Subagents commit | User finishes with |
|---|---|---|
| Worktree | yes, on the worktree branch, with drift counts and corrections in messages | `merge-with-costs` into `main` |
| Root | no | `commit-with-costs` at each `tasks.md` checkpoint marked "(user commits)" |

- Never squash.

### The merge is checked too, not just the branch
- Run `tsc -b`, `lint`, and the full suite on the merged tree before `merge-with-costs`, and fix red first.
- Write any predicted cross-feature collision as a task in the receiving feature's `tasks.md`.

## Orchestration & Model Roles
- Never write code as orchestrator beyond 1–5 line edits – dispatch to subagents.
- Dispatch on Sonnet, reserving Opus for complicated tasks.
- Dispatch iterative verification, including live-smoke locator repair.
- Stop after revising `tasks.md` or `plan.md` mid-implementation: record changes, hand back a resume prompt.
- Treat ticks, outcome annotations, Delivered status, and carried corrections as record-keeping, not re-planning.

## Governance
- Check `plan.md` against these principles before and after design, and log violations in Complexity Tracking with the rejected simpler alternative.
- Defer to `CLAUDE.md` and `~/.claude` rules for anything not covered here.
