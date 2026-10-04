# State of the project – 2026-10-04

Input for the session that plans the work needed to finish Piste Planner. Measured on
`main` at `0ab5bd2dc9`, after the repo cleanup. Read-only audits by five subagents.
Delete this file once its contents are folded into a plan.

## Baseline

- `tsc -b` clean, lint clean, 76 test files / 1747 tests green.
- Drift ledger B1–B8: 24 / 24 / 24 / 17 / 12 / 45 / 18 / 52. App-path parity: 17.
- Features 001–012 are delivered and their spec folders removed (`git show 0ab5bd2dc9:specs/…`).
- 013 (workbench redesign): phases 0–7 merged. Only phase 8 (close-out) remains.

## 1. Finish 013 (phase 8)

Next prompt: `specs/013-workbench-redesign/sessions/S11.md` (its header warns its paths
predate the phase-7 merge).

| Task | State | Note |
|---|---|---|
| T044 | open | Polish against the mockup, styling only. Ends with the owner's verdict on screenshots. |
| T037 | open | `competition-planner-workbench.md` still cites `concurrentScheduler.ts:183` and `buildEventStates` exclusion. §Virtualization has no 013 note. |
| T038 | open | Full retired-surface grep (quickstart §2 plus `scripts/` terms) never recorded. |
| T039 | open, **pass condition wrong** | Requires "boot places 24 of 24". Every smoke run since T014 reads `19 placed · 5 unplaced` (lane-packer overflow, handoff finding 9). Decide what 24/24 means before dispatching. |
| T040 | open | Full check ×2 with exact test-count delta. Dropped-test record lives only in `sessions/S5.md:135-138`. |
| T041 | open, owner | Print check by hand. |
| T042 | partial | Backlog closures done in the cleanup. Remaining: record what 013 deliberately did not fix. |
| T043 | partial | handoff.md lacks T041/T044 verdicts, drift before/after table, per-task rows, T038–T040 records, merge instructions. spec.md still reads Draft. |

Owner decisions before close-out (handoff.md):
- Finding 6 (:145) – no control returns `de_mode_override` to null. Default pill, revert, or accept.
- Finding 13 (:264) – selecting a placed block is mouse-only.
- Finding 25 (:426) – `Canvas.tsx` reads placements live for the pin badge (FR-042). Fix, or carry to backlog.
- Finding 16 (:328) – late finish uses block ends, not `de_total_end`. Accept and correct data-model §9, or reverse.
- Finding 7 (:150) – unreachable team-cut coercion loop in `buildConfig.ts`, marked backlog but no entry exists.

## 2. Backlog triage (`backlog.md`, now 890 lines, open items only)

Needed to call the product finished, in suggested order:

1. **`Bottleneck` gets a rule id and `subjects`** (merged with the message-text gate). S–M, engine type change. Prerequisite for 3.
2. **Drift-ledger factory converges with the store's per-type rules** (B4 18-vs-17 folded in). M, deliberate constitution III re-baseline, so later engine fixes are measured against what the app runs.
3. **Feature 014 – manual placement**: crossover check on hand placements (largest gap, Move day can create a violation today), plus which referee peak the footer shows (store sum vs engine clamp). L.
4. **Engine correctness, one drift review each**: DE prelims gets ~1/32 of bracket time (`de.ts:64,70-71`), day-end overrun fails instead of warning (`concurrentScheduler.ts:1146-1150`), Div1 cut 20% → 25% per 2025-26 rules (`constants.ts:170-174`). Each S in code.
5. **Default days per template** so the three K₄ templates don't break their own hard rules at 3 days. S.
6. **Re-run the engine on parameter change**, with a delayed working indicator. M, UI only, independent of 1–5.

Owner decisions with no spec yet: the 8 time-of-day weights (gates runtime re-colouring and METHODOLOGY divergence), vet co-day serialization, entry caps, strip non-monotonicity warning, youth pool calibration data, real templates and the 2026-27 Elite split.

After the weights decision: METHODOLOGY doc edits, delete `daySequencing.ts` and dead constants, add a calibration scenario.

Not needed to finish: global-settings-as-config, what-if mode, the unbounded fixture-comment audit, experimental mode (already rejected in 012).

Entries whose text went stale when 013 removed `GlobalOverrides`: "METHODOLOGY.md and the engine have diverged", "Global settings", "What-if scenario mode". Rewrite during planning.

Unverified: a shared URL with `fencer_count` ≤ 1 may reach unguarded `computePoolStructure` calls in `analysis.ts:117,140`.

## 3. Housekeeping left

- `competition-planner-workbench.md` §Roadmap is stale (marked so). Rewrite in planning.
- `README.md` is minimal: no dev URL (`/piste-planner/` base), no lint/tsc/smoke. `.claude/launch.json` uses port 5175 while scripts default to 5173.
- Bare `research.md D#` / `data-model.md §` citations in src and tests were left as is. Most mean 013's files, but some mean deleted features.
- `.claude/settings.local.json` carries stale allow entries.
