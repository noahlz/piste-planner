# Piste Planner

- Gap closure plan: `.claude/plans/2026-03-27-gap-closure.md`
- Execution plan: `.claude/plans/2026-03-25-engine-execution-plan.md`

## Test Safety

- Prefix test commands with `timeout 120` — engine tests complete in <2s; a hang means a code bug (unbounded loop)
- Redirect output: `pnpm --silent test > ./tmp/test.log 2>&1` — read log only on failure

## Code Rules

- Types use `as const` objects, NOT TypeScript enums (erasableSyntaxOnly compatibility)
- Engine functions are pure — no global state, no singletons
- Never write unbounded loops; prefer direct computation or add max-iteration guards

## Methodology

- Use the test-quality-reviewer agent after adding or editing tests (scoped to the new / changed tests).
- Use the react-code-reviewer agent after adding or editing React code
- Use sub-agent development (and agent teams, if possible) when executing plans.
