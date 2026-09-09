<!--
Sync Impact Report
- Version change: (none) -> 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections: Core Principles (I-V), Integrity, Governance
- Removed sections: none
- Templates requiring updates: plan-template.md (✅ consistent),
  spec-template.md (✅ consistent), tasks-template.md (✅ consistent)
- Follow-up TODOs: none
-->

# workflow-script-harness Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)

Test-driven development is mandatory for all production code: a failing
test MUST exist before the corresponding implementation is written, and the
red-green-refactor cycle MUST be followed for every change. No production
code is merged without a test that exercised it first.

**Rationale**: the harness's entire purpose is to make workflow-scripts
testable; the harness itself must be held to at least that same standard, or
its own defects go undetected.

### II. Dependency Minimalism

The project MUST rely exclusively on the language's built-in testing
facilities — no third-party test framework may be introduced. No runtime
dependency may be added unless strictly necessary, and any addition MUST be
explicitly justified (what it replaces, why the standard library is
insufficient) at planning time, before it is introduced.

**Rationale**: a test harness that itself carries a heavy or fragile
dependency tree undermines the trust callers place in it, and adds
maintenance surface disproportionate to the project's scope.

### III. Faithful Sandbox Fidelity

The runtime mock MUST reproduce the real sandbox's constraints faithfully,
not merely approximate them. Capabilities the real sandbox denies to a
tested script (host system access, sources of non-determinism such as wall
clock time or randomness) MUST be actively blocked within the mock, not
simply left undocumented or assumed absent. A script that would fail or be
rejected in the real sandbox MUST also fail in the harness.

**Rationale**: a mock that is more permissive than production gives false
confidence — a script "passing" the harness must mean it would also pass in
the real environment.

### IV. Script Compatibility, Never Script Adaptation

A workflow-script under test MUST run unmodified — the harness adapts to the
script's structure and calling conventions, never the reverse. No test may
require altering the script being tested (renaming functions, adding
harness-specific hooks, restructuring control flow) to make it runnable.

**Rationale**: the value proposition is testing real, production-bound
scripts as-is; a harness that requires script modifications to run defeats
its own purpose and risks masking behavior that would differ in production.

### V. Deterministic, Genuinely Concurrent Verification

Tests MUST be deterministic and reproducible across runs. Where the
underlying DSL expresses concurrent or pipelined execution, the harness's
verification of that behavior MUST exercise genuine concurrent execution
semantics — sequential execution that merely stands in for concurrency is
not an acceptable substitute, because it cannot surface ordering or
interleaving defects that only manifest under real concurrency.

**Rationale**: concurrency bugs (ordering assumptions, shared-state races)
are exactly the class of defect this harness exists to catch; simulating
concurrency away would silently exempt the highest-risk behavior from
verification.

## Quality Gates

Every change MUST pass the full automated test suite before being
considered complete. A change that only makes "the tests pass" without the
tests actually asserting the intended behavior does not satisfy this gate —
test coverage MUST reflect the acceptance criteria it claims to verify, not
merely execute the code path without assertions.

## Integrity

### Pre-Commit Hook Enforcement (NON-NEGOTIABLE)

Pre-commit hooks are a critical integrity gate. The following are
prohibited:

- **NEVER** use `git commit --no-verify` or `git commit -n` to bypass hooks
- **NEVER** delete, modify, or disable files in `.git/hooks/`
- **NEVER** use git plumbing commands (`git commit-tree`, `git mktree`) to
  circumvent hooks
- If a pre-commit hook blocks a commit, **fix the root cause** — do not
  work around the hook
- For assertion integrity failures: re-run `/iikit-04-testify` to
  regenerate hashes

**CI enforcement recommended**: add `verify-assertion-integrity.sh` to the
CI pipeline for server-side verification that cannot be bypassed.

## Governance

This constitution supersedes all other project practices. Every plan,
spec, and task MUST demonstrate compliance with these principles before
implementation begins; any deviation MUST be justified in writing in the
relevant plan document and approved before proceeding.

Amendments require: a documented rationale, an explicit version bump
(MAJOR for principle removal/redefinition, MINOR for a new principle,
PATCH for wording clarifications), and explicit user approval — this
constitution MUST NOT be amended unilaterally.

**Version**: 1.0.0 | **Ratified**: 2026-09-09 | **Last Amended**: 2026-09-09
