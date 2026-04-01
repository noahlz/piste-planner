# Methodology Document Cleanup

## Context

METHODOLOGY.md (712 lines) has grown organically and needs cleanup: misclassified constraints, redundant sections, numeric values scattered through prose, aspirational content mixed with current behavior, fencer count defaults that don't match integration test data, and transient engineering status that belongs in project tracking.

The existing engine plans (CSP enhancements, Engine Fixes D) already track the implementation work referenced in the methodology's "Known Engine Limitations" and "Integration Test Status" sections.

## Decisions

- **Aspirational content**: keep inline with `[PLANNED]` labels
- **Numeric penalties**: move ALL to a comprehensive end appendix (replaces current Section 4 table)
- **Constraint tiers**: three-tier model (Hard / Relaxable / Soft)
- **Engineering status**: move Known Engine Limitations + Integration Test Status to TODO.md
- **Reorganization**: logical flow matching the scheduling pipeline

## Target Structure

```
1. Inputs and Outputs
2. Hard Constraints (never relaxed, ∞ penalty)
   - Same-Population Conflicts
   - Overlapping-Population Separation (Group 1)
   - Single-Day Fit
   - Same-Day Completion
   - Resource Preconditions
   - Team Events Require Matching Individual
   - Team Events Cannot Use Cuts
   - Fencer Count Bounds
3. Relaxable Constraints (∞ at low levels, relaxed at level 3)
   - Individual/Team Separation
4. Soft Preferences (finite penalties, relaxed at levels 1-2)
   - Demographic Crossover
   - Soft Separation (DIV1 ↔ CADET) — moved from Hard Constraints
   - Early-Start Conflicts
   - Rest Day Preference
   - Proximity Preference
   - Weapon Balance
   - Cross-Weapon Same Demographic
   - Y10 Early Scheduling
   - Last-Day Referee Shortage
   - Individual-Team Proximity
5. Constraint Relaxation — updated to reference three tiers explicitly
6. Competition Math
   a. Pool Composition (sizing, duration, parallelism)
   b. Flighting
   c. Direct Elimination (brackets, cuts, DE modes, video replay)
7. Resources
   a. Strip Assignment (video preservation, resource windows, slot granularity)
   b. Referee Allocation (types, refs per pool, pod captains)
8. Capacity Model [PLANNED]
   a. Strip-Hours as the unit of day capacity (strips × hours)
   b. Estimating competition strip-hours: pool phase (n_pools × pool_duration) + DE phase (strips × DE_duration)
   c. Pool duration estimation by weapon (epee vs foil vs sabre bout times)
   d. DE duration estimation by mode (full DE, staged DE with video phases)
   e. Age-category weight modifiers (DIV1=1.5, JR/CDT=1.3, Y10=1.2, etc.)
   f. Day capacity scoring: fill-ratio thresholds and penalty curve
   g. Video-strip budget: separate tracking, peak concurrent demand model
9. Scheduling Algorithm — label [PLANNED] subsections
10. Tournament-Type Policies
11. Auto-Suggestion Logic — fencer count tables updated from integration tests
12. References
Appendix A: Penalty & Constant Defaults (all numeric values)
```

## Specific Fixes

### Contradictions & Inconsistencies (Issues A–J from exploration)

| Issue | Fix |
|-------|-----|
| A. DIV1↔CADET in Hard Constraints | Move to Soft Preferences (Section 4) |
| B. Ind/Team "hard block at level < 3" framing | Move to Relaxable Constraints (Section 3) with clear explanation |
| C. ROC last-day ref penalty missing value | Add specific value (0.3) or mark [TBD] |
| D. "Strong/moderate penalty" prose labels | Remove numeric values from prose, use only qualitative ("high/moderate penalty"). Appendix has exact values. |
| E. SJCC/RJCC described as identical | Add note: "Functionally identical rules; SJCC is the national-level variant" |
| F. Fencer defaults in Auto-Suggestion | Keep in Auto-Suggestion (that's where the engine uses them) |
| G. "Target Architecture" in algorithm section | Add `[PLANNED]` label, note it's tracked in Plan D |
| H. Broken #gender-equity anchor | Remove Gender Equity content entire. Not immediately relevant to day schedule planning. |
| I. Proximity 2-day neutral gap | Add explicit note in prose: "2 days apart is neutral (no penalty, no bonus)" |
| J. Constraint Relaxation vague about what drops at level 2 | Enumerate specific preferences dropped at each level |

### Fencer Count Defaults Update

Replace the NAC-scale and Regional-scale tables in Auto-Suggestion with values derived from integration test scenarios B1–B7. The integration tests use real tournament data (rounded to nearest 10) from fencingtimelive.com.

Approach: average the entry counts across integration test scenarios per category/weapon/gender, rounding to nearest 10. Where a category only appears in one scenario, use that scenario's values directly.

### Engineering Status Migration

- Move "Known Engine Limitations" content to TODO.md under a new "Engine Limitations" heading
- Move "Integration Test Status" content to TODO.md under a new "Integration Test Baseline" heading  
- Cross-reference the existing plans (Plan D, CSP enhancements) where applicable
- Remove Sections 14 and 15 from METHODOLOGY.md

### Capacity Model Section (New — Section 8)

Write a new `[PLANNED]` section explaining the capacity-aware day assignment model. Content drawn from Plan D (`2026-03-29-engine-fixes-D-binpack-capacity.md`):

- **Strip-hours**: the unit of day capacity. A day with 80 strips and 14 hours has 1,120 strip-hours.
- **Estimating competition strip-hours**: pool phase (`n_pools × pool_duration_mins / 60`) + DE phase (`strips_allocated × de_duration_mins / 60`). For staged DEs, also compute video-strip-hours for R16 + finals phases.
- **Pool duration by weapon**: explain that bout times differ by weapon (epee bouts tend longer due to non-combativity, sabre fastest), affecting pool duration estimates. Reference the engine's `weightedPoolDuration` calculation.
- **DE duration by mode**: full DE (all bouts on general strips) vs staged DE (early rounds general, R16+ on video strips with serialized phases).
- **Age-category weights**: DIV1=1.5, JR/CDT=1.3, Y10=1.2, Y12/Y14=1.0, VET 40/50=0.8, VET Combined/60+/70/80=0.6, DIV1A/DIV2/DIV3=0.7. Qualitative rationale only in prose; exact values go to appendix.
- **Day capacity scoring**: qualitative description of the fill-ratio penalty curve (gentle at moderate fill, steep near full, strongly discouraging when nearly overloaded). Exact thresholds in appendix.
- **Video-strip budget**: separate capacity tracking. Peak concurrent demand model — staged DE phases release strips as rounds progress, so multiple events can share video strips if peak demand fits.

### Appendix A Construction

Move the Penalty Defaults Table (current Section 4) to an end appendix. Expand to include:
- All penalty values (from current table)
- Timing constants (admin gap, day length, pool-start cutoff)
- Video strip options (4/8/12/16)
- Flighting threshold (200+ fencers)
- Pod captain ratio (1:8 strips)
- Fencer count bounds (2–500)
- DE minimum advancement (2 fencers)
- Pool size ranges
- Any other hardcoded constants from prose

Prose throughout the document should use qualitative descriptions only ("high penalty", "bonus", "strongly discouraged") and reference the appendix for exact values.

## Files Modified

- `METHODOLOGY.md` — full restructure
- `.claude/plans/TODO.md` — receives engine limitations and test status content

## Verification

1. All internal markdown anchors resolve (no broken `#references`)
2. Every numeric constant in the appendix can be traced to a specific prose reference
3. No numeric penalty values remain in prose sections (only qualitative)
4. Fencer count defaults match integration test averages
5. `[PLANNED]` labels applied to all aspirational content
6. Three-tier constraint model is internally consistent with Constraint Relaxation section
7. No content lost — every section from the original has a home in the new structure or in TODO.md
