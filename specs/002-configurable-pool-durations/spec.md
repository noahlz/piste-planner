# Feature Specification: Configurable Pool Round Durations

**Feature Branch**: `002-configurable-pool-durations`

**Created**: 2026-08-28

**Status**: Draft

**Input**: User description: "Make pool round durations user-configurable. The engine already accepts pool_round_duration_table (Record<Weapon, number>, minutes for the 6-person/15-bout baseline) on TournamentConfig, but buildConfig.ts hardcodes DEFAULT_POOL_ROUND_DURATION_TABLE (epee 120, foil 105, sabre 75) and no store state or UI writes it. Motivation: USA Fencing may provide better completion-time data about how long pool rounds actually take, and organizers should be able to apply it without a code release. Durations are average completion times - ad-hoc floor practices like double-stripping are absorbed in the averages, never modeled. Scope: a store field, editor UI showing the per-weapon defaults with override affordance (defaults stay visible, not blank inputs), the buildConfig.ts bridge (the only store-to-engine path), and serialization of the table in saved/shared configs. Serialization is mandatory, not optional - results must be reproducible from config alone (constitution I), and a shared URL that omits the table must fall back to defaults via the omitted-key back-compat pattern used in P1's removed-field tests. Shape the config so a per-category dimension (the youth-event pool duration idea in docs/design/backlog.md) can later land in the same table without a second override system - but per-category values themselves are out of scope here. Engine math is unchanged: poolDurationForSize and weightedPoolDuration already consume the table. See the 'Configurable pool round durations' entry in docs/design/backlog.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Override a Weapon's Pool Round Duration (Priority: P1)

A tournament organizer receives updated completion-time data (for example, from USA Fencing) showing that epee pool rounds at their venue average 110 minutes rather than the built-in 120. They open the planner's settings, see the current per-weapon durations with the built-in defaults clearly labeled, enter 110 for epee, and every recomputed schedule immediately reflects the shorter pool rounds.

**Why this priority**: This is the feature. Applying better duration data without a software release is the entire motivation, and nothing else in this spec has value without the ability to override.

**Independent Test**: Can be fully tested by opening the duration settings, changing one weapon's value, and verifying the computed schedule's pool round lengths change accordingly while the other weapons keep their defaults.

**Acceptance Scenarios**:

1. **Given** a planner with no duration overrides, **When** the organizer opens the pool duration settings, **Then** they see one duration per weapon showing the default values (epee 120, foil 105, sabre 75 minutes) identified as defaults, never blank inputs.
2. **Given** the pool duration settings are open, **When** the organizer sets epee to 110 minutes, **Then** recomputed schedules use 110 minutes for full epee pool rounds while foil and sabre are unchanged.
3. **Given** an overridden value, **When** the organizer views the settings again, **Then** the override is shown alongside the default it replaced, so the default remains discoverable.
4. **Given** an overridden value, **When** the organizer reverts it, **Then** the weapon returns to its default duration and schedules recompute accordingly.
5. **Given** the settings are open, **When** the organizer enters a value that is not a positive duration (zero, negative, or non-numeric), **Then** the value is rejected with feedback and the last valid duration remains in effect.

---

### User Story 2 - Shared and Saved Configurations Carry the Durations (Priority: P2)

An organizer who has customized pool durations shares the tournament plan by URL (or saves it and reloads later). The recipient opens the link and sees exactly the schedule the sender saw – the customized durations travel with the configuration.

**Why this priority**: Reproducibility from config alone is a constitutional requirement (Principle I). Without it, an override would silently vanish on share or reload and two people would see different schedules from the "same" plan. It is P2 only because it depends on P1 existing.

**Independent Test**: Can be tested by setting an override, sharing/saving the configuration, loading it fresh, and verifying the override and the resulting schedule are identical to the original.

**Acceptance Scenarios**:

1. **Given** a configuration with epee overridden to 110 minutes, **When** it is saved or encoded into a share URL and loaded elsewhere, **Then** the loaded plan shows the same override and computes an identical schedule.
2. **Given** a configuration with no overrides, **When** it is saved and reloaded, **Then** the plan still shows and uses the default durations.

---

### Edge Cases

- Overriding only one weapon: the other weapons keep their defaults, and the mixed table (one override, two defaults) round-trips through save/share intact.
- An override equal to the default: treated as a valid value, and the schedule is identical to the default schedule.
- Extreme but positive values (for example 10 or 600 minutes): accepted within the validation bounds, and schedules stretch or compress accordingly – the planner reports infeasibility through its existing mechanisms rather than rejecting the duration.
- A saved configuration containing a malformed duration table (wrong type, unknown weapon, non-positive number): rejected with a clear validation error, consistent with how other invalid saved fields are handled.
- Pool sizes other than the 6-fencer baseline: the entered value is the 6-fencer/15-bout baseline, and other pool sizes continue to scale from it exactly as they do from the defaults today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The planner MUST let the organizer view the pool round duration for each weapon, with the built-in default values visible and labeled as defaults – never presented as empty fields.
- **FR-002**: The planner MUST let the organizer override each weapon's duration independently, and MUST keep the default visible while an override is in effect.
- **FR-003**: The planner MUST let the organizer revert an override back to the default.
- **FR-004**: Entered durations MUST be validated as positive whole minutes within a sane range, with invalid entries rejected and the last valid value retained.
- **FR-005**: Overridden durations MUST flow into schedule computation through the single existing configuration bridge, and recomputed schedules MUST reflect them. The meaning of a value is unchanged: the average completion time of a full 6-fencer (15-bout) pool round, from which other pool sizes scale as they do today.
- **FR-006**: Saved and shared configurations MUST include the duration table, so any schedule is reproducible from its configuration alone and a recipient sees the sender's exact schedule.
- **FR-007**: A saved or shared configuration that omits the duration table MUST load without error and fall back to the defaults. This is schema leniency (it keeps existing test fixtures and hand-trimmed configs valid), not a compatibility promise – the product is unreleased and backwards compatibility is a non-goal.
- **FR-008**: A saved or shared configuration containing an invalid duration table MUST be rejected with a clear validation error, consistent with existing schema validation behavior.
- **FR-009**: The duration configuration MUST be shaped so a future per-age-category dimension (the youth-event idea in the backlog) can extend the same table rather than requiring a second override system. Per-category values themselves are out of scope.
- **FR-010**: With no overrides set, computed schedules MUST be identical to those produced before this feature existed.

### Key Entities

- **Pool round duration table**: One average completion time (whole minutes) per weapon for the baseline 6-fencer/15-bout pool round. Defaults: epee 120, foil 105, sabre 75. An organizer's overrides replace individual entries; unoverridden entries keep their defaults. Travels with saved and shared configurations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An organizer can apply new completion-time data to all three weapons in under a minute of interaction, without any software release or code change.
- **SC-002**: 100% of schedules computed from a shared or reloaded configuration with custom durations match the originator's schedule exactly.
- **SC-003**: With no overrides set, schedule output across the existing B1–B8 baseline scenarios shows zero drift.

## Assumptions

- Overrides are per tournament plan (part of the plan's configuration), not a device- or user-level preference. This follows from reproducibility: the configuration alone must determine the schedule.
- A revert-to-default affordance exists per weapon. The description requires defaults to stay visible, and showing a default the user cannot return to would be misleading.
- Validation bounds are generous rather than strict – durations are averages an organizer may legitimately set far from the defaults, so the planner accepts any positive whole-minute value within a wide sanity range and lets existing feasibility reporting surface unworkable schedules.
- The saved-configuration schema absorbs the new table without a version bump: an omitted key means "use defaults" and only malformed present values are errors.
- The product is unreleased. Backwards compatibility with earlier saves, URLs, or schema shapes is a non-goal, here and in future features (owner decision, 2026-08-28).
- Double-stripping and other ad-hoc floor practices remain absorbed in the averages, never modeled – this feature changes who supplies the averages, not what they mean.
- Engine math is out of scope and unchanged: the engine already consumes the table wherever pool durations are computed.
