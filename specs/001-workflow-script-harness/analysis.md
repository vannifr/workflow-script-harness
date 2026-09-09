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
| A02 | H1 (Untested requirement) | HIGH — **RESOLVED** | tests/features/US1-run-unmodified.feature | No `.feature` scenario carried an `@FR-002` tag. | **Fixed** via a follow-up `/iikit-04-testify` run: `@FR-002` added to TS-001's tag line (2026-09-09, commit `8171982`). |
| A03 | H1 (Untested requirement) | HIGH — **RESOLVED** | tests/features/US1-run-unmodified.feature | No scenario carried an `@FR-012` tag; no scenario exercised a genuine `ScriptError` path. | **Fixed**: new scenario TS-015 added (a plain script bug classified as `ScriptError`, distinguishable from `HarnessError`), hash re-locked, 15 scenarios total (2026-09-09, commit `8171982`). |

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
- Total BDD scenarios: 15 (after fixing A02/A03 with TS-015; was 14)
- Coverage (task-level): 100% — every FR/SC has ≥1 task
- Coverage (BDD-tag-level): 18 of 18 (100%) — A02/A03 resolved
- Findings: CRITICAL 0, HIGH 0 open (3 found, all 3 fixed: A01, A02, A03),
  MEDIUM 0, LOW 0

**Health Score**: 100/100 (↑ improving, from 90 at first pass)

## Score History

| Run | Score | Coverage | Critical | High | Medium | Low | Total |
|-----|-------|----------|----------|------|--------|-----|-------|
| 2026-09-09T19:40:00Z | 90 | 89% (BDD-tag) / 100% (task) | 0 | 2 | 0 | 0 | 2 |
| 2026-09-09T19:55:00Z | 100 | 100% (BDD-tag) / 100% (task) | 0 | 0 | 0 | 0 | 0 |

## Next Actions

No open issues — clear to proceed to `/iikit-07-implement`.

## Remediation Offer

All findings from the first pass were remediated in this same session
(tasks.md fix + testify re-run); nothing outstanding to offer remediation
for.
