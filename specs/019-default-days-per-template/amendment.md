# 019 METHODOLOGY amendment – draft for the owner's approval

Covers rulings R1 and R1a (a template raises the day count to its hard-rule minimum, read by the
board's type) and R4 and R4a (Div 1 and Junior team never share a day, cited to Ops Manual p.20 –
Group 1 bullet 1). R3, the hint, is UI and stays out of the spec. Task A0 commits the approved
text verbatim, alone, before any code.

Line numbers are `METHODOLOGY.md` at `8de0d5a12b`, before any edit. The blocks are numbered in
the order A0 applies them, bottom of the file first, so every line number holds when its block is
applied.

Review record: an Opus drafter and an independent Opus checker, then the plan review's amendment
lens with an adversarial verifier per must-fix. Corrections taken: Block 3's range (:216-236), the
regional override sentence in Block 6, Block 1's Appendix B bullet of its own (the departure was
filed under the Group 1 bullet 3 rule, which R4a rules out), Block 2's "bullet 1" citation and
departure flag, Block 8's tier wording and :78, and Block 9's co-day and added-day wording. The
bullet 1 quote in Block 6 was checked against the 2026-27 Ops Manual p.20 (the PDF cached on
2026-10-05): "For any one weapon, the Div I, Junior, and Cadet competitions must not be held on the
same day."

## Block 1 – Appendix B, :1122 and :1124

(a) :1124, delete the last sentence of the "Group 1 bullet 3 kept hard at regional types" bullet.

Before: ` The cross-level blocks (Div 1 ind ↔ Junior team, Junior ind ↔ Div 1 team) stay as specified in [Individual/Team Separation](#individualteam-separation).`

After: nothing. The bullet then ends at "See [Same-Population Conflicts](#same-population-conflicts)."

(b) Insert a new bullet directly after :1122 ("Group 1 at regional types"), the rule these pairs
are an exception to:
```
- **Div 1 and Junior individual/team pairs kept hard at regional types.** Ops Manual p.20 – Group 1 bullet 1 keeps the Div I, Junior and Cadet competitions of one weapon off the same day, and the spec makes the rest of Group 1 soft at ROC, RYC and RJCC. Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team of the same weapon and gender stay hard there, because each team event draws from the other level's individual field (see [Individual/Team Separation](#individualteam-separation)).
```

## Block 2 – Appendix A, :1016

Before:
```
| Ind/team relaxable block | ∞ at level < 3 | **Relaxable**: specific ind/team cross-category pairs; relaxed at level 3 |
```
After:
```
| Ind/team cross-level block | ∞ | **Hard block** at every type: Div 1 ind ↔ Junior team and Junior ind ↔ Div 1 team, same weapon+gender, must be on different days (Ops Manual p.20 – Group 1 bullet 1). Hard at ROC, RYC and RJCC (departure) |
```

## Block 3 – Constraint Relaxation, :316, :322, :325

Only the lines that name the relaxable tier.

Before (:316):
```
The scheduling system uses three tiers of constraints: **Hard** (never relaxed), **Relaxable** (infinite penalty at levels 0–2, relaxed at level 3), and **Soft** (finite penalties, active at level 0). Progressive relaxation proceeds through these tiers when no valid assignment exists.
```
After:
```
The scheduling system uses two tiers of constraints: **Hard** (never relaxed) and **Soft** (finite penalties, active at level 0). Progressive relaxation proceeds through these tiers when no valid assignment exists.
```
Before (:322): `| 0 (full constraints) | All rules active: hard blocks, relaxable ind/team pairs, soft preferences, proximity |`

After: `| 0 (full constraints) | All rules active: hard blocks, soft preferences, proximity |`

Before (:325): `| 3 | Drops relaxable constraints (Individual/Team hard blocks); same population still produces a warning but is allowed as last resort |`

After: `| 3 | Same population still produces a warning but is allowed as last resort |`

## Block 4 – Individual-Team Proximity, :308-310

The soft-pair paragraph moves here from the deleted §Relaxable Constraints (Block 6). Wording
unchanged, except its first line becomes a list bullet.

Before:
```
- **Veteran team**: must be adjacent to ANY veteran individual of the same weapon/gender (Vet Combined or Vet Age 40–80)

(see Appendix A for exact values)
```
After:
```
- **Veteran team**: must be adjacent to ANY veteran individual of the same weapon/gender (Vet Combined or Vet Age 40–80)
- **For other overlapping individual/team pairs**: 4-hour separation required, in either direction
  - e.g., Vet Team at 9 AM allows Div 2 Individual at 11 AM
  - Individual before team is a soft preference, not a hard rule
  - When such a pair lands on the same day (because their constraint is soft, not hard), the runtime sequencer enforces `team_pools_start >= indiv_DE_end + 120 min` and emits `SEQUENCING_CONSTRAINT` (INFO).

(see Appendix A for exact values)
```

## Block 5 – :298, the Soft Separation (Y14/CADET/JUNIOR↔DIV1 team) row

Before: `A pair that a hard or relaxable block already separates stays blocked.`

After: `A pair that a hard block already separates stays blocked.`

## Block 6 – §Relaxable Constraints goes, §Individual/Team Separation joins Hard Constraints

(a) Delete :216-236 inclusive. The `---` at :237 then follows :214 after one blank line.

Before:
```
---

## Relaxable Constraints

These constraints apply as infinite penalties at constraint relaxation levels 0–2, behaving like hard blocks. At level 3 (last resort), they are relaxed. See [Constraint Relaxation](#constraint-relaxation).

### Individual/Team Separation

Cross-category indv/team pairs that are hard-blocked at levels 0–2 but relaxable at level 3 (same weapon+gender required):
- **Div 1 ind ↔ Junior team**: Junior team draws from Div 1 individual pool
- **Junior ind ↔ Div 1 team**: Div 1 team draws from Junior individual pool

(see [`constants.ts`](src/engine/constants.ts) — `INDIV_TEAM_RELAXABLE_BLOCKS`)

Note: same-category indv/team pairs (Junior↔Junior, Cadet↔Cadet, Div1↔Open Team, Vet↔Vet, etc.) are hard-blocked by [Same-Population Conflicts](#same-population-conflicts) and are *not* relaxed at level 3.

**For other overlapping individual/team pairs**: 4-hour separation required, in either direction
  - e.g., Vet Team at 9 AM allows Div 2 Individual at 11 AM
  - Individual before team is a soft preference, not a hard rule
  - When such a pair lands on the same day (because their constraint is soft, not hard), the runtime sequencer enforces `team_pools_start >= indiv_DE_end + 120 min` and emits `SEQUENCING_CONSTRAINT` (INFO).

```
After: nothing.

(b) Insert under Hard Constraints after :93 (the end of Same-Population Conflicts, before
`### Veteran Age-Group Co-Day Rule`). The heading keeps its old wording, so the
`#individualteam-separation` links and the `§Individual/Team Separation` code comments still
resolve.
```

### Individual/Team Separation

- At every tournament type, these cross-level individual/team pairs of one weapon and gender are on different days:
  - **Div 1 ind ↔ Junior team**: Junior team draws from the Div 1 individual pool
  - **Junior ind ↔ Div 1 team**: Div 1 team draws from the Junior individual pool
- Source: Ops Manual p.20 – Group 1 bullet 1 ("For any one weapon, the Div I, Junior, and Cadet competitions must not be held on the same day").
- At NAC, SYC and SJCC both pairs already fall under the [Group 1](#overlapping-population-separation-group-1) pair DIV1 and JUNIOR. At ROC, RYC and RJCC, where Group 1 pairs are soft, these two stay hard – a departure listed in [Appendix B](#appendix-b-departures-from-the-operations-manual).
- Same-category individual/team pairs (Junior↔Junior, Cadet↔Cadet, Div1↔Open Team, Vet↔Vet, etc.) are blocked by [Same-Population Conflicts](#same-population-conflicts).

(see [`crossover.ts`](src/engine/crossover.ts), [`constants.ts`](src/engine/constants.ts))
```

## Block 7 – §Outputs, :78

Before: `- **Bottleneck diagnostics**: warnings and errors identifying resource conflicts, constraint relaxations, or policy violations`

After: `- **Bottleneck diagnostics**: warnings and errors identifying resource conflicts or policy violations`

## Block 8 – §Inputs, a sub-bullet under :55

Before:
```
- **Tournament duration**: 2–4 days (longer events, e.g. Summer Nationals, to be supported in a future version)
```
After:
```
- **Tournament duration**: 2–4 days (longer events, e.g. Summer Nationals, to be supported in a future version)
  - Loading a template raises the day count to that template's minimum when the board has fewer days, and never lowers it. The minimum is the fewest days that meet every hard day rule among the template's events under the board's tournament type – hard pairs on different days, and each Veteran age-group co-day on one day. The days already on the board keep their start and end times, and each added day gets the default 9:00 AM to 7:00 PM. Under NAC, SYC and SJCC the NAC Cadet/Junior, NAC Div1/Junior and NAC Vet/Div1/Junior templates need 4 days and Junior Olympics needs 3. Under ROC, RYC and RJCC, where Group 1 pairs are soft (see [Regional Types](#regional-types-soft-with-a-time-of-day-window)), NAC Vet/Div1/Junior needs 3. Every other combination of template and type needs 2 or fewer.
```

## Block 9 – Table of contents, :18-36

Entry 4 goes and the entries after it are renumbered.

Before:
```
4. [Relaxable Constraints](#relaxable-constraints)
5. [Soft Preferences](#soft-preferences)
6. [Constraint Relaxation](#constraint-relaxation)
7. [Competition Math](#competition-math)
   - [Pool Composition](#pool-composition)
   - [Strip Budget](#strip-budget)
   - [Flighting](#flighting)
   - [Direct Elimination (DE)](#direct-elimination-de)
8. [DE Capacity Estimation](#de-capacity-estimation)
9. [Resources](#resources)
   - [Strip Assignment](#strip-assignment)
   - [Referee Calculation](#referee-calculation)
10. [Concurrent Phase Scheduler](#concurrent-phase-scheduler)
11. [Scheduling Algorithm](#scheduling-algorithm)
12. [Tournament-Type Policies](#tournament-type-policies)
13. [Auto-Suggestion Logic](#auto-suggestion-logic)
14. [Capacity-Aware Day Assignment](#capacity-aware-day-assignment)
15. [Scheduler Stops at Semis](#scheduler-stops-at-semis)
16. [References](#references)
```
After:
```
4. [Soft Preferences](#soft-preferences)
5. [Constraint Relaxation](#constraint-relaxation)
6. [Competition Math](#competition-math)
   - [Pool Composition](#pool-composition)
   - [Strip Budget](#strip-budget)
   - [Flighting](#flighting)
   - [Direct Elimination (DE)](#direct-elimination-de)
7. [DE Capacity Estimation](#de-capacity-estimation)
8. [Resources](#resources)
   - [Strip Assignment](#strip-assignment)
   - [Referee Calculation](#referee-calculation)
9. [Concurrent Phase Scheduler](#concurrent-phase-scheduler)
10. [Scheduling Algorithm](#scheduling-algorithm)
11. [Tournament-Type Policies](#tournament-type-policies)
12. [Auto-Suggestion Logic](#auto-suggestion-logic)
13. [Capacity-Aware Day Assignment](#capacity-aware-day-assignment)
14. [Scheduler Stops at Semis](#scheduler-stops-at-semis)
15. [References](#references)
```

## Left for 021 (not fixed here)

1. **:86** says hard rules "cause scheduling to fail or produce errors" and "are never relaxed".
   The engine falls back to the least-bad day and emits a WARN (`src/engine/dayColoring.ts`
   ~650-686).
2. **:90** says same population is "hard at every relaxation level", while the level-3 row (:325)
   says it is "allowed as last resort". After R4 nothing reaches level 3, so the level-3 row and
   :328 describe a level the engine never uses.
3. **:316** says Hard is "never relaxed", which conflicts with the level-3 row.
4. **:323-324**: day colouring does not implement levels 1 and 2. :294-295 and :1002 ("suppressed
   at level >= 2") depend on them.
5. **:327** "Each relaxation emits a warning" – after R4 no relaxation exists to emit one.
6. **:328** "scheduling fails with an unresolvable error" – the engine uses the least-bad fallback
   and a WARN `UNAVOIDABLE_CROSSOVER_CONFLICT`. :739 ("escalate through Constraint Relaxation")
   inherits it, and :700 still calls the engine "constraint-relaxing".
7. **:318** cites `dayAssignment.ts` for relaxation. The pass was in `dayColoring.ts`.
8. The paragraph Block 4 moves: "4-hour separation required" conflicts with its own example (9 AM
   to 11 AM) and with the 120 minutes the sequencer enforces (`INDIV_TEAM_MIN_GAP_MINS`), and
   "required" conflicts with "their constraint is soft".
9. Vet co-day splits made by the least-bad fallback are not reported, though :97 makes the co-day
   rule hard.
10. **:293** and **:1001** describe the regional Group 1 pair penalty for "a Group 1 pair
    (DIV1↔JUNIOR, …)". Group 1 matches by category across individual and team, so the two cross-level
    pairs match it but stay hard. A clause naming the exception would close it.
