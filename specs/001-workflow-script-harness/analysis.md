# Specification Analysis Report

**Feature**: 001-workflow-script-harness
**Date**: 2026-09-09
**Method**: initial pass drafted by `bailian-coding-plan/qwen3-max-2026-01-23`
via opencode, independently spot-checked against the actual repository
content before acceptance — the delegate's draft reported **zero
findings**, which two direct greps and a manual read of `tasks.md`
disproved. Findings below are the corrected, verified set.

## Specification Analysis Report

| ID | Category | Severity | Location(s) | Summary | Recommendation |
|----|----------|----------|-------------|---------|----------------|
| A01 | F (Coverage Gap) | HIGH | tasks.md (fixed) | FR-002 requires `phase()` and `log()` as ambient DSL globals, but the original tasks.md (T001-T046) had no task implementing either — only `agent`/`parallel`/`pipeline`/`args`/`budget` had explicit tasks. | **Fixed directly** (tasks.md is not hash-locked): inserted T009-T012 (write-test/implement pairs for `phase()` incl. `meta.phases` validation, and `log()`) into Phase 2 Foundational; all subsequent task IDs renumbered T013-T050. |
| A02 | H1 (Untested requirement) | HIGH | tests/features/*.feature | No `.feature` scenario carries an `@FR-002` tag (`grep -rn "@FR-002" tests/features/*.feature` → 0 matches), even though TS-001 already exercises `agent()` as an ambient global and could legitimately carry this tag. | Not fixed here (hash-locked content) — re-run `/iikit-04-testify` to add `@FR-002` to TS-001's tag line, or accept as a documented exception (see tasks.md's "Known gap" note). |
| A03 | H1 (Untested requirement) | HIGH | tests/features/*.feature | No scenario carries an `@FR-012` tag. FR-012 (HarnessError vs. ScriptError classification) is cross-cutting and currently only covered by a planned unit test (T046), not by any BDD scenario — none of the 14 scenarios exercises a genuine `ScriptError` path (a plain script bug), only `HarnessError` paths. | Not fixed here — decide whether FR-012 needs its own dedicated scenario (a script with a real bug, e.g. `undefined.property`) via `/iikit-04-testify`, or remains unit-test-only by design. |

No findings for passes A (duplication), B (ambiguity), C (underspecification),
D (constitution alignment — all 5 principles ALIGNED, including the
v2.0.0 Cucumber exception being correctly scoped and unused-so-far), E
(phase separation), G (inconsistency), G2 (prose ranges), or H2 (orphaned
tags — every `@FR-XXX`/`@SC-XXX` tag that IS present does correspond to a
real spec.md ID).

**Constitution Alignment**:
- I. Test-First: ALIGNED — every tasks.md pair is test-then-implement
- II. Dependency Minimalism: ALIGNED — plan.md confirms zero runtime deps;
  the v2.0.0 `@cucumber/cucumber` exception is correctly scoped to BDD
  execution only, `node:assert` still used throughout
- III. Faithful Sandbox Fidelity: ALIGNED — research.md Challenge 4 +
  tasks.md T005/T006/T039-T044 actively block forbidden globals
- IV. Script Compatibility: ALIGNED — T015/T016 explicitly test/audit for
  script-text immutability
- V. Deterministic, Genuinely Concurrent Verification: ALIGNED — T027/T028
  require real `Promise.all` concurrency with counter-based (not
  timestamp-based) trace verification

**Coverage Summary** (FR-XXX / SC-XXX → tasks, BDD tag, plan reference):

| Req | Tasks | BDD tag present? | Plan ref |
|---|---|---|---|
| FR-001 | T003, T004, T013, T015 | @FR-001 (TS-001, TS-002) | plan.md Technical Context |
| FR-002 | T009, T010, T011, T012, T013, T027, T029, T034, T036 | **none** (A02) | plan.md Technical Context |
| FR-003 | T020, T021 | @FR-003 (TS-004) | plan.md |
| FR-004 | T022, T023 | @FR-004 (TS-005) | plan.md |
| FR-005 | T024, T025 | @FR-005 (TS-006) | plan.md |
| FR-006 | T027, T028, T031, T032 | @FR-006 (TS-007, TS-009) | research.md Challenge 3 |
| FR-007 | T029, T030, T031, T032 | @FR-007 (TS-008, TS-009) | research.md Challenge 5 |
| FR-008 | T034, T035 | @FR-008 (TS-010) | plan.md |
| FR-009 | T036, T037 | @FR-009 (TS-011) | plan.md |
| FR-010 | T039, T040, T041, T042 | @FR-010 (TS-012, TS-013) | research.md Challenge 4 |
| FR-011 | T043, T044 | @FR-011 (TS-014) | research.md Challenge 4 |
| FR-012 | T046, T047 | **none** (A03) | contracts/error-types.md |
| FR-013 | T017, T018 | @FR-013 (TS-003) | data-model.md |
| SC-001..SC-005 | (via their FR tasks) | present except where inherited from FR-002/FR-012 | plan.md Acceptance Criteria |

**Metrics**:
- Total requirements: 18 (13 FR + 5 SC)
- Total tasks: 50 (after fixing A01; was 46)
- Coverage (task-level): 100% — every FR/SC has ≥1 task
- Coverage (BDD-tag-level): 16 of 18 (89%) — FR-002 and FR-012 are the
  exceptions (A02, A03)
- Findings: CRITICAL 0, HIGH 2 (open: A02, A03) + 1 HIGH found-and-fixed
  (A01), MEDIUM 0, LOW 0

**Health Score**: 90/100 (baseline — first run, no prior trend)

Score = `100 - (0×20 + 2×5 + 0×2 + 0×0.5)` = 90, counting only the two
currently-open findings (A02, A03); A01 is already resolved in tasks.md.

## Score History

| Run | Score | Coverage | Critical | High | Medium | Low | Total |
|-----|-------|----------|----------|------|--------|-----|-------|
| 2026-09-09T19:40:00Z | 90 | 89% (BDD-tag) / 100% (task) | 0 | 2 | 0 | 0 | 2 |

## Next Actions

No CRITICAL issues — safe to proceed to `/iikit-07-implement`. The two
open HIGH findings (A02, A03) are traceability completeness gaps, not
missing functionality (the underlying behavior IS planned via unit tests
either way) — recommend resolving via a follow-up `/iikit-04-testify` run
before or shortly after implementation, not as a hard blocker.

## Remediation Offer

Suggest concrete remediation edits (re-running `/iikit-04-testify` to add
the `@FR-002`/`@FR-012` tags, or drafting a new FR-012-specific scenario)?
Not applied automatically — awaiting a decision.
