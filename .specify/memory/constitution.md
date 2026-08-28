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

**The user owns what lands.** No agent, subagent, or skill step runs `git push`,
`merge`, `rebase`, `reset --hard`, or branch deletion, and none makes the commit
that closes a feature.

- Read-only git – `status`, `diff`, `log`, `show`, `rev-parse` – is unrestricted
  for agents and subagents.
- **Inside a git worktree**, subagents commit incrementally to that worktree's
  own branch. Those commits are the working record: drift counts, before and
  after numbers, and deliberate corrections belong in their messages.
- **Outside a worktree**, agents do not commit. Checkpoints appear in `tasks.md`
  marked "(user commits)" and the user makes them with `commit-with-costs`, so
  session cost metrics reach the commit trailers.

Each feature picks one flow and names it in its `plan.md`:

| Flow | Subagents commit | The user's `commit-with-costs` runs on |
|---|---|---|
| Worktree | yes, on the worktree branch | the squash-merge into `main` |
| Root | no | each `tasks.md` checkpoint |

The two do not mix within one feature. `commit-with-costs` commits staged
changes and cannot land a branch, so work already committed inside a worktree
has nothing left to stage at the root.

## Governance

This constitution governs every feature under `specs/`. Evaluate `plan.md`'s
Constitution Check gate against these principles before design work and again
after it. Record any violation in that plan's Complexity Tracking table with the
simpler alternative that was rejected and why.

Amendments require a version bump and a note of what changed. `CLAUDE.md` and
rules under `~/.claude` remain authoritative for anything this document does not
cover.

- 1.1.0 (2026-08-27): commands moved to `CLAUDE.md`, git ownership promoted to
  its own section.
- 1.2.0 (2026-08-28): git ownership rewritten. Read-only git is permitted, and
  subagents may commit inside a worktree. `commit-with-costs` is named as the
  mechanism for root checkpoints, and each feature now declares a worktree or
  root flow. This section is the rule's only home – `plan.md` and `tasks.md`
  point at it rather than restating it.

**Version**: 1.2.0 | **Ratified**: 2026-08-27 | **Last Amended**: 2026-08-28
