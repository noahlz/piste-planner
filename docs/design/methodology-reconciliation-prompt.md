# Dispatch prompt: reconcile METHODOLOGY.md with the engine

> **Executed 2026-09-05.** The analysis this brief asks for now exists at
> [`methodology-reconciliation.md`](./methodology-reconciliation.md). This file
> is kept for provenance – do not re-run it against a changed tree without
> re-reading the output first.

**What this file is.** A ready-to-run brief for a fresh session. Written
2026-09-02 against `main` at `2a18984b8d`. It is a prompt, not a design
document — the analysis it asks for is the design document, and it does not
exist yet.

**How to use it.** Start a fresh session in this repo and say: *"Read
`docs/design/methodology-reconciliation-prompt.md` and execute it."* Give it a
strong model and a large budget; this is a whole-codebase read with real
computation in it, not a lookup.

**What it is not.** Not a spec, and it deliberately does not create a
`specs/` feature directory. Part 3 ends in a question the product owner
answers, and the feature is sized only after that answer.

**Related.** The open backlog entry this expands on is
[`backlog.md`](./backlog.md) § "METHODOLOGY.md and the engine have diverged,
and the doc is the spec". The workbench UI redesign is a separate track
(roadmap row 009) and is out of scope here.

---

You are analyzing the Piste Planner repo (React + TypeScript + Vite, USA Fencing
tournament scheduler). Read `CLAUDE.md` and `.specify/memory/constitution.md`
first. **Produce analysis, not code.** Do not edit `src/`. The single deliverable
is a written document (see Deliverable below).

## The framing, and it is load-bearing

`METHODOLOGY.md` (947 lines, repo root) was **hand-written by the product owner
as the specification for the engine.** It is not documentation generated from the
code. Where the document and the engine disagree, the default presumption is
that **the engine is wrong** and must change.

That is a presumption, not a rule. Some of the document is itself wrong —
superseded by measurement, unsourced against USA Fencing policy, or describing an
architecture that was deliberately replaced. Your job is to reach a defended
verdict per divergence, not to apply either direction mechanically.

**Do not follow `docs/design/reassessment-2026-09-01.md` §5.** It proposes
rewriting the document to describe the engine as built. That framing was wrong and
has been retracted. It is still useful as a list of *where* to look; treat every
verdict in it as unreliable.

Start from `docs/design/backlog.md` § "METHODOLOGY.md and the engine have
diverged, and the doc is the spec". It has a prior pass with file:line evidence.
**Verify its claims rather than inheriting them** — at least two assertions in the
document that preceded it turned out to be wrong on inspection.

## Part 1 — Scrutinize the specification itself

Do this **before** the reconciliation, because a divergence from an incoherent
rule is not worth a verdict. Read `METHODOLOGY.md` end to end as a specification
document and find:

1. **Internal contradictions.** Rules that appear in two sections with different
   severities, thresholds, or scopes. Some are already known (DIV1↔CADET listed
   as both hard and soft; the flighting section contradicting Runtime
   Decomposition) — find the rest, and check Appendix A against the prose
   everywhere, since the appendix is where stale numbers hide.

2. **Infeasible or over-constrained criteria — treat this as the most valuable
   output.** The engine empties whole schedules today, and the suspicion is that
   parts of the spec cannot be satisfied simultaneously on realistic inputs.
   Concretely:
   - **Run a satisfiability check on the hard constraints.** Group 1 mandatory
     separations (`GROUP_1_MANDATORY`, `constants.ts`) plus same-population blocks
     form a conflict graph whose *clique number* is a hard lower bound on days
     needed. Compute that lower bound for each of the ten `TEMPLATES` in
     `catalogue.ts` and compare it against `MAX_EXPANDED_DAYS = 4` in
     `dayColoring.ts` and against the 2–4 day range the spec's Inputs section
     states. Report every template where the spec's own hard constraints cannot
     be met inside the spec's own day range. This is a computation, not an
     opinion — write a throwaway script and run it.
   - **Worst-case rules that ignore available slack.** `indiv-team-same-day`
     (`validation.ts:272-310`) computes a hypothetical same-day duration and
     fires as a BINDING ERROR even on a 4-day tournament where the scheduler is
     free to separate the pair. Find every rule that reasons about a hypothetical
     rather than the actual assignment. Ask in each case whether the spec intends
     a *feasibility* claim or a *preference*.
   - **Severity inflation.** One BINDING error discards the entire tournament's
     schedule (`concurrentScheduler.ts:186-204`). Enumerate every rule that can
     reach BINDING and judge whether the spec really intends "no schedule at all"
     as the consequence. Two of ten templates show an empty board today.
   - **Unfalsifiable or unmeasurable criteria.** `CAPACITY_TARGET_FILL` was swept
     across six values and every one produced byte-identical schedules
     (`dayColoring.ts:70-84`). A specified constant that cannot change any output
     is either inert or the spec is describing a mechanism that does not exist.
     Find the others.
   - **Over-precision without basis.** Penalty weights are specified to one
     decimal. Ask which have any empirical or policy source behind them and which
     are invented precision. `docs/design/backlog.md` § "Policy tables are stale
     against USA Fencing 2025-26 changes" has the sourcing work done so far.

3. **Criteria you would recommend relaxing, with the relaxation stated.** For each
   infeasible or over-strict item, propose the specific weakening — demote to
   WARN, scope to the finding's `subjects`, condition on `days_available`, delete
   — and say what it costs.

## Part 2 — The reconciliation ledger

For every divergence between the document and the engine, one row:

| Field | Content |
|---|---|
| Spec claim | Section + what the document requires |
| Engine behavior | file:line + what actually happens |
| Verdict | `ENGINE-WRONG` / `DOC-WRONG` / `BOTH-WRONG` / `DECISION-REQUIRED` |
| Evidence | Why, citing source. A code comment recording a rejected experiment is strong evidence for DOC-WRONG |
| Cost | Rough size, and whether it moves B1–B8 drift output |

Known starting points, all to be re-verified:

- Five documented rules are implemented faithfully in code **nothing calls**,
  beside divergent implementations that run (`crossover.ts:176` proximityPenalty,
  `constants.ts:633` CAPACITY_PENALTY_CURVE, `constants.ts:471`
  SOFT_SEPARATION_PAIRS, `de.ts:148` perBoutDuration, `analysis.ts:22`
  suggestStripCount). Determine for each whether reconnecting is correct or
  whether the live path is the deliberate replacement.
- 14 of 19 `PENALTY_WEIGHTS` have no reader. Audit per key with
  `grep -rn "PENALTY_WEIGHTS\.<KEY>" src/`.
- Constraint relaxation: the spec defines four levels, `dayColoring.ts:560`
  implements one. Consider whether levels 1–2 are even *meaningful* under DSatur,
  where soft edges never block a color.
- `src/engine/daySequencing.ts` is unreachable. The spec's §Within-Day
  Age-Descending Order names its functions as the implementation. **Determine
  whether the documented rule survived Phase D under `applyCrossEventEdges` /
  `compareNodes`, or whether only its implementation was replaced and the rule was
  silently lost.** Do not delete the file — it is the evidence.

## Part 3 — The blocking decision

Eight penalty weights are time-of-day rules ("both starting at 8:00 AM", "within
30 minutes"). Day assignment picks days before times exist; the concurrent
scheduler picks times but allocates greedily rather than minimizing penalties.
They fell into the seam when Phase D split one scheduler into two.

Lay out the options — score them in the concurrent scheduler; add a bounded
re-color pass against realized times (shared machinery with the backlog's
"Runtime failure is terminal" item); or retire them from the spec — with cost and
risk for each. **Give a recommendation. Do not decide it.** The product owner
answers this, and it determines whether the follow-up feature is a documentation
job or a scheduler rewrite.

## Ground rules

- Verify by reading source and by running things. `timeout 300 pnpm --silent test`,
  `pnpm exec tsc -b`. The drift ledger is `__tests__/engine/driftLedger.test.ts`
  (scenarios B1–B8); constitution III governs any change to engine math.
- Distinguish throughout what you **measured** from what you **read** from what you
  **inferred**. Say which. Prior passes on this codebase have been wrong by
  asserting inferences as measurements.
- The live day-assignment path is `dayColoring.ts` (DSatur), not `dayAssignment.ts`
  — though the latter is not dead, `saberPileupPenalty` is live.
- Out of scope: all UI, `src/components/`, manual placement, and the workbench
  redesign. Engine and specification only.

## Deliverable

`docs/design/methodology-reconciliation.md`, structured as Parts 1–3 above,
ending with a recommended sequence: which fixes are independent and cheap, which
need the blocking decision first, and which need their own drift review. Do not
create a `specs/` feature directory — that follows the decision.
