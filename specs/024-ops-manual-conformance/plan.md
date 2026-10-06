# 024 2026-27 Operations Manual conformance – plan

> **For agentic workers:** the orchestrator writes no code. Each task below is
> a chain of subagent dispatches, or workflow phases when ultracode is on.
> Start from [`sessions/S1.md`](./sessions/S1.md).

**Goal:** the engine plans a tournament the way USA Fencing's 2026-27
Operations Manual and the 2026-27 Athlete Handbook do. That covers pool and DE
times, the 9:00–19:00 day with a 22:00 hard end, video replay, the same-day
rules and the default cuts. The drift ledger moves once per rule group, on
purpose, with every moved number explained.

**Spec:** `METHODOLOGY.md` as amended on this branch and approved by the owner:

| Commit | What it amends |
|---|---|
| `6a4107b710` | the 2026-27 manual – times, day, video, same-day rules, cuts, Appendix B |
| `989dff758a` | source S8 moves to the 2026-27 Athlete Handbook |
| `9e44fdd90c` | Y8 10-touch DEs become a departure. The Y8 Developmental Format is not modelled |
| `29739a44bf` | team events plan no video and run Single Stage. A bracket of 2 has no DE |

The spec is never edited to match code. A task that finds the spec wrong, or
silent on something the code needs, halts to the owner.

**Why:** [`backlog.md` §The engine's rules predate the 2026-27 Operations
Manual](../../docs/design/backlog.md#the-engines-rules-predate-the-2026-27-operations-manual)
and §Policy tables (the RYC and Y14 cuts).

**Roadmap:** [`competition-planner-workbench.md` row
024](../../docs/design/competition-planner-workbench.md). It runs after 015 and
before 016–019 and 023, which are measured against it.

**Branches:** the spec amendments, this plan and two new backlog entries sit
on `024-ops-manual-conformance` (worktree
`.claude/worktrees/024-ops-manual-conformance`, cut from `main` at
`7975e4efea`). Implementation runs in its own worktree,
`024-ops-manual-conformance-impl`, cut from `main` after this branch merges.

## Baseline (measured 2026-10-05)

`src/` and `__tests__/` on this branch equal `main` `7975e4efea`.

- 78 files / 1830 tests pass. `tsc -b` and lint are clean.
- Drift ledger snapshot SHA-256
  `a4a71e333c7749f46790b88e0dbd4d0a1a929549b4b2359290c193f37d596d19`.
- Ledger B1–B8 scheduled: 24 / 24 / 24 / 18 / 12 / 40 / 18 / 53, equal to the app
  path on all eight. Floors are the same numbers.
- ERRORs: 0 / 0 / 0 / 12 / 0 / 14 / 0 / 0.
- `stripRecommendation`: 48 / 70 / 68 / 76 / 32 / 65 / 64 / 51.
- `refRecommendation` (three-weapon / foil-épée): 120/46, 160/10, 146/8, 108/0,
  68/4, 33/1, 156/28, 110/30.
- Live smoke Suggest for ROC Div1A/Vet, NAC Youth, NAC Vet/Div1/Junior and NAC
  Cadet/Junior: 15 / 66 / 80 / 48. B1 boots to 24 schedule rows, footer
  `19 placed · 5 unplaced · 0 pinned`.

## What planning measured

Every number below comes from throwaway prototypes, built cumulatively in a
detached scratch worktree in the order times → day → cuts → video → same-day.
Each prototype was reviewed against the approved spec by an independent agent
and corrected before the next group was built on it. The chain was then
rebuilt with every review fix and the owner's team ruling, and an independent
agent wrote its own probe from scratch and reproduced every number on every
commit. The prototypes and probes were deleted. Nothing from them carries into
implementation except these tables and the decisions below.

The probe measured, per scenario: the ledger's scheduled count, ERROR count,
WARN counts by cause, `stripRecommendation`, `refRecommendation`,
`refRequirementsByDay`, day-summary peaks and the per-event digest. It also
measured the app path's placed count and ids (`runAppPath`), the four
templates' Suggest the way the live smoke drives the store (video strips 12,
days 4, NAC), and B1's boot footer through the store.

### Cumulative results

The ledger equals the app path on every scenario at every step, ids included.

| | Base | A times | B day | E cuts | C video | D same-day |
|---|---:|---:|---:|---:|---:|---:|
| B1 NAC | 24 | 24 | 24 | 24 | 24 | 24 |
| B2 NAC | 24 | 24 | 24 | 24 | 24 | 24 |
| B3 NAC | 24 | 24 | 24 | 24 | 24 | 24 |
| B4 SYC | 18 | **19** | 19 | 19 | 19 | **21** |
| B5 SJCC | 12 | 12 | 12 | 12 | 12 | 12 |
| B6 ROC | 40 | **50** | 50 | 50 | 50 | **45** |
| B7 NAC | 18 | 18 | 18 | 18 | 18 | 18 |
| B8 NAC | 53 | 53 | **52** | 52 | 52 | **53** |

| | ERRORs B1–B8 | `stripRecommendation` B1–B8 | Suggest (ROC / Youth / Vet-Div1-Jr / Cdt-Jr) | Boot footer |
|---|---|---|---|---|
| Base | 0/0/0/12/0/14/0/0 | 48/70/68/76/32/65/64/51 | 15 / 66 / 80 / 48 | 19 / 5 / 0 |
| A | 0/0/0/11/0/4/0/0 | 45/64/64/64/28/57/60/63 | 15 / 65 / 90 / 68 | 16 / 8 / 0 |
| B | 0/0/0/11/0/4/0/1 | 53/75/73/75/28/63/82/62 | 15 / 78 / 103 / 64 | 16 / 8 / 0 |
| E | as B | as B | as B | as B |
| C | as B | as B | as B | as B |
| D | 0/0/0/9/0/9/0/0 | 53/77/73/74/29/63/82/56 | 15 / 80 / 103 / 62 | 15 / 9 / 0 |

- `refRecommendation` does not move at any step.
- Every Suggest above places every event the template selects (12/12, 24/24,
  66/66, 24/24).
- The app path places all 24 of B1's events at every step. That is the count
  the smoke's boot check reads as schedule rows. The probe did not count rows
  directly, so each group's probe adds that count (§Re-measuring).

### Group A – planning times

Pools rebased to the pool of 7. DEs derived per round from bout time, with the
staged split at the video-stage round. `VIDEO_STAGE_ROUND` takes the p.19
tiers: Div 1, Junior and Cadet at the round of 16, every other individual
category at the round of 8 (Y8 included, by interpretation). Capacity bills
bouts × bout time. `de_duration_table` goes. Team events plan no video and run
Single Stage. A bracket of 2 has no DE. The measured chain includes the
`VIDEO_STAGE_ROUND` change, so no re-measurement is needed for it.

| Sub-step | Ledger B1–B8 | What moves |
|---|---|---|
| A.1 pools only | 24/24/24/18/12/45/18/53 | B6 +5 (6 in, D1A-W-EPEE-IND out, back at A.2). B4 swaps 4 for 4. Suggest 15 / 59 / 67 / 48. Footer 17/7/0 |
| A.2 + DE derivation, split, stage rounds, video ask, capacity | 24/24/24/19/12/50/18/53 | B4 +1, B6 +5. B2 SCHEDULE_ACCEPTED_WITH_WARNINGS 2 → 0. Suggest 15 / 65 / **none (46/66)** / 54. Footer 17/7/0 |
| A.3 + capacity bills only prelims bouts to general | same | nothing in the probe's aggregates. The derive.test.ts oracle moves |
| A.4 + team ruling | same | no count. Re-times B1 12/24, B2 12/24, B8 18/53. B2 SCHEDULE_ACCEPTED_WITH_WARNINGS 0 → 1. Suggest Vet/Div1/Jr none → 90, Cdt/Jr 54 → 68. Footer 17/7/0 → 16/8/0 |
| A.5 + bracket of 2 | same | B8 VET-W-SABRE-IND-V80 claims 0 strips, same times |

Sub-step rows here and under D show counts, Suggest, the footer and the WARNs
that need an owner. ERROR counts and `stripRecommendation` also move inside a
group (A.1 alone takes B6's ERRORs 14 → 9). Each group's final row in
§Cumulative results is the one its commit is held to.

- B4 18 → 19: out CDT-M-EPEE-IND, CDT-M-FOIL-IND. In CDT-W-FOIL-IND,
  Y12-W-SABRE-IND, Y14-W-EPEE-IND.
- B6 40 → 50: in CDT-W-FOIL-IND, D2-M-EPEE-IND, D2-M-FOIL-IND,
  D2-M-SABRE-IND, VET-M-EPEE-IND-VCMB, Y12-M-FOIL-IND, Y12-M-SABRE-IND,
  Y12-W-EPEE-IND, Y12-W-SABRE-IND, Y14-W-EPEE-IND. None leave.
- Every event's digest changes in every scenario, because pool and DE times move.
- WARNs: B2 SCHEDULE_ACCEPTED_WITH_WARNINGS 2 → 1, B4 DEADLINE_BREACH 13 → 11
  and RESOURCE_EXHAUSTION 7 → 6, B6 DEADLINE_BREACH 15 → 6, B7
  SCHEDULE_ACCEPTED_WITH_WARNINGS 2 → 1.
- `refRequirementsByDay`: B1 day 1 peak 186 → 210. Day-summary peaks move on
  B2, B4 and B6.
- The team ruling is what keeps Suggest working. The old team video block
  (round of 32 through the semis, 60-minute matches on 4 video strips) ran
  about 8 hours and could not be placed. Measured for the record only: teams
  without video but still staged at the round of 32 give Vet/Div1/Jr 118.
- Unverified: after the team ruling, some B1 individual video blocks start
  later (JR-W-SABRE-IND's video block 1925 → 2120). The likely cause is wide
  team DEs spilling onto idle video strips, which METHODOLOGY's video-strip
  preservation rules allow. Task A's drift review settles it (D4).

### Group B – the day and strips

9:00 day start, 19:00 soft target, 22:00 hard end, 600-minute capacity day,
the late-day WARN, and Suggest floored at busiest-day competitors ÷ 14.

| Sub-step | Ledger B1–B8 | `stripRecommendation` | Suggest |
|---|---|---|---|
| B.1 day hours, soft/hard end, WARN, 600-min capacity | 24/24/24/19/12/50/18/52 | 48/68/67/71/28/59/64/53 | 15 / 66 / 101 / 64 |
| B.2 + ÷ 14 floor | same, 0 events changed | 53/75/73/75/28/63/82/62 | 15 / 78 / 103 / 64 |
| control: B with an 8:00 start | 24/24/24/19/12/52/18/53 | 53/75/73/74/28/63/82/56 | 15 / 78 / 103 / 56 |

- **B8 53 → 52**: JR-W-EPEE-IND is lost. The control shows the 9:00 start
  causes it, because the hard window shrinks from 840 to 780 minutes. Neither
  the 600-minute capacity nor the soft target does.
- B4 holds 19 and swaps five: out CDT-M-SABRE-IND, Y12-M-SABRE-IND,
  Y12-W-EPEE-IND, Y12-W-SABRE-IND, Y14-W-EPEE-IND. In CDT-M-FOIL-IND,
  CDT-W-EPEE-IND, CDT-W-SABRE-IND, Y12-M-EPEE-IND, Y14-W-SABRE-IND.
- B6 holds 50 and swaps four: out D1A-W-EPEE-IND, JR-W-SABRE-IND,
  Y12-M-FOIL-IND, Y12-W-EPEE-IND. In D2-W-EPEE-IND, JR-M-FOIL-IND,
  JR-W-EPEE-IND, VET-W-EPEE-IND-VCMB.
- The new day-ends-past-target WARN adds SCHEDULE_ACCEPTED_WITH_WARNINGS: B2
  1 → 4, B3 0 → 3, B4 0 → 3, B6 0 → 3, B7 1 → 4, B8 1 → 2. B4 DEADLINE_BREACH
  11 → 12 and RESOURCE_EXHAUSTION 6 → 7. B6 DEADLINE_BREACH 6 → 5. B8
  DEADLINE_BREACH 0 → 1.
- B8 now emits a `Day N refs:` summary line, because it has an unplaced event,
  so it joins `SCENARIOS_WITH_DAY_SUMMARY`. Day-summary peaks move on B4, B6
  and B8.
- The ledger's fallback day axis must be spaced 1440 apart like the app's. A
  back-to-back axis cost B4 one event (Y14-W-SABRE-IND) with no spec cause.
- Two tests that failed at A passed again under B: the derive busier-schedule
  oracle and concurrentScheduler's feasibility-only RESOURCE_RECOMMENDATION
  test. The cause was not isolated. Task A rebuilds both, and Task B re-checks
  them.

### Group E – cuts

256-fencer DE cap, RYC joins the regional all-advance types, Y14 all-advance
by default.

- No count, ERROR, `stripRecommendation`, `refRecommendation` or Suggest moves.
- Timing only. B2 7/24 events change: six Y14 DEs end 25–60 minutes later, and
  CDT-M-EPEE-TEAM shifts +10 minutes as a knock-on. B2
  SCHEDULE_ACCEPTED_WITH_WARNINGS 4 → 3. B3 6/24 events change (Y14), and B3
  `refRequirementsByDay` day 2 `peak_saber_refs` 80 → 82.
- The 256 cap alone moves nothing, because no current field promotes more than
  256. Without the cap, B3's Y14 men (260/270/280, the only fields above 256)
  become 512 brackets. They and Y14-W-EPEE, whose prelims start 20 minutes
  later as a knock-on, finish 20–25 minutes later (4/24 events), with no count
  change.
- No B1–B8 scenario or smoke template is an RYC.

### Group C – video

Every NAC individual event is REQUIRED. Every non-NAC event and every team
event is BEST_EFFORT.

- No count, ERROR, `stripRecommendation`, `refRecommendation` or Suggest moves.
- Timing only, all from the NAC half: B1 2, B2 4, B3 5, B8 27 events change,
  with no day moves. B2 SCHEDULE_ACCEPTED_WITH_WARNINGS 3 → 4.
- The regional half moves only WARNs. RESOURCE_EXHAUSTION B4 7 → 1, B5 12 → 0,
  B6 12 → 0, because the regional video-dead-config notices disappear.
- B7, the control, is byte-identical. All its events were REQUIRED already.

**Does Suggest still find a count once video strips bind?** Yes. Suggest was run
at 8, 12 and 16 video strips:

| | 8 | 12 | 16 |
|---|---:|---:|---:|
| B3 | 73 | 73 | 73 |
| B7 | 82 | 82 | 82 |
| B8 | 64 | 62 | 62 |
| NAC Youth | 78 | 78 | 78 |
| NAC Vet/Div1/Junior | 103 | 103 | 103 |
| NAC Cadet/Junior | 64 | 64 | 64 |

Video binds only on B8 at 8 video strips. No Suggest is null. The first
prototype chain did return no count on two NAC templates. The cause was the
team video block, which the owner's team ruling removed.

### Group D – same-day rules

Group 1 hard at NAC, SYC and SJCC and soft with a time-of-day window at ROC,
RYC and RJCC. The Junior–Cadet rest day goes. New Group 2 separations, the
Group 3 cross-weapon preference, and first and last days planned shorter.

| Sub-step | Ledger B1–B8 | What moves |
|---|---|---|
| D.1 Group 1 by type + regional window | 24/24/24/19/12/49/18/52 | B6 −1. B2 and B7 re-time every event |
| D.2 + rest day removed | 24/24/24/19/12/48/18/52 | B6 −1. B5 `stripRecommendation` 28 → 29 |
| D.3 + Group 2 | same | nothing |
| D.4 + Group 3 | 24/24/24/18/12/46/18/52 | B4 −1, B6 −2. Suggest Youth 80, Cdt/Jr 62. Footer 15/9/0 |
| D.5 + first/last day capacity and WARN | 24/24/24/21/12/45/18/53 | B4 +3, B6 −1, B8 +1 |

- **B6 50 → 45**: out JR-M-FOIL-IND, JR-M-SABRE-IND, JR-W-EPEE-IND,
  JR-W-FOIL-IND, VET-M-FOIL-IND-VCMB, Y12-M-EPEE-IND, Y12-W-FOIL-IND. In
  D1A-W-EPEE-IND, Y12-M-FOIL-IND.
- **B4 19 → 21**: out CDT-W-EPEE-IND, CDT-W-FOIL-IND, CDT-W-SABRE-IND,
  Y14-W-SABRE-IND. In CDT-M-SABRE-IND, Y12-M-SABRE-IND, Y12-W-EPEE-IND,
  Y12-W-FOIL-IND, Y12-W-SABRE-IND, Y14-W-FOIL-IND.
- **B8 52 → 53**: JR-W-EPEE-IND is placed again. B8 leaves
  `SCENARIOS_WITH_DAY_SUMMARY`.
- WARNs: B1 SCHEDULE_ACCEPTED_WITH_WARNINGS 0 → 1, B3 3 → 5, B4 3 → 4, B8 2 → 3,
  B7 4 → 3. B4 DEADLINE_BREACH 12 → 9, B6 5 → 9, B8 1 → 0.
- Events changed: B1 13/24, B2 23/24, B3 23/24, B4 24/25, B5 11/12, B6 48/52,
  B7 18/18, B8 53/53. Group 3 causes most of the churn.
- The regional window binds. In a one-day ROC with Y12 and Y14 on ample strips,
  Y14's pools start at exactly day start + 240 and an INFO fires. With Y10, Y12
  and Y14, the Y10–Y12 pair is honoured (INFO) and Y12–Y14 is not (WARN).
- Group 1 was measured keyed by category, weapon and gender only, for any mix
  of individual and team events (D10).

### The Vet sibling edge

Measured on a prototype of all of 024 to size the new backlog entry, not for
024's scope. The edge in METHODOLOGY §Cross-Event Dependency Edges never binds
today. B8's 60 sibling pairs all run in parallel.

- **Bound as worded** (the younger band waits for the older band's end + 30):
  B8 53 → 45, with eight DEADLINE_BREACH errors. The eight Vet 40 and Vet 50
  épée and foil events are lost, because five bands of 3–4.5 hours each overflow
  the day. `stripRecommendation` 56 → none. Suggest for NAC Vet/Div1/Junior 103
  → none (44 of 66 placed).
- **A 60-minute stagger** (the younger band's pools ready 60 minutes after the
  older band's pool start): B8 keeps 53 with 0 errors. Suggest for NAC
  Vet/Div1/Junior 103 → 110, all 66 placed. Peak referee demand falls (B8
  day 1 146 → 108).

The entry is in `backlog.md` §The Vet sibling and individual-to-team edges
never hold an event back, added on this branch.

### Blast radius

Tests the prototypes broke, by group. Each group's task re-pins or rewrites
these in its own commit.

- **A**:
  - `de.test.ts` (32, removed functions and old bout times) and `pools.test.ts` (12)
  - `concurrentScheduler.test.ts` (11: ten old DE-duration pins, plus the
    feasibility-only RESOURCE_RECOMMENDATION test, whose WARN stops firing)
  - `validation.test.ts` (8), `capacity.test.ts` (7)
  - `constants.test.ts` (5), `refs.test.ts` (2), `stripBudget.test.ts` (1)
  - `footprint.test.ts` (2), `stripSearch.test.ts` (3), `bottleneckSubjects.test.ts` (1)
  - `derive.test.ts` (the busier-schedule oracle) and `pinnedScheduling.test.ts` (case 4)
  - `buildConfig.test.ts` (3, plus the `buildConfig-preShrink-nac-vet-div1-junior.json` fixture)
  - `driftLedger.test.ts` (9), `appPath.test.ts` (4), `appPathParity.test.ts` (4)
  - `footerMetrics.test.ts` (6), `findings.test.ts`, `dismissals.test.ts`, `store.test.ts`
  - `serialization.test.ts` (3) and `PoolDurationSettings.test.tsx` (4)
  - `viewEquivalence.test.tsx` (6), `segments.test.ts` (4)
  - `recompute.test.tsx`, `invalidState.test.tsx`, `UnplacedDock.test.tsx`
  - tsc errors in the `de`, `buildConfig`, `concurrentScheduler`,
    `validation` and `constants` tests (removed exports and config keys)
- **B**:
  - `driftLedger.test.ts`, `integration.test.ts`, `appPath.test.ts` and
    `appPathParity.test.ts` (B8)
  - `capacity.test.ts` (80 strips × 10 h) and `resources.test.ts` (2, the
    hard end replaces the day length)
  - `validation.test.ts` (the `validateSameDayCompletion` block, rewritten in
    the red step) and `stripSearch.test.ts` (the ÷ 14 floor)
  - `buildConfig.test.ts` and `dayAxis.test.ts` (6, windows carry the hard end)
  - `store.test.ts` (default hours), `TournamentPanel.test.tsx` (day-hours combobox)
  - `asciiLaneRenderer.test.ts` (axis labels)
  - re-check, may move: `derive.test.ts` and `concurrentScheduler.test.ts` as
    Task A rebuilt them
- **E**: `constants.test.ts` (the deleted Y14 override row).
- **C**:
  - `typeDefaults.test.ts` (7, the new column and resolver signature)
  - `invalidState.test.tsx` and `recompute.test.tsx` (8). Their NAC fixtures
    use 2 video strips, so Y10 events now raise `video-r16-strip-shortfall`.
- **D**:
  - `constants.test.ts`, `crossover.test.ts`, `constraintGraph.test.ts`,
    `dayColoring.test.ts`, `integration.test.ts`, `pinnedScheduling.test.ts`
    (cases 2 and 5) and `flighting.test.ts`. About 40 call sites gain the now
    required tournament type.
  - `footerMetrics.test.ts` (B5 moves at D.2)

## Expected outcome

- Ledger B1–B8: **24 / 24 / 24 / 21 / 12 / 45 / 18 / 53**, equal to the app path.
  ERRORs 0/0/0/9/0/9/0/0. `stripRecommendation` 53/77/73/74/29/63/82/56.
  `refRecommendation` unchanged.
- Floors after each group (D2):

  | After | Floors B1–B8 | Change |
  |---|---|---|
  | A | 24/24/24/19/12/50/18/53 | B4 and B6 raised |
  | B | 24/24/24/19/12/50/18/52 | **B8 lowered** under the policy-amendment clause |
  | E, C | unchanged | – |
  | D | 24/24/24/21/12/45/18/53 | B4 and B8 raised, **B6 lowered** under the clause |

- Live smoke:
  - Suggest: ROC Div1A/Vet 15, NAC Youth 80, NAC Vet/Div1/Junior **103**,
    NAC Cadet/Junior 62. Each places every selected event.
  - B1 boots to 24 schedule rows with footer `15 placed · 9 unplaced · 0 pinned`.
  - The SC-008 assertion reads 103 (A moves it to 90, B to 103).
- NAC Vet/Div1/Junior now needs more than 100 strips at 4 days, 9:00–19:00. That
  is a real consequence of the manual's DE times and day. It is reported, not
  tuned (see §What this costs).

## Decisions

**D1 – One commit per rule group, in the measured order.** Task 0 (the floor
clause) comes first. Then A times, B day, E cuts, C video and D same-day, each
in one commit carrying its drift record. Review-fix commits follow their group.
The sub-steps above are attribution evidence only. Implementers do not commit
sub-steps, and a group's commit is judged against its final row.

Cost if wrong: one commit per group hides a sub-step that would breach a floor
on its own (B4 touches 18 at D.4). That is intended, since a group lands whole.

**D2 – Floors move with every group.** A group that raises a scenario's count
raises its floor to the new count in the same commit, as 015 did. That way a
later group that loses those events halts its own task. A floor is lowered
only under D3, and only where §Expected outcome says.

**D3 – The policy-amendment clause (owner ruling, 2026-10-05).** The
`SCHEDULED_FLOORS` docblock gains a second exception next to 015's
input-correction case. A floor may be lowered when an owner-approved
METHODOLOGY.md amendment causes the drop, and only when all of these hold:
- the drop is confined to one rule group's commit
- that commit's drift review names the amendment and the events lost, and
  cites what isolates the cause: a control run for B (the 8:00-start run), the
  sub-step attribution for D
- the ledger equals the app path in that commit, and `factoryParity.test.ts`
  passes
- a dated entry beside the floor records both counts

The `driftLedger.test.ts` header says the two admitted lowerings are input
correction and policy amendment. Any other drop still halts.

**D4 – Team events (owner ruling, 2026-10-05).** Team events are BEST_EFFORT and
Single Stage at every tournament type, even under a Staged DE-mode setting.
The whole team DE runs on general strips, asking `min(bracket/2, 16)`, at the
team match time, and bills no video strip-hours.
- The rule lives in the store bridge as two resolvers in `typeDefaults.ts`,
  one for DE mode and one for video policy, which `buildConfig.ts` calls. The
  factory in `scenarios.ts` keeps its own transcription.
- The engine adds a validation ERROR for a TEAM event that is STAGED or
  REQUIRED. The app and the ledger never build one, so a hand-built config
  cannot carry two models of one event.
- `TEAM_DE_STAGE_ROUND` is never introduced.
- The video-demand counts in `analysis.ts` and `dayAssignment.ts` (video
  scarcity) count STAGED + REQUIRED individual events only, so NAC teams leave
  them.
- Task A's drift review confirms or refutes that team DEs spill onto idle video
  strips and push individual video blocks later (§Group A). If confirmed, it
  is accepted spec behaviour under METHODOLOGY §Video Strip Preservation and
  recorded in the commit. If refuted, the review names the real cause. A cause
  that is not spec behaviour halts to the owner if it moves a measured number.
  Otherwise it joins D14 and Task H's backlog list as team-versus-video
  contention.

**D5 – A bracket of 2 has no DE.** It takes 0 minutes, asks 0 strips (general and
video) and keeps its 30/60-minute tail. The rule is keyed to DE nodes whose
bracket has no counted round, never to a strip ask of 0. Pool and flight nodes
keep their 1-strip floor. A pinned flighted event with `strip_count` 1 keeps
1 strip and its full duration in both the scheduler and `derive.ts`. Empty
DE segments and 0-count referee intervals are skipped in `segments.ts` and
`derived.ts`.

**D6 – DE derivation readings.** These apply where the spec is silent:
- **Stage rounds.** `VIDEO_STAGE_ROUND` lists every individual category at its
  p.19 tier: Div 1, Junior and Cadet 16, and Y8, Y10, Y12, Y14, Vet 40, 50, 60,
  70, 80, Vet Combined, Div 1A, Div 2 and Div 3 all 8. Its comment cites Ops
  Manual p.19 and marks Y8 as an interpretation.
- **Fallback.** Because the table lists every individual category, the
  round-of-8 fallback serves only a VETERAN event with no age group.
- **Video ask.** The video block asks `min(4, bracket/2)`, read through one
  function everywhere it is used: the phase node, `derive.ts`, strip budget,
  referee demand and validation. `Competition.de_round_of_16_strips` becomes
  dead and is removed, along with the `DeBlockDurations` type.
- **No snapping.** Staged block lengths are not snapped. Only start times snap
  to 5 minutes, per §Timing.
- **Zero strips.** A grant of 0 strips counts as 1 in the wave formula.
- **The 10-touch set.** Y8, Y10, the VETERAN category and any Vet age group take
  15/15/10. Teams take 60/60/30.
- **No gap between DE rounds.** The 5-minute changeover sits inside the bout
  time (rulings D11). ADMIN_GAP applies only where it does today.
- **Capacity.** For a staged individual event, general strip-hours are pool +
  prelims bouts. The video-round-through-semis bouts bill only the video
  budget. Pin the spec's worked example: 77.3 + 4.7 h.
- **Labels (rulings D13).** Code keeps the `r16` / `DE_ROUND_OF_16` names.
  User-facing text says "video stage": `phaseDisplay` in
  `src/lib/placementLabels.ts`, and so the tooltip, block name and detail
  strip. The dev-only `asciiLaneRenderer` keeps its `R16` code.
- **Pool table basis.** The Settings caption names the basis ("Pool durations
  (pool of 7)"). The per-weapon aria-labels stay, so the smoke driver's locator
  holds. A pool-table override saved before 024 is read on the new basis by
  design – there is no back-compat.

**D7 – The day.**
- **Hard end.** The engine's per-day window carries a required hard end. If
  the store shares the day type today, split it so store state and
  serialization do not gain the field. `buildConfig.ts` sets the hard end to
  `d × 1440 + max(day_end, 1320)`.
- **Fallback axis.** The ledger's fallback axis (empty `dayConfigs`) is spaced
  1440 apart, minute 0 = 9:00, with the hard end 780 minutes after the start.
- **Late-day WARN.** It is cause SCHEDULE_ACCEPTED_WITH_WARNINGS, rule
  `day-ends-past-target`. It fires once per late day, at every day count. The
  finish is `de_total_end`, which includes the gold/bronze tail, or `pool_end`
  for an event with no DE.
- **Where the new findings show.** The three new engine findings live in the
  engine and the ledger only in 024: `day-ends-past-target`, the regional
  window INFO/WARN and the first/last-day WARN. A run keeps only placements
  (`src/store/runActions.ts`), and the Findings panel is built from
  `validateConfig` and `initialAnalysis`, so none of the three reaches the app.
  Showing them is 016's job (rulings D6).
- **The app's late-day row.** The store's late-finish row (`derived.ts`,
  §1.4) keeps comparing against `day_end_time`, which is now the 19:00 soft
  target. That is the app's version of the spec's late-day WARN. It keeps
  today's 45-minute lead (`LATE_FINISH_WINDOW_MINS`): it warns of no slack
  from 18:15 and of a late finish after 19:00. Its message says the day's
  "target", not its "close", because work may run to 22:00. One late day gives
  one row.
- **Footer utilization.** Its denominator stays the day window (strips × 600
  minutes per day). A day that runs past 19:00 can read above 100%, which is
  the honest signal. Task B pins it with a test.
- **Single-Day Fit.** `validateSameDayCompletion` uses the hard window: 780
  minutes, or the widest day's if the organizer edits hours. It still has no
  caller in `src/`, and wiring it is out of scope (D14).
- **Suggest.** The ÷ 14 baseline rounds up. The busiest-day spread covers the
  same competitions `suggestStripCount` and `aggregateStripHours` count, so
  out-of-bounds fencer counts are excluded. When the floor exceeds the pool
  ceiling, the search window is `[floor, floor + poolCeiling]`.
- **Canvas.** The canvas axis and `asciiLaneRenderer` extend to the hard end,
  so blocks placed between 19:00 and 22:00 draw inside the axis.
- **Cutoff.** The 16:00 pool-round cutoff stays and stays unenforced (021).
  `LATEST_START_MINS` stays 960. `LATEST_START_OFFSET` (in `constants.ts` and
  `makeConfig`) moves to 420, so it still equals 960 − day start. Nothing
  reads it, so it moves no number and needs no red test.

**D8 – Cuts.**
- The cap is an engine constant `MAX_DE_FIELD = 256`, applied as
  `min(max(promoted, 2), 256)` to individual and team fields. It is silent: no
  validation notice fires when a field or COUNT cut is capped.
- Y14's `REGIONAL_CUT_OVERRIDES` row is deleted. RYC joins
  `REGIONAL_CUT_TOURNAMENT_TYPES`, while `REGIONAL_QUALIFIER_TYPES` stays its
  own constant.
- The factory keeps reading the shared cut tables, as 015 D1 accepted.
  Exact-contents tests in `constants.test.ts` guard them.

**D9 – Video.**
- `TYPE_DEFAULTS` gains a non-nullable `individual_video_policy`: REQUIRED at
  NAC, BEST_EFFORT elsewhere. The resolver is `resolveVideoPolicy(type, eventType)`.
- `DEFAULT_VIDEO_POLICY_BY_CATEGORY` has no reader left and is deleted.
  `VIDEO_STAGE_ROUND` stays.
- The factory transcribes the column. `factoryParity.test.ts` gains a NAC
  youth individual row, a NAC team row and an SJCC Cadet row, so a drift in
  either copy fails.
- The policy follows the type, not the DE-mode setting. A NAC run under a
  Single Stage override keeps REQUIRED and draws one video-dead-config notice
  per individual event, none for teams.
- The shortfall message says "video stage", not "R16" (rulings D13).
- Test fixtures with fewer than 4 video strips move to 4, the smallest value
  the spec offers.

**D10 – Same-day.**
- **Group 1 constants.** `GROUP_1_MANDATORY` keeps its cited name, holding
  `{older, younger}` pairs. DIV1–DIV1A moves to its own always-hard constant.
- **Type is required.** `crossoverPenalty`, `buildConstraintGraph` and
  `validateFlightingGroup` take a required tournament type.
  `crossoverPenalty` validates the type at entry and throws for any pair when
  the type is invalid.
- **Event-type scope.** Group 1 is keyed by category, weapon and gender only,
  for any mix of individual and team events, as measured. That covers the
  national Infinity, the regional 5.0 and the window. So a Cadet or Junior
  individual and the Div 1 team of the same weapon and gender are a Group 1
  pair, and at a regional type the Div 1 team is the older side. Group 1 is
  checked before Group 2, so Group 2's open-team row (3.0) scores only Y14
  against the Div 1 team. Same-category individual and team pairs stay
  Infinity at every type (Same-Population, rulings D3), and so do the
  cross-level relaxable blocks.
- **The window.** As the spec says, it is wired in `applyCrossEventEdges`.
  There it sets a fixed ready-time floor (day start + 240) on the older side of
  each regional Group 1 pair that shares a day. The floor is stored on the
  event, not as a `cross_event_predecessors` edge, and the loop's seed and the
  retry reset apply it to the first phase. That is why it binds where the Vet
  edge does not. Pairs set the same floor, so windows do not stack. INFO when
  honoured, WARN when not. A pin skips the seed, so a pin can break the window
  and draw the WARN.
- **Group 3.** It runs in day colouring, since `crossoverPenalty` returns 0
  across weapons. It matches category, gender and event type, and VETERAN
  pairs must also match `vet_age_group`.
- **First and last day.** From 3 days, the 0.8 capacity applies to colours 0
  and N−1, and to day expansion (number-neutral, measured). The WARN reads the
  first and last used day. It needs at least 3 used days and fires when either
  is not shorter than the shortest used middle day.
- **Relaxation.** Relaxation-level suppression of the regional pair is not
  implemented (021 owns relaxation).

**D11 – Per-event derivation and parity.**
- Per-event derivation changes in A (team DE mode and video policy), E (cut
  fields through shared tables) and C (individual video policy). Those three
  tasks list `__tests__/helpers/scenarios.ts` and
  `__tests__/store/factoryParity.test.ts` as editable.
- B changes config keys only, through `factories.ts` and `buildConfig.ts`.
  The parity test's generic key loop covers them.
- D changes no derivation, and its tasks must not touch either file.

**D12 – Refs per pool needs no task.** `TYPE_DEFAULTS` already sets two refs per
pool at NAC, SYC and SJCC and one at ROC, RYC and RJCC, `resolveRefsPerPool`
maps Auto to two at every type, and the factory transcribes the same values.
That is what the amended spec says, and `refRecommendation` stays fixed on
every commit.

**D13 – The smoke driver moves with the groups that move it.** Constitution VI:
- A moves SC-008 (`scripts/smoke.mjs`, around :976) from 80 to 90.
- B moves it from 90 to 103, and repairs any locator its day-hours or axis
  change moves.
- Each change carries a dated `[M]` note citing the group's probe measurement.
- D's footer and Suggest moves are logged by the driver, not asserted, so D
  needs no driver edit.
- Task S is the one live run, and it confirms all of it.

**D14 – Out of scope:**
- the Div I 75% promotion (018)
- relaxation-level suppression (021)
- the Vet sibling and individual-to-team edges, which never bind (backlog
  entry on this branch, measured in §The Vet sibling edge)
- the Y8 Developmental Format (backlog entry on this branch)
- showing the three new engine findings in the app (016)
- wiring `validateSameDayCompletion` and the second Single-Day Fit bullet
- weapon-balance wiring (021)
- the age-category weights' "video serialization" rationale, which every
  category now shares
- team DE shape and team pools (023)
- the >100-strip Suggest on NAC Vet/Div1/Junior
- `validation.ts`'s cut-value-min-promotions check, which reads a PERCENTAGE
  cut as the advance share, the inverse of `computeDeFencerCount` (backlog,
  Task H)
- the video-strip stepper, which accepts 0 to the strip count while the spec
  offers 4, 8, 12 and 16 (backlog, Task H)

## Tasks

After every task the orchestrator records the test-count chain, the snapshot
SHA and the eight counts in `<wt>/tmp/024-ledger.md`. The handoff transcribes
them.

**The dispatch chain.** Every group task runs as a chain of dispatches, then
its review wave. Each dispatch holds at most four steps. Nothing is committed
between them, and a group keeps exactly one commit however many dispatches
feed it (D1).

1. **Red, then green, one dispatch per sub-step.** The dispatch writes the
   failing tests for its sub-step, runs them and saves
   `<wt>/tmp/024-<g>.<n>-red.log`. It then implements in the task's files until
   those tests pass. After each dispatch the orchestrator may take the probe
   (below) and compare with the sub-step's row in §What planning measured, as
   a checkpoint only.
2. **Re-baseline, split by layer.**
   - (a) Engine: re-take the drift snapshot alone, diff it scenario by scenario
     against the group's final row, and apply the floors and engine-test pins.
   - (b) Store and helpers: pins in `factoryParity`, `appPathParity` and
     `appPath`, plus any rebuilt oracle.
   - (c) React tests, fixtures and the smoke driver. Then the full suite,
     `tsc -b`, lint and the commit.

**Red tests.** Each red test fails in one of two ways: a missing symbol (a new
export, field or parameter the group adds), or an asserted value that differs
from today's. Tests marked (guard) pin behaviour that already holds and must
pass in red. The red log shows, for each test, which way it failed or that it
is a passing guard. Anything else halts.

**The probe.** At each re-baseline, measure the four smoke templates' Suggest
and B1's boot footer with a throwaway Vitest probe under `<wt>/tmp/`, as
§Re-measuring describes. Delete it before committing.

**The commit message** lists before and after for every scenario's count,
ERRORs and `stripRecommendation`, the four Suggest values and the boot footer,
plus the snapshot SHA and the events in and out.

**The review wave** runs read-only and in parallel. Findings go to one bundled
fix dispatch, then a re-review:
- **Drift audit** (judge-opus): every moved number has its cause, no floor
  moved except as planned, ledger equals app, and no file outside the list
  changed.
- **`test-quality-reviewer`** on every test edit.
- **`react-code-reviewer`** when the group touched React.

### Task 0 – the floor clause (coder-sonnet)

Files: `__tests__/engine/driftLedger.test.ts` (comments only).

Write D3 into the `SCHEDULED_FLOORS` docblock and the file header. The
snapshot must stay byte-identical and the suite green. **Commit.**

### Task A – planning times (coder-opus)

Spec: §Pool Duration Estimation, §Bracket Sizing (byes), §DE Modes, §DE Duration,
§DE Phase Breakdown, the §Video Replay Policy table, §DE Capacity Estimation,
§Strip-Hour Capacity, §Timing Constants, Appendix A.

Files:
- `src/engine/`: `constants.ts`, `types.ts`, `pools.ts`, `de.ts`,
  `capacity.ts`, `concurrentScheduler.ts`, `derive.ts`, `validation.ts`,
  `stripBudget.ts`, `refs.ts`, `analysis.ts`, `dayAssignment.ts`
- `src/store/`: `typeDefaults.ts`, `buildConfig.ts`, `derived.ts`
- `src/lib/placementLabels.ts`, `src/layout/segments.ts`,
  `src/components/workbench/panels/SettingsPanel.tsx` (the DE-mode pill says
  teams always run single stage, and the pool-durations caption)
- helpers: `__tests__/helpers/scenarios.ts`, `factories.ts`
- tests: `__tests__/store/factoryParity.test.ts`, the §Blast radius A files,
  `typeDefaults.test.ts`, `analysis.test.ts`, `dayAssignment.test.ts`,
  `CanvasTooltip.test.tsx`, `SettingsPanel.test.tsx`, and the fixture JSON
- `scripts/smoke.mjs` (SC-008 only, D13)

Dispatches: A.1 pools / A.2 DE derivation, split, stage rounds, video ask,
capacity, and the de-duration-table rule removed / A.3 prelims-only billing and
the D4 ERROR / A.4 the team resolvers, video-demand counts, the SettingsPanel
pill and the labels / A.5 the bracket of 2 and the pinned flight. Then
re-baseline (a), (b) and (c).

Red tests:
- the pool of 7 at 120/120/60. Foil sizes 5, 6 and 7 give 57/86/120 (today
  they give a different value from the pool-of-6 base)
- `VIDEO_STAGE_ROUND`'s exact contents (D6), Y8 included
- the per-round waves, pinned on §DE Duration's worked example: 360 minutes
  single-stage, and 300 + 80 staged
- byes not counted, and a re-derive at fewer granted strips
- bout times 20/20/13, 15/15/10 and 60/60/30
- the staged split at the round of 16 and the round of 8, with no prelims at
  or below the video round
- capacity: the 77.3 + 4.7 h example, and teams billing all to general
- the team resolvers at all six types and under both overrides
- the D4 validation ERROR
- the video-demand counts in `analysis.ts` and `dayAssignment.ts` exclude NAC
  team events
- the bracket of 2: 0 strips, 0 minutes, tail kept
- a pinned flight with `strip_count` 1 keeps 1 strip and its full duration in
  the scheduler and `derive.ts`
- the de-duration-table rule gone from the per-event error rules
- `phaseDisplay(DE_ROUND_OF_16)` says "video stage", and a staged block's
  tooltip shows it for both a round-of-16 event and a round-of-8 event
- the Settings caption names the pool of 7

Re-baseline:
- Raise B4 to 19 and B6 to 50. Pin `PINNED_APP_PATH_COUNTS`,
  `LEDGER_SCHEDULED_COUNTS`, `appPath.test.ts`'s `BASELINE` and the
  `integration.test.ts` floors.
- First diagnose the derive oracle failure (`de_start` 130 vs 145). Decide
  whether the scheduler and `derive.ts` really disagree, or only the fixture's
  premise moved, and record the cause. A real disagreement is fixed in code,
  never by rebuilding the fixture around it.
- Rebuild the derive oracle, pinnedScheduling case 4 and the feasibility-only
  RESOURCE_RECOMMENDATION test so their premises hold again. Never pin the
  WARN's absence – B's 600-minute capacity brings it back.
- Regenerate the pre-shrink fixture on purpose, saying so in the commit message.
- Move SC-008 to 90 (D13).
- The drift review settles the team spill (D4).

**Commit point:** group A, then its review wave (`react-code-reviewer`
included).

### Task B – the day and strips (coder-opus)

Spec: §Inputs (start and end time), §Outputs' day paragraph, §Single-Day Fit,
§Same-Day Completion, §Bottlenecks Specific to the Concurrent Scheduler,
§Phase 5, §Strip Count Suggestion, §Strip-Hour Capacity, §Timing Constants.

Files:
- `src/engine/`: `constants.ts`, `types.ts`, `concurrentScheduler.ts`,
  `resources.ts`, `stripSearch.ts`, `analysis.ts`, `validation.ts`,
  `capacity.ts` and `dayColoring.ts` (comments), `dayAssignment.ts` (the
  inert 840 literal)
- `src/store/`: `buildConfig.ts`, `store.ts`, `derived.ts` (the late-finish
  message), `serialization.ts` (only if the day type splits)
- UI: `src/components/canvas/Canvas.tsx`,
  `src/components/workbench/panels/TournamentPanel.tsx`,
  `src/components/workbench/CenterView.tsx` (only if the day type splits)
- `src/tools/asciiLaneRenderer.ts`
- helpers: `__tests__/helpers/factories.ts` (`makeConfig`, and `makePlacement`'s
  8:00 default), `bottleneckInvariants.ts`
- tests: the §Blast radius B files, a new `__tests__/engine/dayHardEnd.test.ts`,
  `findings.test.ts`, `dismissals.test.ts`, `footerMetrics.test.ts`
- `scripts/smoke.mjs` (SC-008, and any locator the day-hours or axis change moves)

Dispatches: B-d1 constants, hard end, axis and capacity / B-d2 the late-day
WARN, Single-Day Fit and the store row / B-d3 the ÷ 14 floor and search window /
B-d4 UI: day hours, canvas axis, ascii renderer. Then re-baseline (a), (b) and
(c). Checkpoints: after B-d2, compare with measured row B.1. After B-d3, with
row B.2. B-d4 has no ledger row.

Red tests:
- the constants 540 / 1140 / 1320 / 600 / 14
- `buildConfig` sets the hard end
- a phase ending between 19:00 and 22:00 is placed with no SAME_DAY_VIOLATION,
  and one ending past 22:00 fails
- an organizer day end after 22:00 becomes the hard end
- exactly one late-day WARN per late day, with its finish and subjects, and
  none when every event ends by 19:00
- `validateSameDayCompletion` passes a 700-minute worst case and fails a
  790-minute one at default hours, and allows more when the organizer widens a
  day
- capacity and `validateFeasibility` use 10 hours
- the busiest-day spread: largest first, teams as stored, out-of-bounds counts
  excluded, ÷ 14 not scaled by edited hours
- the floor-above-ceiling search window
- the fallback axis spaced 1440 apart
- the canvas axis reaches the hard end
- the store's late-finish row fires once for a day ending at 20:00, says
  "target", and stays anchored to `day_end_time`. A day ending at 18:30 draws
  the no-slack row, and one ending at 18:00 draws none
- footer utilization for a block ending at 21:00 on a 9:00–19:00 day

Re-baseline:
- Lower B8's floor to 52 under D3. The dated entry names JR-W-EPEE-IND, the 9:00
  start, and the 8:00-start control (B8 53, B6 52). The drift audit re-runs that
  control as a throwaway.
- Add B8 to `SCENARIOS_WITH_DAY_SUMMARY`.
- Re-pin B8 in the parity, app-path and integration tables.
- Re-run the derive oracle and the feasibility-only RESOURCE_RECOMMENDATION
  test as A rebuilt them. If either moves, find out why before re-pinning, and
  record the reason in the commit and the drift review.
- Move SC-008 to 103 (D13).

**Commit point:** group B, then its review wave (`react-code-reviewer` included).

### Task E – cuts (coder-sonnet)

Spec: §Bracket Sizing, §Default Cuts by Age Category, §Tournament-Type Policies.

Files:
- `src/engine/constants.ts`, `pools.ts`, the `buildConfig.ts` comment
- helpers: `__tests__/helpers/scenarios.ts` (its docblock still says
  exact-membership pins are missing)
- tests: `__tests__/store/factoryParity.test.ts`,
  `__tests__/engine/constants.test.ts`, `pools.test.ts`, `de.test.ts`,
  `__tests__/store/buildConfig.test.ts`

Dispatches: one for the cap, one for the cut tables, then re-baseline.

Red tests:
- the cap cases: 280, 257, 256, a 400 cut 20%, COUNT 300, 300 teams, 40 teams
  (the last two guard)
- `computeBracketSize(280, DISABLED)` gives 256, and the round of 256 has 128 bouts
- exact contents of the overrides (Cadet, Junior and Div 1 only), the regional
  set (ROC, RYC, SYC, RJCC, SJCC) and Y14's default
- `buildConfig` at RYC: Y14 all-advance, and Cadet forced to all-advance

Re-baseline: the snapshot only, timing on B2 and B3, no floor change. The
commit message names the SCHEDULE_ACCEPTED_WITH_WARNINGS instance B2 loses.

**Commit point:** group E, then its review wave.

### Task C – video (coder-sonnet)

Spec: §Inputs (video bullets), §Video Replay Policy, §Video strip minimum,
§Tournament-Type Policies, §Video Policy Interaction.

Files:
- `src/store/typeDefaults.ts` (its docblock and its tests re-cite METHODOLOGY
  §Tournament-Type Policies instead of the old data-model table), `buildConfig.ts`
- `src/engine/constants.ts` (`DEFAULT_VIDEO_POLICY_BY_CATEGORY` deleted,
  `VIDEO_STAGE_ROUND` kept), `validation.ts` (the shortfall message and its
  comment)
- helpers: `__tests__/helpers/scenarios.ts` (the `TYPE_RULES` column, and its
  docblock naming the video rule as a deliberate second copy)
- tests: `__tests__/store/factoryParity.test.ts`, `typeDefaults.test.ts`,
  `buildConfig.test.ts`, `store.test.ts`, `daySummaries.test.ts` (comment),
  `__tests__/engine/validation.test.ts`, `invalidState.test.tsx`,
  `recompute.test.tsx`

Dispatches: one for the store and factory rule, one for validation and the
fixtures, then re-baseline.

Red tests:
- `individual_video_policy` for all six types
- teams BEST_EFFORT everywhere (guard, from A)
- NAC Y8–Y14, Vet and Div 1A–Div 3 individual events REQUIRED, and SYC and
  SJCC Cadet and Junior BEST_EFFORT
- a NAC under a Single Stage override keeps every individual event REQUIRED and
  draws exactly one video-dead-config notice per individual event, none for teams
- a regional event under a Staged override draws no shortfall error
- a bracket of 4 asks 2 video strips in the shortfall check (guard, from A)
- the shortfall message says "video stage"
- the three new parity rows

Re-baseline: the snapshot only, no floor change. Then re-run Suggest for B3,
B7, B8 and the three NAC templates at 8, 12 and 16 video strips with the
probe, and record the table in the commit message. Any null is a halt.

**Commit point:** group C, then its review wave (`react-code-reviewer` for the
fixture edits).

### Task D – same-day rules (coder-opus)

Spec: §Hard Constraints, §Same-Population Conflicts, §Overlapping-Population
Separation (Group 1), §Rest Day Preference, §Other Soft Preferences,
§Cross-Event Dependency Edges, §Phase 7, §First and Last Day Capacity,
Appendix A.

Files:
- `src/engine/`: `crossover.ts`, `constants.ts`, `constraintGraph.ts`,
  `concurrentScheduler.ts`, `dayAssignment.ts`, `dayColoring.ts`,
  `flighting.ts`, `types.ts`
- `src/components/workbench/panels/TournamentPanel.tsx` (the rest-day help text)
- helpers: `__tests__/helpers/bottleneckInvariants.ts`
- tests: the §Blast radius D files, `concurrentScheduler.test.ts`,
  `driftLedger.test.ts`, `appPath.test.ts`, `appPathParity.test.ts`
- Not `scenarios.ts` and not `factoryParity.test.ts` (D11)

Dispatches: D.1–D.2 / D.3–D.4 / D.5. Then re-baseline (a), (b) and (c).

Red tests:
- `crossoverPenalty` per type: the six pairs Infinity at NAC, SYC and SJCC and
  5.0 at ROC, RYC and RJCC, other gender or weapon 0, DIV1–DIV1A Infinity
  everywhere, Y8–Y10 no value, and an invalid type throws for any pair
- a Cadet individual against the Div 1 team: Infinity at NAC, 5.0 at ROC
- a Y14 individual against the Div 1 team: 3.0 at ROC and at NAC
- same-category individual and team, same weapon and gender: Infinity at all
  six types (guard)
- at ROC, the cross-level relaxable blocks stay Infinity (guard)
- Group 2 rows, including Vet ↔ Div 1A for Vet Combined and an age-banded Vet,
  and Div 1 individual unaffected by the open-team row (guard)
- Group 3 in day colouring, with VETERAN matching age groups and no penalty
  across event types
- no Junior–Cadet rest-day penalty at any type
- the window: exactly +240 with an INFO, the Y10/Y12/Y14 day, a Cadet
  individual and the Div 1 team on a one-day ROC, a pin inside the window
  (WARN, pin not moved), no floor at national types, and the floor held after
  a retry
- first and last capacity, with boundaries at x = 2, 2.0001, 2.6, 2.61 and 0.5
- the used-day WARN: equal length warns, and fewer than 3 used days do not

Re-baseline:
- Raise B4 to 21 and B8 to 53.
- Lower B6 to 45 under D3. The dated entry lists the seven events out and two
  in, and the sub-steps behind them: D.1 −1, D.2 −1, D.4 −2, D.5 −1.
- Remove B8 from `SCENARIOS_WITH_DAY_SUMMARY`.
- Re-pin the parity and integration tables.

**Commit point:** group D, then its review wave.

### Task F – citation and comment sweep (coder-sonnet)

- Re-cite every code comment that names the 2019 manual ("Ch.4", "p.25",
  "pp.26–27") or the 2024-25 handbook, found by grep over `src/`, `__tests__/`
  and `scripts/`. Cite the 2026-27 pages the spec now uses.
- Grep `METHODOLOGY(\.md)?:[0-9]` across `src/`, `__tests__/`, `scripts/` and
  `docs/`, and re-point each line citation to the amended line or a section
  anchor.
- The `ADMIN_GAP_MINS` comment cites p.18's review period as its floor (rulings
  D11).
- Correct the stale comments the prototypes found:
  - the `stripSearch.ts` header
  - `tryAllocate`'s "tighter of dayEnd"
  - the `resources.ts` fallback comment
  - the `findDayForTime` docstring
  - the `computeDeFencerCount` docblock
  - `scripts/smoke.mjs:654-660` (the `de_duration_table` footprint note) and
    `:693-705` (the `DAY_LENGTH_MINS` day-length sum)

Comments only. The snapshot must stay byte-identical. **Commit.**

### Task S – live smoke (subagent, `live-smoke` skill)

Start a dev server from the implementation worktree on its own port:
`pnpm -C <wt> dev --port 5187 --strictPort`, then
`SMOKE_BASE=http://localhost:5187/piste-planner/`.

- Confirm SC-008 reads 103 live and refresh the `[M]` notes with the run's date.
- Check that a block placed after 19:00 draws inside the canvas axis, and that
  a staged round-of-8 event's block and tooltip read the video-stage label.
- Locator repair goes to the subagent, iterating until two consecutive runs
  pass. Never rewrite the driver.

**Commit point:** any driver update.

### Task H – docs and handoff (coder-sonnet)

- `backlog.md`:
  - close §The engine's rules predate the 2026-27 Operations Manual
  - remove the RYC and Y14 bullets from §Policy tables
  - close §DE prelims gets a sliver (the per-round derivation absorbs it)
  - add a dated 024 line to §Youth-event pool duration calibration with B4's
    new count
  - add an entry for the >100-strip Suggest on NAC Vet/Div1/Junior, naming the
    levers in order: days, flighting, entry caps, strips last
  - add an entry for `validation.ts`'s cut-value-min-promotions check. It reads
    a PERCENTAGE cut as the advance share, so 2–7 fencers at a 20% cut are
    wrongly excluded and a 99% cut passes and is floored to 2
  - add an entry for the video-strip stepper. It accepts 0 to the strip count,
    and after 024 a NAC below 4 video strips excludes every individual event.
    Owner question: restrict it to 4, 8, 12 and 16, or keep free entry and warn
- `competition-planner-workbench.md`:
  - row 024 delivered, and its stale text ("Div I–Cadet soft", "Group 1 soft at
    regionals") corrected
  - row 018 drops "DE prelims bout share"
  - row 021's scope drops `CROSS_WEAPON_SAME_DEMOGRAPHIC_VET` (024 wires its
    Group 3 replacement) and the video-tier item
  - the 023 scope notes that team events already plan no video and run
    single-stage
- `specs/024-ops-manual-conformance/handoff.md`, in 015's shape:
  - what changed
  - the measurement chain
  - reviews
  - decisions made on the owner's behalf, each with its cost
  - what was left unfixed, the D14 list included
  - the merge check

**Commit point:** docs and handoff.

### Task M – merge-tree check (orchestrator)

Put `git merge-tree` output in a detached throwaway worktree, run `tsc -b`, lint
and the full suite there, and record the result in the handoff. The user merges
with `merge-with-costs`.

**Commit point:** the handoff's merge-check section, on the worktree branch.

## Halts

- A non-guard red test passes, a guard fails, or a red test fails other than by
  a missing symbol or the wrong value its task names.
- A group's commit differs from §What planning measured in any ledger count,
  ERROR count, `stripRecommendation`, `refRecommendation`, Suggest value or
  boot footer, unless the difference traces to a decision in this plan that
  the prototype did not follow. Report both numbers and the trace.
- The ledger differs from the app path on any scenario, or
  `factoryParity.test.ts` fails, at any commit.
- A floor is lowered anywhere except B8 in B and B6 in D, or further than
  §Expected outcome. A floor that should rise does not.
- A group moves a number §What planning measured attributes to another group.
  For example, E or C moves a count, or B7 moves in C.
- Suggest returns no count for any of B1–B8 or the four smoke templates.
- A SAME_DAY_VIOLATION fires on a phase that ends before the hard end.
- The regional window fails to bind in its test.
- A change needs `METHODOLOGY.md` to say something it does not. The spec is the
  owner's, so stop and ask.
- A dispatch needs a file its task does not list.
- The live smoke fails on anything but the updated measured numbers.

## What this costs

- **NAC Vet/Div1/Junior suggests 103 strips**, past the ~100-strip venue ceiling.
  The manual's longer large-bracket DEs and the 10-hour planning day cause it.
  The levers are days, flighting and entry caps, not strips. Cost if ignored:
  Suggest offers an implausible venue for the largest template.
- **B6 places 45 of 54**, five fewer than after A. The regional Group 1 window,
  the dropped rest day, Group 3 and the shorter first and last days each cost
  events on an oversubscribed ROC board. They are owner-approved rules, and
  the count is recorded, not tuned.
- **B8 loses one event for three groups** (B through C) and gets it back in D.
  The 9:00 start costs it, and the first and last-day capacity recovers it.
- **The three new engine findings stay out of the app** until 016. Users see
  the store's late-finish row for a late day, but not the regional window or
  first/last-day findings.

## Re-measuring

The probe serves two uses: each group's re-baseline (Suggest and boot footer),
and a full rebuild of the prototypes if `src/` or `__tests__/` on `main` has
moved since `7975e4efea`.

- A throwaway Vitest file under the worktree's `tmp/`, run with
  `pnpm -C <wt> exec vitest run tmp/<file>`.
- Per scenario it records the ledger count, ERRORs, WARNs by cause,
  `stripRecommendation` and `refRecommendation` the way `driftLedger.test.ts`
  computes them, plus `runAppPath`'s placed count.
- It records the four templates' Suggest, replaying `scripts/smoke.mjs`'s store
  actions in order at video strips 12, days 4, NAC.
- It records B1's boot footer (placed / unplaced / pinned), booting B1 through
  the store, and its schedule row count.

For a rebuild, repeat the planning method once per group in order, in a
detached scratch worktree. Any number that moves replaces the one in these
tables before its task runs.
