_Piste Planner_ is USA Fencing tournament schedule planner. Computes pool rounds, DE brackets, strip assignments, and referee allocations for multi-day tournaments (NACs, RYCs, etc.).

## Technology 

React + TypeScript + Vite. UI: shadcn/ui (Radix), Tailwind CSS v4, Zustand. Testing: Vitest + React Testing Library.

## Structure

- `src/engine/` — pure scheduling engine (no UI, no state). Types in `types.ts`, constants in `constants.ts`. Time values are minutes-from-midnight.
- `src/store/` — Zustand store. `buildConfig.ts` bridges store state to engine types.
- `src/components/` — React UI with wizard and single-page layouts.
- `__tests__/` — mirrors `src/`. Factories in `__tests__/helpers/factories.ts`.

## Commands

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1          # all tests
timeout 120 pnpm --silent vitest run path/to/file > ./tmp/test.log 2>&1  # single file
```

Read `./tmp/test.log` only on failure.

## Glossary

Tournament types: NAC (North American Cup), ROC (Regional Open Circuit), RYC (Regional Youth Circuit), RJCC (Regional Junior-Cadet Circuit), SYC (Super Youth Circuit).

OR framing: strips are queues, referees are workers. During pools each pool is work; during DEs each bout is work. Strips are general-purpose (pools or DEs).

## Rules

- `as const` objects, NOT TypeScript enums (`erasableSyntaxOnly`)
- Engine functions are pure — no global state, no singletons
- No unbounded loops — use direct computation or max-iteration guards

## Methodology

- test-quality-reviewer agent after adding/editing tests
- react-code-reviewer agent after adding/editing React code
- Sub-agent development when executing plans
