# Implementation Plan: Team-Event Cut Default

**Branch**: `008-team-event-cut` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-team-event-cut/spec.md`

## Summary

The store derives a competition's default cut from its category alone. Team
events therefore inherit their category's percentage cut, the engine's team
rule rejects that as a BINDING error, and one BINDING error empties the whole
tournament's schedule. Two of the eight reference tournaments and four of the
ten shipped templates place nothing today.

The fix is one branch on event type in the store's default-config helper. Its
cost is everywhere else: two parity pins move, one parity exception is deleted
and one rewritten, the classification document behind them is amended, the
rail's "default" marker has to learn the same branch or it will call every new
team event user-modified, and the live driver has to actually apply a
team-bearing template rather than assume one works.

`src/engine/` is not touched, and the drift ledger is not at risk — its own
factory has had this branch since it was written, which is precisely why the
ledger never saw the bug ([research.md D2](./research.md)).

## Technical Context

**Language/Version**: TypeScript 5 with `erasableSyntaxOnly`, React 19, Vite

**Primary Dependencies**: Zustand (store), Radix/shadcn + Tailwind v4 (UI),
Playwright-core (live smoke driver). No new dependency.

**Storage**: None. State lives in the store and is shared through a URL
fragment. Times are minutes from midnight throughout.

**Testing**: Vitest + React Testing Library.
`__tests__/store/appPathParity.test.ts` is the app-path gate,
`__tests__/engine/driftLedger.test.ts` the behavior-drift gate,
`scripts/smoke.mjs` the live gate.

**Target Platform**: Browser SPA, GitHub Pages base path `/piste-planner/`.

**Project Type**: Single project — pure engine library plus React app.

**Performance Goals**: None. One extra branch on a per-competition code path.

**Constraints**:
- `git diff --stat main -- src/engine/` must be **empty** at the end.
- The drift ledger snapshot must be byte-identical.
- Suite baseline at `main`: **1274 passed / 55 files**. Every delta accounted
  for, and the suite run **twice** — a single green run is not evidence in
  this repo.
- No number in this feature is predicted. Every count is measured against the
  running code before it is written down.

**Scale/Scope**: One store helper, one component's default marker, one parity
test's pins and exception table, one classification document, one smoke-driver
step, one backlog section. Eight reference tournaments, ten templates.

## Constitution Check

*GATE: evaluated before Phase 0 and again after Phase 1 design. Both passes
below.*

| Principle | Assessment |
|---|---|
| **I. Pure Engine Core** | Holds. The engine is not modified, and the change moves the store *toward* the engine's stated rule rather than working around it — the store stops emitting a config the engine already rejects. `buildConfig.ts` remains the only bridge. The new helper is store-side and pure ([research.md D1](./research.md)). |
| **II. Test-First** | The parity re-pin is written first, at the measured target numbers, and must fail against unfixed code for the stated reason (B2 and B8 placing 0) before the store branch is written. The catalogue contract test ([contracts/competition-defaults.md](./contracts/competition-defaults.md)) is likewise written red. |
| **III. Drift Is Measured** | The ledger runs before and after and must be byte-identical. It is not *expected* to move — no engine code, no ledger fixture change — which is exactly why an unexpected diff would be the most important signal in this feature. A diff halts the task. |
| **IV. Bounded Computation** | No loop added or altered. |
| **V. Erasable TypeScript** | No enum, namespace, or parameter property. The existing `as const` union types carry the event-type check. |
| **VI. Verified Live** | Four of ten templates go from an empty board to a real schedule — a user-visible change, so `scripts/smoke.mjs` is repaired **in place** in the task that makes it true: a team-bearing template applied and its placed count asserted at a measured number. The ROC step already there stays. *(2026-08-31 amendment: measured at two, not four — the driver's chosen template is one of the two, so unaffected. See [research.md D5](./research.md).)* |
| **Planning Artifacts** | `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/competition-defaults.md`, `quickstart.md`, then `tasks.md`. The defect's record stays in `docs/design/backlog.md` and the isolation evidence in `specs/006-day-axis-parity/parity-exceptions.md`; both are referenced and amended, never copied. |
| **Git Ownership** | **Worktree flow.** Work happens in `.claude/worktrees/008-team-event-cut` on branch `008-team-event-cut`. Subagents commit to that branch at the checkpoints `tasks.md` marks. No push, no merge, no rebase, no amend. The user lands it with `git merge --no-ff --no-commit` completed by `commit-with-costs`. |
| **Orchestration** | The orchestrator dispatches and writes no code beyond a 1–5 line edit. Sonnet takes the mechanical work (the branch, the marker, the test edits, the document amendments). Opus takes the two judgment tasks: attributing B8's residual, and the measure-then-pin passes where a wrong number stays green. The smoke repair loop is dispatched, never run in the orchestrator. |

**Result: PASS**, both before and after Phase 1. No entry in Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/008-team-event-cut/
├── plan.md              # This file
├── research.md          # Phase 0 — D1–D7
├── data-model.md        # Phase 1 — which defaults key off what
├── contracts/
│   └── competition-defaults.md   # Phase 1 — the store→engine default-validity invariant
├── quickstart.md        # Phase 1 — how to verify end to end
├── checklists/
│   └── requirements.md  # Spec quality checklist
├── handoff.md           # Phase 5 output
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
src/
├── engine/                          # UNCHANGED. Verified by an empty diff.
│   ├── validation.ts                #   cut-on-team, the rule being satisfied — read only
│   └── constants.ts                 #   DEFAULT_CUT_BY_CATEGORY — read only
├── store/
│   ├── competitionDefaults.ts       # NEW — the catalogue→default derivation, one home (D1)
│   └── store.ts                     # defaultConfigForId reads the helper ← changed
└── components/sections/
    └── CompetitionOverrides.tsx     # default marker reads the same helper ← changed

__tests__/
├── store/
│   ├── appPathParity.test.ts        # B2 and B8 re-pinned, exceptions rewritten ← changed
│   ├── competitionDefaults.test.ts  # NEW — the catalogue-wide contract
│   └── store.test.ts                # a team event's defaults asserted ← changed
├── components/sections/
│   └── CompetitionOverrides.test.tsx # NEW — the default marker for a team row
└── engine/driftLedger.test.ts       # UNCHANGED; run as the gate

scripts/
└── smoke.mjs                        # team-bearing template step ← changed, in place

specs/006-day-axis-parity/
└── parity-exceptions.md             # B2's entry closed, B8's rewritten ← changed

docs/design/
└── backlog.md                       # §Team events block their whole tournament closed ← changed
```

**Structure Decision**: one new store module rather than an inline branch,
because three call sites need the same answer and the third is a React
component that must not import the store's private internals
([research.md D1](./research.md)). No new directory.

## Approach

Five movements. `tasks.md` orders them and marks the commit points.

### 1. Measure the before, and write the red tests

Record what each of the eight reference tournaments and each of the ten
templates places **today**, from the running code. That list is the
before-column of the whole feature and belongs in a commit message and in
`quickstart.md`'s baseline, not in anyone's memory.

Then move the parity pins to their targets and watch the suite fail with B2
and B8 at 0. Add the catalogue contract test and watch it fail naming the team
events. Nothing is fixed in this movement.

### 2. Branch on event type

Give the derivation one home in the store, have `defaultConfigForId` read it,
and confirm the three creation routes (`selectCompetitions`, `addCompetition`,
`applyPreset`) all go through it. Individual defaults must be value-for-value
unchanged — asserted, not assumed.

Verification for this movement:
- The parity check goes green at the re-pinned numbers.
- The drift ledger snapshot is **byte-identical** (constitution III gate).
- `git diff --stat main -- src/engine/` is empty.

### 3. Attribute B8's +1, then write the exception that survives

B8 reaches 53 against the ledger's 52. 006 measured that number and
deliberately left the residual unattributed, so this feature measures it
rather than inheriting the guess. The isolation runs `parity-exceptions.md`
already establishes for B4 and B6 are the method: hold the config fixed, swap
one per-competition default at a time, and see which one moves 53 to 52.

The outcome decides one line of the suite. `appPathParity.test.ts` asserts
today that every exception's `closedBy` contains `004 US4`. If the residual is
attributable to 004's defaults, that assertion stands unchanged. If it is not,
the assertion is what has to move, not the attribution
([research.md D4](./research.md)).

### 4. Make the default marker agree

The overrides table compares against the category default to decide whether to
print "default". Once the store branches, that comparison is wrong for every
team event from the moment it is created. It reads the same helper.

### 5. Make the live app place a team-bearing tournament

Add one step to `scripts/smoke.mjs`: apply a template that contains team events
(`NAC Cadet/Junior` is the smallest), auto-schedule, and assert a measured
placed count. Repaired in place, with the measured number and the date beside
it, per constitution VI. Then close the backlog section and write the handoff.

## Risks

| Risk | Handling |
|---|---|
| The drift ledger diffs. | Halt. Nothing in this feature should be able to move it — no engine change, no fixture change. A diff means the change reached further than intended; find out where before doing anything else. |
| B8 does not reach 53. | The pin is whatever it measures, not 53. 53 is 006's measurement on 006's code; re-measure and, if it differs, record both numbers and which change between the two features accounts for it. Do not force it. |
| B8's +1 turns out **not** to be a 004 US4 default. | Then B8's exception cannot claim it is. Rewrite the `closedBy` assertion to require a named closing feature rather than that specific string, and say plainly in `parity-exceptions.md` that the residual is unattributed. An honest open exception beats a tidy wrong one. |
| A count moves on a tournament with no team events. | Halt. The change cannot reach them. If one moves, the helper is being applied where it should not be. |
| The catalogue contract test fails for a reason other than the cut. | Likely: `fencer_count: 0` is a structural error for every default config. That is real but it is not this feature's — scope the contract to the defaults the store *chooses* rather than the ones the user supplies, and record anything else it surfaces in the backlog instead of fixing it here. |
| The smoke step fails on a locator, not on the behavior. | Dispatched, not run in the orchestrator, and repaired in place — the driver's selectors are the accumulated record of corrections against the real DOM (constitution VI). |
| Backlog closure conflicts at merge. | Expected and stated up front ([research.md D6](./research.md)). The section exists only on `004-p3-workbench-shell`. The handoff tells the user which side to keep. |
| Scope creep into 004's US4. | The other three exceptions stay exactly as they are. This feature closes one cause, not the parity gap. |

## Out of Scope

Carried from [spec.md](./spec.md): B4's `strips_allocated` and B6's regional
cut override and DE staging (all 004 US4), converging the drift ledger's
factory with the app, advisory-vs-binding validation wiring, and any change to
`src/engine/`.
