# Piste Planner Constitution

## Core Principles

### I. Pure Engine Core
- Keep `src/engine/` pure: no global state, singletons, store reads, or React imports.
- Express time as minutes from midnight.
- Bridge store to engine only through `buildConfig.ts`.
- Make every result reproducible from its config alone.

### II. Test-First
- Write failing tests first, confirm the failure reason, then implement.
- Update tests in the same change as the behavior they cover.
- Dispatch `test-quality-reviewer` after test edits and `react-code-reviewer` after React edits.

### III. Behavior Drift Is Measured, Not Assumed
- Run `__tests__/engine/driftLedger.test.ts` after any change to engine math, constants, or allocation, and follow its header.

### IV. Bounded Computation
- Give every loop a direct bound or a max-iteration guard that fails loudly.

### V. Erasable TypeScript
- Use `as const` objects with derived unions – never enums, namespaces, or parameter properties.

### VI. The App Is Verified Live
- End every user-visible change with `scripts/smoke.mjs` passing against the running app (`live-smoke` skill).
- Update the driver in the same change that reshapes the UI – never rewrite it from scratch.
- Dispatch iterative verification, such as live-smoke locator repair, to a subagent.

## Planning and Implementation
- Choose your own approach to planning, task breakdown, and delegation.
- Describe intent and expected behavior in plans, not pre-written implementation code.
- Keep cross-phase design in `docs/design/` and point to it rather than restating it.

## Git Ownership
- Never `push`, `merge`, `rebase`, `reset --hard`, delete branches, or make the commit that closes a piece of work – the user owns `main`.
- Run read-only git freely.
- Commit freely inside a git worktree, on its own branch, recording drift counts and deliberate corrections in the messages.
- Never commit outside a worktree – the user commits there with `commit-with-costs`.
- Merge branches into `main` only via the user's `merge-with-costs` – never squash.

### The merge is checked too, not just the branch
- Run `tsc -b`, `lint`, and the full suite on the merged tree before `merge-with-costs`, and fix red first.
- Turn any predicted collision with another branch into a concrete check or test, not handoff prose.

## Governance
- Defer to `CLAUDE.md` and `~/.claude` rules for anything not covered here.
