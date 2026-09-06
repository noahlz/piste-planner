# Specification Quality Checklist: The suggested strip count is one a venue can supply

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-06
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

All items pass. Three judgement calls made while drafting are recorded here,
because each one had a plausible alternative that a later reader might otherwise
assume was an oversight. None is a correction applied to an earlier draft.

1. **Requirements name behaviour, never source symbols.** FR-003 describes the
   lower bound as "the same demand estimate the feasibility finding already
   reports" rather than naming the function that computes it, and FR-015 says
   "the post-schedule strip recommendation" rather than naming it. The symbols
   appear only in §Context and §Assumptions, as evidence for measured claims.

2. **SC-007 is stated as a perceived delay, not a compute budget.** "Under two
   seconds" is the point an organizer would think the app had stopped. The
   measured ~350ms worst case sits well inside it, and writing the criterion at
   500ms would have pinned a success criterion to a search loop's internals.

3. **SC-004's 100-strip figure is a sanity check, not an enforced limit.** It is
   the product owner's domain judgement. The article cited during brainstorming
   confirms Summer Nationals' scale — 6,100 fencers, ten days — but does **not**
   state a strip count, and §Assumptions says so. The spec does not rest a
   pass/fail criterion on an unsourced number.

One item deserves a note rather than a change. §Context and §Assumptions carry
file and line references (`boot.ts:41`, `validation.ts:346`) that a strict
reading of "no implementation details" would flag. They are retained
deliberately: this feature reverses a decision made one feature ago and
contradicts a measurement table (`baseline.md` §5) that a later reader will
otherwise quote in good faith. Those references are the evidence for both claims,
and constitution III requires drift be measured rather than asserted. They appear
in context and assumptions only, never in a requirement or a success criterion.
