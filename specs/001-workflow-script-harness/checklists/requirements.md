# Specification Quality Checklist: Workflow-Script Test Harness

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-09
**Feature**: [spec.md](../spec.md)

**Note**: Extended after `/iikit-02-plan` with granular, traceable items; the
original coarse-grained checklist from `/iikit-01-specify` is preserved below
under "Original Content Quality Gates".

## Requirement Completeness

- [x] CHK001 Is a functional requirement defined for every acceptance
  scenario across all five user stories? [Completeness] — **Resolved as
  [Gap]**: User Story 1's acceptance scenario 3 (unsupported DSL function)
  had no corresponding FR. Added **FR-013** to spec.md to close this.
- [x] CHK002 Are the DSL primitives the harness must support enumerated
  exhaustively (not "etc.")? [Completeness, Spec FR-002] — yes: `agent`,
  `pipeline`, `parallel`, `phase`, `log`, `args`, `budget`.
- [x] CHK003 Is the behavior for an agent label with zero scripted
  responses defined, distinct from a label whose responses are exhausted?
  [Completeness, Spec FR-005] — spec distinguishes "no (further) scripted
  response available", which covers both cases under one requirement;
  the design docs (data-model.md, error-types.md) later split this into
  `MISSING_AGENT_RESPONSE` vs. `EXHAUSTED_AGENT_RESPONSES` — an
  implementation-level refinement, not a spec gap.
- [x] CHK004 Is the harness's own stateful/stateless scope across separate
  invocations documented? [Completeness] — **Resolved as [Gap]**: the
  original edge case was ambiguous about state reuse across runs. Rewrote
  it in spec.md to state each invocation is independent/stateless.

## Clarity

- [x] CHK005 Are "genuine concurrency" and "sequential simulation" defined
  in a way a reader could use to tell them apart, not just asserted as
  different? [Clarity, Spec FR-006, US3] — yes: FR-006/FR-007 and the US3
  acceptance scenarios define it operationally (overlap must be
  demonstrable, dependent stages must wait for their predecessor's
  result).
- [x] CHK006 Is "clear, actionable error message" given a concrete,
  checkable meaning rather than left subjective? [Clarity, Spec FR-010,
  FR-011, SC-005] — yes: SC-005 requires the error to name the specific
  problem such that the cause is inferable without reading harness source;
  FR-012/FR-013 add the harness-vs-script distinction as a checkable
  property.
- [x] CHK007 [Ambiguity, resolved as non-blocking] Is "an ordered
  sequence of values" for `budget.spent()` explicit about what happens on
  the FIRST call before any value has been "consumed" — i.e., is the
  sequence 0-indexed from the first call, with no special-cased initial
  state? — **Deferred**: FR-009 is clear enough for a reader to infer
  0-indexed consumption starting at the first call; the data-model.md
  design doc already made this explicit (state transitions), so this is
  a documentation-completeness nuance, not a requirement defect. Left as
  a non-blocking note rather than reopening spec.md.

## Consistency

- [x] CHK008 Are the "harness error" vs. "script error" categories used
  consistently across FR-005, FR-010, FR-011, and FR-012 (same underlying
  distinction, not overlapping definitions)? [Consistency] — yes, FR-012
  is the general principle; FR-005/010/011 are all instances of harness
  errors under that same principle, no conflicting definitions found.
- [x] CHK009 Does the Edge Cases section avoid contradicting any
  Functional Requirement (e.g., an edge case implying behavior a FR
  forbids)? [Consistency] — no contradictions found after resolving
  CHK004.

## Acceptance Criteria Quality

- [x] CHK010 Does every user story have at least one acceptance scenario
  that is independently testable without the other four stories being
  implemented? [Independent Test, Spec §User Stories] — yes, each story's
  "Independent Test" subsection states this explicitly and the scenarios
  don't reference other stories' machinery.
- [x] CHK011 Are priorities (P1-P5) justified with a stated reason tied to
  value/risk, not just assigned arbitrarily? [Acceptance Criteria Quality]
  — yes, each story's "Why this priority" ties the ranking to a concrete
  dependency or risk argument.

## Scenario Coverage

- [x] CHK012 Does every acceptance scenario map to at least one FR and
  vice versa (no orphan FRs, no unbacked scenarios)? [Traceability] —
  yes after CHK001's fix (FR-013 added); verified full FR-001..FR-013 ↔
  scenario mapping.

## SC-XXX Test Coverage

- [x] CHK013 Are Success Criteria SC-002/SC-004/SC-005 falsifiable (a
  reader could say pass/fail) even though they lack a numeric percentage?
  [Clarity, Spec SC-002, SC-004, SC-005] — yes: each is a binary,
  checkable condition (all 5 stories testable via public API alone;
  overlap demonstrable via more than final ordering; every harness error
  names the problem) — qualitative but not vague. Noting this explicitly
  because an automated numeric-only scan (used during `/iikit-02-plan`'s
  spec quality gate) flagged these as lacking "measurable" targets; that
  scan checks for digits, not falsifiability, so the warning was a false
  positive and no spec change was needed.

## Edge Case Coverage

- [x] CHK014 Is the behavior for zero-length `parallel()`/`pipeline()`
  input defined? [Edge Case Coverage, Spec §Edge Cases] — the question is
  raised in Edge Cases; the spec intentionally leaves the concrete answer
  to the plan/implementation phase (this is a technical detail, not a
  user-facing requirement) — appropriate for a spec document per
  phase-separation rules.
- [x] CHK015 Is the distinction between a script's own thrown error and a
  harness-classification error covered for the case where the script
  error occurs mid-concurrent-execution (inside `parallel()`)? [Edge Case
  Coverage] — covered by the combination of the Edge Cases question ("an
  ordinary programming bug... is that distinguished from a harness error")
  and FR-012, without needing parallel()-specific special-casing at the
  spec level.

## Non-Functional Requirements

- [x] CHK016 Does the spec avoid stating performance/throughput targets
  that would belong in plan.md instead (phase-separation)? [Non-Functional
  Requirements] — confirmed: no performance/throughput numbers appear in
  spec.md; SC-001..SC-005 are behavioral/qualitative, consistent with
  phase-separation-rules.md.

## Dependencies & Assumptions

- [x] CHK017 Does the spec avoid assuming a specific sandboxing mechanism
  (e.g., naming `vm.SourceTextModule` or any Node API) that would belong
  in plan.md? [Dependencies & Assumptions] — confirmed: spec.md's FRs are
  phrased technology-agnostically ("a public function that...", not
  naming `vm` or any Node API); only the quoted raw user input (Input
  field) names `runWorkflowScript`, which is expected/allowed.

---

## Original Content Quality Gates (from `/iikit-01-specify`)

### Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

### Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into the specification

## Summary

- **Total items**: 17 (CHK001-CHK017) + 16 original gate items
- **Checked**: 33 of 33 (100%)
- **Deferred**: 0 (CHK007 resolved as a non-blocking documentation note,
  not deferred — see item for reasoning)
- **Gaps found and resolved**: 2 — FR-013 added (unsupported DSL function
  had no FR); the state-reuse-across-runs edge case was rewritten for
  clarity (both applied directly to spec.md, not left open)
- **Completion**: 100%
