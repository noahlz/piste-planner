# Specification Quality Checklist: The workbench is rebuilt on the approved design

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-07
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

All items pass. No clarification markers were needed: every decision the spec
depends on was taken by the product owner on 2026-09-07 and recorded in
`docs/design/workbench-design-alignment-2026-09-07.md` §9, which the spec
treats as the rule. Four judgement calls made while drafting are recorded
here because each had a plausible alternative.

1. **The spec points at the alignment document rather than restating it.**
   FR-066 names "alignment §6" for the deletion list and the Context names §9
   for the decisions. Restating either would give one fact two homes
   (constitution §Planning Artifacts). The behaviours that result from each
   decision are stated in user terms, with the I-number or D-number beside
   them where a reader might want the reasoning.

2. **Three rules the alignment document leaves open are settled here and
   flagged in §Assumptions.** A pin on a day that no longer exists (FR-060),
   the late-finish finding covering an overrun as well as the final 45
   minutes (FR-025), and what "overflow" means as one source for the dashed
   cue, the footer count and the finding (FR-012). Each is the reading the
   surrounding rows of the alignment document imply, and each is marked as an
   assumption so a later reader knows it was not a product-owner decision.

3. **Process requirements sit in a named group, not among the behaviours.**
   FR-066 to FR-071 record the smoke-driver, drift-ledger, human-look and
   deletion-order rules the product owner stated in the request. They are
   testable (a search returns nothing, a ledger diff is explained, a
   screenshot is reviewed) but they describe how the feature is delivered
   rather than what an organizer sees. They are grouped and labelled so a
   reader can tell the two apart.

4. **One measured figure corrects the record.** The alignment document says
   the smoke driver presses **Suggest** three times. It presses four
   (`scripts/smoke.mjs` lines 367, 786, 863, 912). The spec states four and
   notes the discrepancy in its Context table rather than silently
   repeating the document's figure.

As in 012, §Context and §Assumptions carry file references as evidence for
measured claims (the preset B1 figures, the ledger floors, the fencer minimum,
the driver's line count). None appears in a requirement or a success
criterion.

Two engine-facing requirements (FR-054, FR-055) describe *when* the engine
must treat a pinned event as fixed – before day assignment, before packing –
because that ordering is the behaviour: a pin honoured after day assignment
would not keep crossover neighbours off its day. That is stated as an
observable property, not as a data structure.
