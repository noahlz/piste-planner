# 024 2026-27 Operations Manual conformance – handoff

**Status: delivered 2026-10-06** on branch `024-ops-manual-conformance-impl`
(worktree `.claude/worktrees/024-ops-manual-conformance-impl`, cut from `main`
`41e2b975ee`), awaiting the user's `merge-with-costs`. Plan:
[`plan.md`](./plan.md).

## What changed

In product terms: the engine now plans a tournament the way USA Fencing's
2026-27 Operations Manual and Athlete Handbook do. Pools and DEs take the
manual's times, the day runs 9:00 to 19:00 with a 22:00 hard end, NAC
individual events require video replay, and the same-day rules depend on the
tournament type. The drift ledger moved once per rule group, each in its own
commit with its drift record.

Headline, before to after (Base is `41e2b975ee`, After is `31c24abc13`):

| What | Before | After |
|---|---|---|
| Ledger B1–B8 scheduled | 24 / 24 / 24 / 18 / 12 / 40 / 18 / 53 | 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53 |
| ERRORs | 0 / 0 / 0 / 12 / 0 / 14 / 0 / 0 | 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0 |
| `stripRecommendation` | 48 / 70 / 68 / 76 / 32 / 65 / 64 / 51 | 53 / 77 / 73 / 74 / 29 / 63 / 82 / 56 |
| `refRecommendation` | unchanged at every step | unchanged |
| Suggest: ROC Div1A/Vet, NAC Youth, NAC Vet/Div1/Junior, NAC Cadet/Junior | 15 / 66 / 80 / 48 | 15 / 80 / 103 / 62 |
| B1 boot footer | 19 placed · 5 unplaced · 0 pinned | 15 placed · 9 unplaced · 0 pinned |

The ledger equals the app path on all eight scenarios, ids included, at every
commit. B1 still boots to 24 schedule rows.

What each rule group does now:

- **Task 0 – the floor clause (`6b986edb0f`).** Comments only. The drift
  ledger's floor rule gains a second admitted lowering beside 015's input
  correction: a floor may fall when an owner-approved METHODOLOGY amendment
  causes the drop (plan D3). Any other drop still halts.
- **A – times (`93ec5dc558`, review fix `dc0ee00c48`).** Pools use the pool of
  7 as their basis (120 foil, 120 épée, 60 sabre). DEs are derived round by
  round from the bout time at the strips actually granted, with byes not
  counted. Bout times are 20/20/13 minutes for 15-touch DEs, 15/15/10 for Y8,
  Y10 and every Veteran group, and 60/60/30 for team matches. An event that
  stages video splits at the manual's tier, the round of 16 for Div 1, Junior
  and Cadet and the round of 8 for everything else (Y8 by interpretation), and
  the video block asks `min(4, bracket / 2)` strips. Capacity bills bouts times
  bout time. A bracket of 2 has no DE, takes no strips and keeps its gold and
  bronze tail. Team events plan Single Stage with no video at every tournament
  type, and a validation ERROR rejects a hand-built team that is staged or
  requires video. The `de_duration_table` setting, `de_round_of_16_strips` and
  `DeBlockDurations` are gone. Users read "Video stage" where they read "R16",
  and Settings names the pool-of-7 basis. B4 18 to 19 and B6 40 to 50. Floors
  raised to match.
- **B – the day (`e9cf15518c`, `61c9f60bc9`).** The day starts at 9:00 and
  19:00 is a soft target. Work may run to a 22:00 hard end (`clockHardEnd` in
  `constants.ts` holds the rule, and an organizer day end after 22:00 becomes
  the hard end). Capacity and feasibility use a 600-minute day. A day that ends
  after its target draws one `day-ends-past-target` WARN, engine only. Suggest
  starts at the larger of its strip-hour floor and the busiest day's
  competitors divided by 14. The canvas axis and the ascii renderer reach the
  hard end. B8 53 to 52 (JR-W-EPEE-IND lost).
- **E – cuts (`682baec397`, `04d0b8f656`).** A DE field is capped at 256
  (`MAX_DE_FIELD`), silently. Y14 advances everyone by default at every type and
  its regional override row is gone. RYC joins the regional cut types. Timing
  only: no count, ERROR, strip recommendation or Suggest value moves.
- **C – video (`9e2bf1d582`, `5306d6d840`).** Every NAC individual event
  requires video. Every non-NAC event and every team event is best effort.
  `individual_video_policy` is a new column in `TYPE_DEFAULTS`, read through
  `resolveVideoPolicy(type, eventType)`. Timing and WARNs only: no count,
  ERROR, strip recommendation or Suggest value moves, and B7 is byte-identical.
- **D – same-day rules (`31c24abc13`, `9cfc696129`).** Group 1 now includes
  Div 1–Cadet and is keyed by category, weapon and gender. It is hard at NAC,
  SYC and SJCC. At ROC, RYC and RJCC it costs 5.0, and when such a pair shares
  a day the older side's pools wait until day start + 240 minutes (an INFO
  when the window holds and a WARN when a pin breaks it). Div 1–Div 1A is its
  own always-hard pair. The Junior–Cadet rest day is gone. Group 2 adds 3.0
  soft separations (Vet against Div 1A, Div 2 against Div 3, and Y14, Cadet
  and Junior against the Div 1 team), and Group 3 adds a 0.2 cross-weapon
  preference in day colouring. From 3 days, the first and last days plan to
  0.8 of a middle day's strip-hours, with a WARN when either is not shorter
  than the shortest used middle day. B4 19 to 21, B6 50 to 45, B8 52 to 53.
- **F – comment sweep (`2970b44c9a`).** Every comment that cited the 2019
  manual, the 2024-25 handbook or a `METHODOLOGY:<line>` now cites a 2026-27
  page or a section name. Comments, docs and test titles only. The snapshot is
  byte-identical.
- **S – live smoke (`60da35285d`).** The smoke driver passed six times against
  a dev server from this worktree, the last two consecutive, with no app
  defect. It gains two checks (below).
- **Docs.** `backlog.md` closes the two 024 entries, removes the RYC and Y14
  bullets, adds the entries named under Left unfixed and corrects the passages
  that 024 made stale. `competition-planner-workbench.md` marks row 024
  delivered, drops "DE prelims bout share" from row 018, narrows rows 021 and
  023, and records the new baseline. These two files are edited and
  uncommitted until the handoff commit.

Floors moved as below. The raises follow D2, and the two lowerings (B8 at B, B6 at D) use the policy-amendment clause (D3):

| Group | Floors B1–B8 after | Change |
|---|---|---|
| A | 24 / 24 / 24 / 19 / 12 / 50 / 18 / 53 | B4 and B6 raised |
| B | 24 / 24 / 24 / 19 / 12 / 50 / 18 / 52 | **B8 lowered 53 to 52** |
| E, C | unchanged | – |
| D | 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53 | B4 and B8 raised, **B6 lowered 50 to 45** |

## Measurements

| What | Value | Where |
|---|---|---|
| Unit suite | 81 files / 2148 tests, all pass (from 78 / 1830) | `60da35285d`, the last code commit |
| `tsc -b`, lint | clean, clean | every commit in the chain |
| Drift ledger snapshot SHA-256 | `a4a71e333c7749f46790b88e0dbd4d0a1a929549b4b2359290c193f37d596d19` to `7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06` | group D `31c24abc13`, unchanged after |
| B1–B8 scheduled | 24 / 24 / 24 / 18 / 12 / 40 / 18 / 53 to 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53, equal to the app path on all eight | `31c24abc13` |
| Live smoke | **pass** six times, the last two consecutive, no app defect | `60da35285d` |
| Boot, B1 | 24 schedule rows, footer `15 placed · 9 unplaced · 0 pinned` | live, 2026-10-06 |
| Suggest: ROC Div1A/Vet, NAC Youth, NAC Vet/Div1/Junior, NAC Cadet/Junior | 15 / 80 / 103 / 62, with 24, 66 of 66 and 24 rows on the last three | live, 2026-10-06 |

Smoke command:
`SMOKE_BASE=http://localhost:5187/piste-planner/ timeout 240 node scripts/smoke.mjs`,
after `pnpm -C <wt> dev --port 5187 --strictPort`. The unmodified driver
passed its first run. SC-008 reads 103 live, at 12 video strips.

Chain of measurements, oldest first. Every row's probe equalled the plan's row
for that group. Where a review-fix commit is shown, the numbers are unchanged
from the group commit above it unless the Notes column says otherwise.

| Step | Commit | Files / tests | Snapshot SHA-256 | Ledger B1–B8 | ERRORs | `stripRecommendation` | Suggest | Footer | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Base | `41e2b975ee` (main) | 78 / 1830 | `a4a71e333c77…` | 24/24/24/18/12/40/18/53 | 0/0/0/12/0/14/0/0 | 48/70/68/76/32/65/64/51 | 15/66/80/48 | 19/5/0 | probe reproduced it exactly before any change |
| Task 0 | `6b986edb0f` | 78 / 1830 | `a4a71e333c77…` (unchanged) | unchanged | unchanged | unchanged | unchanged | unchanged | comments only |
| A | `93ec5dc558` | 78 / 1929 | `a70cf75cf1d4…` | 24/24/24/19/12/50/18/53 | 0/0/0/11/0/4/0/0 | 45/64/64/64/28/57/60/63 | 15/65/90/68 | 16/8/0 | B4 +1, B6 +10 |
| A review fix | `dc0ee00c48` | 79 / 1947 | `66ac92dd51e0…` | unchanged | unchanged | unchanged | unchanged | unchanged | B8 VET-W-SABRE-IND-V80 `peak_de_ref_demand` 1 to 0 |
| B | `e9cf15518c` | 80 / 1986 | `8bdfcd41e428…` | 24/24/24/19/12/50/18/52 | 0/0/0/11/0/4/0/1 | 53/75/73/75/28/63/82/62 | 15/78/103/64 | 16/8/0 | B8 lowered under D3 |
| B review fix | `61c9f60bc9` | 80 / 1989 | `8bdfcd41e428…` (unchanged) | unchanged | unchanged | unchanged | unchanged | unchanged | – |
| E | `682baec397` | 80 / 2000 | `59d071f462df…` | unchanged | unchanged | unchanged | unchanged | unchanged | timing on B2 (7 of 24 events) and B3 (6 of 24) |
| E review fix | `04d0b8f656` | 80 / 2000 | `59d071f462df…` (unchanged) | unchanged | unchanged | unchanged | unchanged | unchanged | – |
| C | `9e2bf1d582` | 80 / 2030 | `77236f915acb…` | unchanged | unchanged | unchanged | unchanged, sweep 8/12/16 equals the plan | unchanged | timing on B1, B2, B3 and B8, and WARNs on B2 and B4–B6 |
| C review fix | `5306d6d840` | 80 / 2030 | `77236f915acb…` (unchanged) | unchanged | unchanged | unchanged | unchanged | unchanged | – |
| D | `31c24abc13` | 81 / 2137 | `7e2db75c38bb…` | 24/24/24/21/12/45/18/53 | 0/0/0/9/0/9/0/0 | 53/77/73/74/29/63/82/56 | 15/80/103/62 | 15/9/0 | B6 lowered under D3 |
| D review fix | `9cfc696129` | 81 / 2148 | `7e2db75c38bb…` (unchanged) | unchanged | unchanged | unchanged | unchanged | unchanged | tests only |
| F | `2970b44c9a` | 81 / 2148 | `7e2db75c38bb…` (unchanged) | unchanged | unchanged | unchanged | unchanged | unchanged | comments only |
| S | `60da35285d` | 81 / 2148 | `7e2db75c38bb…` (unchanged) | – | – | – | 15/80/103/62 live | 15/9/0 live | driver edit only |

`refRecommendation` at Base was 120/46, 160/10, 146/8, 108/0, 68/4, 33/1,
156/28, 110/30 (three-weapon / foil-épée) and did not move at any step. Every
Suggest value above places every event its template selects.

Ledger count after each group, from the plan's cumulative table and each
commit's probe:

| | Base | A | B | E | C | D |
|---|---:|---:|---:|---:|---:|---:|
| B4 SYC | 18 | 19 | 19 | 19 | 19 | 21 |
| B6 ROC | 40 | 50 | 50 | 50 | 50 | 45 |
| B8 NAC | 53 | 53 | 52 | 52 | 52 | 53 |

B1, B2, B3, B5 and B7 hold 24 / 24 / 24 / 12 / 18 at every step. Group D's
sub-step path for B4 was 19 / 19 / 19 / 18 / 21, so Group 3 alone took it to 18
at D.4, one below its pre-D floor. A group is judged whole (plan D1) and the
final row is the one its commit is held to.

### Test count chain

| Commit | Total | Δ | What |
|---|---|---|---|
| `41e2b975ee` (main) | 1830 | – | baseline |
| `6b986edb0f` Task 0 | 1830 | 0 | comments only |
| `93ec5dc558` A | 1929 | +99 | pool of 7, DE derivation, staging, capacity, team resolvers, bracket of 2 |
| `dc0ee00c48` A review fix | 1947 | +18 | bracket-of-2 asks, `placementLabels.test.ts` (new), label and settings tests |
| `e9cf15518c` B | 1986 | +39 | hard end, late-day WARN, ÷ 14 floor, axis |
| `61c9f60bc9` B review fix | 1989 | +3 | exact axis tests, 4-day WARN case |
| `682baec397` E | 2000 | +11 | the cap cases, regional tables |
| `04d0b8f656` E review fix | 2000 | 0 | exact default-cut pins replace weaker ones |
| `9e2bf1d582` C | 2030 | +30 | video policy column, three parity rows |
| `5306d6d840` C review fix | 2030 | 0 | fixtures and test names |
| `31c24abc13` D | 2137 | +107 | Group 1 by type, window (`regionalGroup1Window.test.ts`, new), Groups 2 and 3, first and last day |
| `9cfc696129` D review fix | 2148 | +11 | expansion and used-day coverage, ROC graph, premises restored |
| `2970b44c9a` F | 2148 | 0 | comments only |
| `60da35285d` S | 2148 | 0 | smoke driver only |
| handoff commit | 2148 | 0 | docs only |

The branch also carries `61927f73ce`, the S2 session prompt, which is docs
only.

## Reviews

- **Task 0.** None beyond the orchestrator's check that the snapshot stayed
  byte-identical.
- **A.** The drift audit ran as five judges (a split audit, because a judge
  refuses more than four items), plus `test-quality-reviewer` and
  `react-code-reviewer`, one bundled fix chain and a re-review. The fix commit
  made a bracket of 2 ask no strips everywhere (`deVideoStripAsk` and
  `deStripFootprint` return 0 when the bracket has no counted round), changed
  the phase label to "Video stage", pointed `r16-over-cap` at the lever that
  clears it (`max_de_strip_pct_override`), removed three dead pieces, and
  tightened two pinned-scheduling cases to assert their premises. The audit
  measured the bracket-of-2 change in a throwaway worktree first. No measured
  number moved, and one digest field did (B8 VET-W-SABRE-IND-V80
  `peak_de_ref_demand` 1 to 0). **It settled the team-spill question (D4):**
  confirmed as spec behaviour. B1's individual video blocks start later with
  the team ruling than without (JR-W-SABRE-IND 1895 to 2120, JR-W-EPEE-IND 2020
  to 2120, JR-M-EPEE-IND 2040 to 2120, D1-M-SABRE-IND 1115 to 1165,
  D1-W-FOIL-IND 1195 to 1220), none earlier. Team DEs fill the free general
  strips and then take idle video strips as overflow, which METHODOLOGY §Video
  Strip Preservation allows. The plan's 1925 was 1895 in the clean A/B. The
  review also corrected group A's commit message: B8's day-summary peaks moved
  at A.1 and A.2, not with the team ruling.
- **B.** Four drift judges, `test-quality-reviewer`, `react-code-reviewer`, one
  bundled fix, a re-review and a follow-up test pass. The fix commit put the
  `max(day_end, 22:00)` rule in one helper (`clockHardEnd`, called by
  `buildConfig.ts` and `Canvas.tsx`), pinned the canvas axis exactly (9:00 to
  22:00 by default, to 23:00 for a day ending at 23:00, and across two unequal
  days), added a 4-day late-day WARN case and corrected stale comments. **The
  8:00 control settled B8 53 to 52.** Re-run in a throwaway worktree with only
  the day start moved, it reproduced the plan's control row exactly (ledger
  24/24/24/19/12/52/18/53, `stripRecommendation` 53/75/73/74/28/63/82/56,
  Suggest 15/78/103/56). So the 9:00 start causes the loss, not the 600-minute
  capacity day or the soft target, and the D3 lowering has its isolation. The
  same review endorsed keying `findDayForTime` by the hard end and reading the
  inert 840 in `dayAssignment.ts` as the hard window.
- **E.** One drift judge and `test-quality-reviewer`. The fix commit pins every
  default cut's exact contents beside the two regional tables and moves the
  round-of-256 case to `deBlocksFor`. The judge corrected the commit's B2 WARN
  record: the middle-day average went 605 to 620 (not 610), so the 1.1x
  threshold rose 665.5 to 682 and the first-day-longer-than-middle WARN stopped
  firing. The Y14 all-advance default causes 10 of the 15 minutes. It also
  confirmed that "the cap alone moves nothing" holds only because the cap is
  there: without it B3's Y14 men (260, 270, 280) become 512 brackets.
- **C.** One drift judge, `test-quality-reviewer` and `react-code-reviewer`.
  The fix commit moved the last two 2-video-strip fixtures
  (`viewEquivalence.test.tsx`, `scheduleOutput.test.tsx`) to 4, renamed tests
  that overclaimed and noted that the video dead-config rule no longer fires
  on B4, B5 or B6. **The 8 / 12 / 16 video-strip sweep settled whether Suggest
  still finds a count once video binds.** It equals the plan's table
  (B3 73/73/73, B7 82/82/82, B8 64/62/62, NAC Youth 78/78/78, NAC
  Vet/Div1/Junior 103/103/103, NAC Cadet/Junior 64/64/64), with no null. B2's
  added WARN is day 3 ending 55 minutes past target because Y14-W-FOIL-IND's
  video stage is now required.
- **D.** Two drift judges, two spec judges, `test-quality-reviewer` and
  `react-code-reviewer`. No halt and no must-fix. Five test should-fixes were
  fixed, each checked against its mutant in a throwaway worktree. The
  re-review found one more, the dayColoring attribution comment, which was
  fixed before the commit. The fix commit
  covers day expansion's wiring (8 Y12 foil events at a 0.85 fill expand to 4
  days where ceil would give 3), the used-day comparison, the pinned-overflow
  footer premise, the ROC constraint graph, the run-note count and the help
  text. **The control run re-proved the sub-step attribution (D3).** With the
  0.8 factor set to 1 the probe gives row D.4 exactly, and with Group 3's
  weight also zeroed it gives row D.3. So D.5 accounts for B4 +3, B6 -1 and B8
  +1, and Group 3 for B4 -1 and B6 -2, whatever order the rules apply in. The
  spec judges found Group 2's open-team row, Group 3's per-sibling sum and
  the 0.8 factor confined to day colouring all follow METHODOLOGY's wording.
  The fix commit also records the full sub-step table (the group commit listed
  only some of the moves).
- **F.** Two adversarial judges checked every new comment against the code,
  the amended spec and a probe of the daySummaries fixtures.
- **S.** Six live passes, the last two consecutive, with two new driver checks
  beside the steps they read. The late axis (group B): on NAC Vet/Div1/Junior's
  matrix the block that ends latest after 19:00 (20:00 on day 3, one of four)
  draws inside its day's time grid, and the axis reaches 22:00. "Video stage"
  (group A): on NAC Youth's matrix a staged video block (Y10 Men's Saber, which
  stages at the round of 8) is named "Video stage" and its tooltip's phase
  field reads "Video stage". The first version of the axis check misread the
  hour ticks, which mark interval starts, and was corrected before the passing
  runs.

## Decisions made on the owner's behalf

### Owner rulings made in S1 (2026-10-06)

1. Dispatches may add or edit tests in `__tests__` files outside a task's file
   list when they cover the group's own planned behaviour or a review fix.
   `src/` stays strictly to the plan's lists. Each such file is named in its
   commit.
2. The phase label is "Video stage" (sentence case, like the other labels).
3. Task E's "300 teams" guard became 100 teams, since a 300-team field is an
   absurd case. The 256 cap still covers team fields, per D8.

### Decisions S1 and S2 made

Each with what it costs if wrong.

1. **The A.2 and A.3 checkpoint gap has a likely cause that was not confirmed.**
   At those two sub-steps Suggest read 15/65/114/68 with footer 16/8/0, where
   the prototype measured 15/65/none/54 and 17/7/0. Until the A.4 resolvers,
   this chain split a staged NAC team at its category's video-stage round, a
   video block of about 4 hours of 60-minute matches, while the prototype's
   old team block ran from the round of 32 (about 8 hours, unplaceable). The
   cause was not replayed. Cost if wrong: the real cause stays unnamed, but
   the final code has no team special case outside the resolvers, the team
   match time, the video-demand count and the D4 ERROR, and every group's final
   probe equalled its plan row.
2. **Team DEs spilling onto idle video strips is accepted as spec behaviour.**
   It delays B1's Junior video blocks by up to 225 minutes (1895 to 2120).
   Cost if wrong: NAC individual video events start later than an organizer
   would expect. It is on the backlog as an owner call.
3. **B-d4's default-hours test passed at once in the red run.** B-d1a had
   already moved the store's default hours earlier in the chain, so the test
   was not red at its own step. It is red against the group's base (08:00 and
   22:00 there). Cost: the test was never seen red at its own step. Its red is shown only
   against the group's base, so its failure mode was inferred from the chain,
   not watched.
4. **Tests in files outside the task lists were added or edited** under
   ruling 1. Group A: `placementLabels` (new), Block, DetailStrip,
   CanvasTooltip, SettingsPanel, findings and derived (`buildRefDemandByDay`
   exported for the 0-count interval test). Group B: `constants.test.ts`,
   `Canvas.test.tsx`, `analysis.test.ts`, `dayAssignment.test.ts`,
   `segments.test.ts`, `scheduleOutput.test.tsx`, `ExportPopover.test.tsx`,
   `invalidState.test.tsx`, `recompute.test.tsx` and `viewEquivalence.test.tsx`.
   Group C: the pre-shrink fixture. Group D: `regionalGroup1Window.test.ts`
   (new), `dayHardEnd.test.ts`, `stripSearch.test.ts`, `store.test.ts`,
   `UnplacedDock.test.tsx` and `TournamentPanel.test.tsx`. Cost: edits
   beyond the plan's lists, each reviewed with its group.
5. **Capacity's team fold was dropped.** It was a second model of a staged
   team, which D4's ERROR already rejects. `YOUTH_VET_BOUT_DELTA` (unread, and
   its -5 contradicted the 10-touch table) and an always-equal min/max in
   `refs.ts` went with it. Cost if wrong: a staged team that somehow reached
   capacity would bill differently, but no app or ledger path builds one.
6. **The pre-shrink fixture was regenerated on purpose twice.** Group A moved
   18 NAC team events to Single Stage, 12 team events per type to best effort
   and dropped `de_round_of_16_strips` from all 132 rows. Group C changed
   `de_video_policy` only (36 NAC Vet individual events to required, 12 ROC
   Div 1 and Junior individual events to best effort). Cost: none, the
   fixture follows the rules by design.
7. **A derive-oracle fixture was rebuilt, not the code.** The scheduler
   deferred multi-a's DE from 130 to 145 for strip contention, and `derive.ts`
   is contention-free by design, so only the fixture's premise moved. It is
   rebuilt on 28 strips at a 0.5 DE cap with checks that no contention fires.
   Cost if wrong: a real scheduler and `derive.ts` disagreement would be
   hidden. B's re-check found the premise holds.
8. **The 8:00-start control is the isolation for B8's floor (D3).** Cost if
   wrong: a different cause of the B8 loss would hide behind the lowered floor.
9. **Task E's 257-team cap case was declined.** The owner ruled a 300-team
   field absurd. Cost: the team half of the cap is covered by the code path,
   not a test.
10. **Group 3 (0.2) is summed per same-day cross-weapon sibling.** Foil beside
    épée and sabre adds 0.4. The spec states 0.2 per pair, and the spec judges
    agreed. Cost if wrong: a three-weapon demographic is pushed apart twice as
    hard as a pair.
11. **Group 2's open-team row matches the Y14, Cadet and Junior side at any
    event type** (only the Div 1 side is typed team), so a Y14 team against
    the Div 1 team also scores 3.0. Cost if wrong: one extra soft separation
    on NACs with Y14 teams, and none is modelled today.
12. **The 0.8 first and last day factor applies only in day colouring.**
    Capacity, strip search, validation and the day breakdown keep the full day,
    and day expansion is closed form. Cost if wrong: Suggest and feasibility do
    not plan the shorter edge days.
13. **The first and last day WARN keeps its rule ids**
    (`FIRST_DAY_LONGER_THAN_MIDDLE`, `LAST_DAY_LONGER_THAN_MIDDLE`) though its
    test is now "not shorter than the shortest used middle day". Cost: the ids
    read slightly off their rule.
14. **The B6 floor lowering was attributed by cumulative sub-step probes plus
    a control** (factor 1, then Group 3 zeroed), which is the D3 condition.
    Cost if wrong: the same as decision 8, for B6.
15. **Captured values were re-pinned, each with its cause.** The dayColoring
    NAC Cadet/Junior day map (a capture with no spec arithmetic, attributed by
    toggling rules), appPath's B1 `refRequirementsByDay` (re-derived by the
    reviewer), pinnedScheduling case 5's board 48 to 56 strips,
    stripSearch's undershoot fixture B4 to B5 and the
    `VIDEO_STRIP_CONTENTION` test moved to one day. Group A also re-pinned
    pinnedScheduling case 4's board (4, 48, 7) to (4, 48, 8) and moved
    concurrentScheduler's feasibility-only test to 48 fencers, and it suspended
    B4's feasibility-WARN presence pin until group B restored it. Group D
    re-pinned footerMetrics' B5 refs peak 116 to 118 and placements 9/3 to 8/4.
    Cost if wrong: a captured
    value that nothing derives could hide a later move.
16. **UnplacedDock's run-note test asserts the run's own counts** instead of
    pinning B4 21 of 9 (`store.test.ts` keeps that pin). Cost: none.
17. **`docs/design/methodology-reconciliation.md` keeps its
    `METHODOLOGY:<line>` and 2019 Ops Manual cites**, pinned by a header note
    to `a2dc363e45`, instead of re-pointing about 50 lines (plan Task F said
    re-point). Cost: a reader must use `git show` to follow them.
18. **The S1 workflow scripts moved out of the worktree's `tmp/`** to the
    session scratchpad, because ESLint lints `tmp/` and they broke
    `pnpm lint`. Cost: none, they are gitignored tooling.
19. **The D4 team ERROR was added with the A.4 resolvers rather than at A.3,**
    so no NAC team event errored mid-chain. Cost: none in the final tree.

## Left unfixed

- **NAC Vet/Div1/Junior suggests 103 strips**, past the venue ceiling of about
  100. The manual's longer large-bracket DEs and the 10-hour planning day
  cause it. The levers are days, flighting and entry caps, strips last. Cost if
  ignored: Suggest offers an implausible venue for the largest template.
  Unscheduled, an owner call (backlog).
- **`validation.ts`'s `cut-value-min-promotions` check reads a PERCENTAGE cut
  as the advancing share**, the inverse of `computeDeFencerCount`. 2 to 7
  fencers at a 20% cut are wrongly excluded, and a 99% cut passes and is
  floored to 2. Unscheduled (backlog).
- **The video-strip stepper accepts 0 up to the strip count** while the manual
  offers 4, 8, 12 and 16, and after 024 a NAC below 4 video strips excludes
  every individual event. Owner question: restrict it, or keep free entry and
  warn (backlog).
- **Team DEs spill onto idle video strips** and delay individual video blocks
  (B1, up to 225 minutes). Allowed by METHODOLOGY §Video Strip Preservation.
  An owner call (backlog).
- **Suggest's strip-hour floor reads general strip-hours only.** The spec says
  "total strip-hour draw", so the wording is ambiguous. The floor only seeds
  the search. **`suggestStripCount`, the ceiling, skips only fencer counts of
  1 or fewer** while the floor's spreads use `MIN_FENCERS` to `MAX_FENCERS`.
  Unscheduled (backlog).
- **The Tournament panel's type help text** ("Affects event grouping rules and
  scheduling priorities.") is accurate but vague. The type now sets Group 1
  hard or soft with a window, video policy, DE mode, refs per pool and default
  cuts, and the plan limited D's edit to the rest-day phrase. Its help `<p>`
  is also not tied to the radiogroup (no `aria-describedby`), so screen readers
  skip it. That part predates 024. An owner wording call (backlog).
- **The late-day WARN prints scheduler-axis minutes** (a day 3 reads "ends at
  4080 … target 4020"), and day-level findings share one dismissal key. For
  016 (backlog, §Day-level findings have no structured day).
- **`EARLY_START_CONSECUTIVE_HIGH_CROSSOVER` has no reader** in `src/engine`,
  a gap against METHODOLOGY §Early-Start Conflicts that predates 024. Feature
  021.
- **`crossover.test.ts` defines `bothOrders` twice with different signatures**,
  and its 12 Vet tests share one shape. Table them when next touched.
- **B6 places 45 of 54.** The regional Group 1 window, the dropped rest day,
  Group 3 and the shorter first and last days each cost events on an
  oversubscribed ROC board. They are owner-approved rules, and the count is
  recorded, not tuned. B4 places 21 of 30.
- **The three new engine findings stay out of the app** (the late-day WARN,
  the regional window INFO and WARN, and the first and last day WARN). A run
  keeps only placements, and the Findings panel reads `validateConfig` and
  `initialAnalysis`. Users see the store's late-finish row, which compares
  against the 19:00 target. Showing the rest is 016's job.
- **`docs/design/methodology-reconciliation.md`'s line cites are stale** by
  design (decision 17).
- **Div 1–Cadet wording, for the owner to confirm.** The backlog's quoted
  2026-10-05 ruling said "Div I–Cadet soft". The owner-approved METHODOLOGY
  amendment (`6a4107b710`) makes Div 1–Cadet a Group 1 pair, hard at NAC, SYC
  and SJCC and soft with the window at ROC, RYC and RJCC, and the plan called
  the "soft" wording stale. 024 follows the amendment.
- **Workbench row 018's "day-end overrun as a warning" narrowed under 024.**
  19:00 is now a soft target with a WARN and 22:00 is the hard end. Whether
  018's scope shrinks is the owner's call.

Out of scope by plan D14, still unbuilt:

- The Div I 75% promotion (018).
- Relaxation-level suppression of the regional pair (021).
- The Vet sibling and individual-to-team edges, which never bind today (B8's 60
  sibling pairs all run in parallel). Backlog, with the measured options.
- The Y8 Developmental Format (backlog).
- Wiring `validateSameDayCompletion` and the second Single-Day Fit bullet. The
  function has no caller in `src/`.
- Weapon-balance wiring (021).
- The age-category weights' "video serialization" rationale, which every
  category now shares.
- Team DE shape and team pools (023).

### For later features

`factoryParity.test.ts` now carries the video column and the team rule as
literals. A feature that changes `TYPE_DEFAULTS`, `resolveVideoPolicy`,
`defaultCutForEntry` or `buildCompetitions` must change the factory's own copy
(`TYPE_RULES` in `scenarios.ts`) in the same commit and list `scenarios.ts` and
`factoryParity.test.ts` among its editable files. 023 (the team-event pool
round) is exposed. The shared regional cut tables are now pinned by
exact-contents tests in `constants.test.ts`.

016 shows the three new engine findings and takes the late-day WARN's raw
minutes and shared dismissal key with it. 017 through 019 and 023 are measured
against the numbers above, so their drift reviews start from this ledger.

## Merge

Checked 2026-10-06 at `da227ab5f8`. `main` is still `41e2b975ee`, the
branch's merge base, so `git merge-tree --write-tree main
024-ops-manual-conformance-impl` returns the branch's own tree
(`b900c5a98066f84b2c22e34af25c593c5876db11`) with no conflict. On that tree
the full suite passes (81 files / 2148 tests), `tsc -b` and lint are clean, and
the snapshot SHA-256 is `7e2db75c38bb…`. A detached throwaway worktree was not
needed. If `main` moves before the merge, re-run the check there first. The
user merges with `merge-with-costs`.

## Resume prompt (after the merge)

```text
Piste Planner. Feature 024 (the 2026-27 Operations Manual conformance) is
delivered and merged into main, and its record is
specs/024-ops-manual-conformance/handoff.md.

Next is roadmap feature 016, hand placements obey the rules:
docs/design/competition-planner-workbench.md §Roadmap row 016, and
docs/design/backlog.md §"Hand-placed events are never checked against the
crossover constraint graph" and §"The scorecard's peak-referee row reads higher
than the scheduler's own", plus §"Day-level findings have no structured day"
(its "024's new findings add two cases for 016" part). 016 also shows the three
engine findings 024 kept out of the app (the late-day WARN, the regional window
INFO and WARN, and the first and last day WARN). Its drift is measured against
the ledger 024 left: B1-B8 scheduled 24 / 24 / 24 / 21 / 12 / 45 / 18 / 53,
ERRORs 0 / 0 / 0 / 9 / 0 / 9 / 0 / 0, snapshot SHA-256
7e2db75c38bb6e5702d3618e81127130739e9075536b843ca76a8cc368b89d06, 81 files /
2148 tests. If a change touches per-event derivation, list
__tests__/helpers/scenarios.ts and __tests__/store/factoryParity.test.ts among
its editable files and change the factory's copy in the same commit.

Start from the main checkout. Cut a fresh worktree off main, named for the
branch. Plan 016 yourself: no Spec Kit, choose the planning approach, and keep
the constitution's guardrails (drift ledger, test-first, live smoke, git
ownership). The user merges with merge-with-costs and makes the closing commit
with commit-with-costs. Agents commit only inside the worktree, and never push,
merge or make the closing commit.
```
