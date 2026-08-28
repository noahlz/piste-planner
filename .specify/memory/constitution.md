# Piste Planner Constitution

## Core Principles

### I. Pure Engine Core

`src/engine/` is a pure library. Functions take inputs as arguments and return
values — no global state, no singletons, no store reads, no React imports. Time
is minutes from midnight. UI and state depend on the engine, never the reverse.
`buildConfig.ts` is the only bridge from store state to engine types.

Every result must be reproducible from its config alone. A snapshot test, a
shared URL, and a running app have to agree.

### II. Test-First

Write tests before the implementation they describe, run them to confirm they
fail for the stated reason, then make them pass. Behavior changes update their
tests in the same task, never afterwards.

Dispatch `test-quality-reviewer` after any task that adds or edits tests, and
`react-code-reviewer` after any task touching React.

### III. Behavior Drift Is Measured, Not Assumed

Run any change to engine math, constants, or allocation against the B1–B8 drift
ledger. Review and explain the snapshot diff before accepting it. A drop in
scheduled event count on any scenario halts the task until the cause is
identified and recorded.

The engine outputs a schedule, not a boolean. Regressions hide as plausible
numbers, and sequential refactors compound drift that no single diff reveals.

### IV. Bounded Computation

No unbounded loops. Every iteration is a direct computation or carries an
explicit max-iteration guard that fails loudly. An algorithm that cannot
converge reports failure, never spins.

### V. Erasable TypeScript

`erasableSyntaxOnly` is on. Use `as const` objects with derived union types —
never enums, namespaces, or parameter properties.

## Planning Artifacts

Each unit of work is a Spec Kit feature in `specs/<nnn>-<short-name>/`:
`spec.md` (what and why), `plan.md` (technical approach), `tasks.md` (ordered,
checkable work), and `research.md` when decisions need their reasoning recorded.

- Plans and tasks state intent and expected behavior, never pre-written
  implementation code. Code is written during execution.
- Cross-phase design that outlives one feature lives in `docs/design/`. Specs
  reference it rather than restating it.
- Each fact has exactly one home. A second copy is a pointer, never a restatement.

## Git Ownership

**The user owns what lands.** The final commit and the push are theirs, made with
`commit-with-costs` so session cost metrics reach the trailers. Everything before
that is the agents' to record.

- **Read-only git is unrestricted** — `status`, `diff`, `log`, `show`,
  `rev-parse`, `merge-base` — for the controller and for subagents. Review diffs
  and drift comparisons depend on it.
- **Feature work happens in a git worktree on its own branch, and agents commit
  there.** Commit at the checkpoints `tasks.md` marks. Those messages carry the
  evidence the drift ledger demands: before/after event counts when the gate
  trips, and any deliberate correction to a headline output.
- **No agent pushes, and no agent makes the closing commit.** When the branch is
  ready, stop and hand it to the user.
- No `merge`, `rebase`, branch deletion, `reset --hard`, or `clean -fdx` unless
  the user asks for it by name. No commits straight to `main`.

## Governance

This constitution governs every feature under `specs/`. Evaluate `plan.md`'s
Constitution Check gate against these principles before design work and again
after it. Record any violation in that plan's Complexity Tracking table with the
simpler alternative that was rejected and why.

Amendments require a version bump and a note of what changed. `CLAUDE.md` and
rules under `~/.claude` remain authoritative for anything this document does not
cover.

- 1.2.0 (2026-08-28): git ownership relaxed — read-only git unrestricted, agents
  commit checkpoints on a worktree branch, the user still owns the closing
  commit and the push.
- 1.1.0 (2026-08-27): commands moved to `CLAUDE.md`, git ownership promoted to
  its own section.

**Version**: 1.2.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-28
