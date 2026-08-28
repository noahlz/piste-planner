_Piste Planner_ is a USA Fencing tournament schedule planner. Computes pool rounds, DE brackets, strip assignments, and referee allocations for multi-day tournaments (NACs, RYCs, etc.).

@.specify/memory/constitution.md

## Technology

React + TypeScript + Vite. UI: shadcn/ui (Radix), Tailwind CSS v4, Zustand. Testing: Vitest + React Testing Library.

## Structure

- `src/engine/` — pure scheduling engine (no UI, no state). Types in `types.ts`, constants in `constants.ts`. Time values are minutes-from-midnight.
- `src/store/` — Zustand store. `buildConfig.ts` bridges store state to engine types.
- `src/components/` — React UI with wizard and single-page layouts.
- `__tests__/` — mirrors `src/`. Factories in `__tests__/helpers/factories.ts`.
- `specs/` — Spec Kit features. `docs/design/` — cross-phase design and backlog.

## Commands

```bash
timeout 120 pnpm --silent test > ./tmp/test.log 2>&1                     # all tests
timeout 120 pnpm --silent vitest run path/to/file > ./tmp/test.log 2>&1  # single file
timeout 180 pnpm exec tsc -b > ./tmp/tsc.log 2>&1                        # typecheck
timeout 120 pnpm --silent lint > ./tmp/lint.log 2>&1                     # lint
```

Read logs only on failure.

## Glossary

Tournament types: NAC (North American Cup), ROC (Regional Open Circuit), RYC (Regional Youth Circuit), RJCC (Regional Junior-Cadet Circuit), SYC (Super Youth Circuit).

## MCP Tools

ts-morph MCP `tsconfigPath`: use `./tsconfig.app.json`, not `tsconfig.json`.

## Methodology

Execute `tasks.md` with `/speckit-implement`, one subagent per task.
