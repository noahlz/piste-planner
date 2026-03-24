# PRD Revision Task List
Source: `docs/plans/prd-review-research.md` (research conducted 2026-03-23)

Tracks open issues against PRD v5.1 found via Ops Manual comparison, internal consistency analysis, and community feedback review.

---

## P0 — Must Fix Before Implementation

- [ ] **P0-1** Weapon-scope crossover penalties — same-weapon Group 1 pairs → INFINITY; cross-weapon same-demographic → 0.0 (Section 4.1/4.2, research §1.1–1.2)
- [ ] **P0-2** Time-system mismatch in `LATEST_START` check — `DAY_START(day) + LATEST_START_MINS` mixes absolute and wall-clock time; correct to `DAY_START(day) + (LATEST_START_MINS - DAY_START_MINS)` (Section 11.1 line 1433, research §3.4)
- [ ] **P0-3** `DIV1↔DIV1A` indirect penalty not producible by `build_penalty_matrix()` — algorithm traverses A→B→C but neither DIV1 nor DIV1A is a source key; fix graph, algorithm, or remove entry (Section 4.1/4.2, research §3.2)
- [ ] **P0-4** DE bracket=32 boundary contradiction — text says prelims exist at bracket≥32 but formula gives `prelims_bouts=0`; reconcile text and formula (Section 10.1, research §3.3)

---

## P1 — Should Fix

- [ ] **P1-1** Expand `VETERAN` enum to `VET40/VET50/VET60/VET70/VET80` — distinct video replay thresholds and crossover characteristics (research §1.3)
- [ ] **P1-2** Add `DEFAULT_VIDEO_BY_CATEGORY` table encoding Ops Manual video replay defaults by category (research §1.4)
- [ ] **P1-3** Define `early_start_penalty()` — called at line 1536, implements 8AM_PATTERN_A/B/C logic, never specified (research §3.5)
- [ ] **P1-4** Define `find_earlier_slot_same_day()` — called at lines 1595, 1617 for deadline reschedule; never specified (research §3.5)
- [ ] **P1-5** Define `allocate_pool_resources_paired()` — called at line 1566 for concurrent pair strip allocation; never specified (research §3.5)
- [ ] **P1-6** Add `use_single_pool_override` field to COMPETITION struct (Section 2.4) — referenced in Section 7.1 but missing from struct definition (research §3.6)
- [ ] **P1-7** Wire 12 bottleneck cause codes to emission points — codes defined in Section 2.9 but no algorithm path emits them (research §3.7): `STRIP_CONTENTION`, `STRIP_AND_REFEREE_CONTENTION`, `SEQUENCING_CONSTRAINT`, `SAME_DAY_DEMOGRAPHIC_CONFLICT`, `SAME_TIME_CROSSOVER`, `UNAVOIDABLE_CROSSOVER_CONFLICT`, `8AM_PATTERN_A/B/C`, `INDIV_TEAM_ORDERING`, `FLIGHT_B_DELAYED`, `STRIP_DEFICIT_NO_FLIGHTING`, `VIDEO_STRIP_CONTENTION`
- [ ] **P1-8** Fix Flight B strip count for odd pool counts — use `FLOOR(n_pools/2)` for Flight B, not `CEIL` (Section 13, research §3.8.1)
- [ ] **P1-9** Add `de_duration_table` entry for `bracket_size=2`, or document 2-fencer promotion as unsupported (Section 2.5/10.1, research §3.3)
- [ ] **P1-10** Hard-error (not WARN) when zero refs for a weapon on all days that have competitions of that weapon (Section 15, research §3.8.5)
- [ ] **P1-11** Clarify double-stripping terminology — PRD uses "double-strip" to mean one referee on two strips; Ops Manual means one pool run across two strips simultaneously; reconcile (research §1.6)
- [ ] **P1-12** Add Y10 early-in-day soft preference (Ops Manual Group 2, research §1.8)
- [ ] **P1-13** Document that `ADMIN_GAP_MINS = 15` maps to the Ops Manual mandatory result review period (research §1.7)

---

## P2 — Nice to Have

- [ ] **P2-1** Encode additional Group 2 soft preferences as penalties: first/last day shorter than middle days; daily ROW-weapon vs. epee balance; rest day between Junior↔Cadet and Junior↔Div1 (research §1.8)
- [ ] **P2-2** Document source of foil/epee pool duration differentiation (PRD: 90 vs 120 min; Ops Manual: identical at 6.5 min/bout) (research §1.5)
- [ ] **P2-3** Add two-round pool format support for large events (203+ fencers, Div1 Men's Epee/Foil as of 2024-25) (research §4.4)
- [ ] **P2-4** Add max-retry guard to deadline reschedule loop (currently implicitly bounded by 17 slots/day but undocumented) (research §3.8.3)
- [ ] **P2-5** Prohibit or explicitly handle concurrent pair where priority event also requires flighting (research §3.8.2)
- [ ] **P2-6** Warn on `REQUIRED` video policy + `SINGLE_BLOCK` format (dead configuration — SINGLE_BLOCK always ignores video policy) (research §3.8.6)
- [ ] **P2-7** Fix `INDIV_TEAM_MIN_GAP` naming inconsistency — Section 15 uses `INDIV_TEAM_MIN_GAP`, Section 17 defines `INDIV_TEAM_MIN_GAP_MINS` (research §3.9)
- [ ] **P2-8** Document repechage as an explicit exclusion (modern NACs use simple DE) (research §1.14)

---

## Completed

- [x] **P0-1 (partial)** Weapon-scope fix — updated `crossover_penalty()` comment and team-ordering check to require same weapon; full graph restructure still needed (P0-1 above)
