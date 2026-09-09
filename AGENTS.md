# workflow-script-harness — Agent Instructions

This project follows the Intent Integrity Kit (IIKit) spec-driven workflow.
Governance lives in `CONSTITUTION.md`, project context in `PREMISE.md`, and
the active feature spec in `specs/001-workflow-script-harness/spec.md`.

## Non-negotiable constraints (from CONSTITUTION.md)

- **Test-First (NON-NEGOTIABLE)**: write a failing test before any
  production code; red-green-refactor.
- **Dependency Minimalism**: use ONLY the language's built-in testing
  facilities — no third-party test framework. No runtime dependency may be
  added unless strictly necessary, and any addition must be explicitly
  justified in the plan/design output before being introduced.
- **Faithful Sandbox Fidelity**: the mock runtime must actively block what
  the real sandbox denies (host access, non-deterministic primitives) — not
  merely omit them.
- **Script Compatibility, Never Script Adaptation**: a workflow-script under
  test must run unmodified. Never require changes to the script being
  tested to make it runnable.
- **Deterministic, Genuinely Concurrent Verification**: tests must be
  deterministic and reproducible; where the DSL expresses concurrency
  (`parallel()`, independent `pipeline()` steps), verification must exercise
  real concurrent execution — sequential simulation is not acceptable.

## Tech stack (once decided in plan.md)

- Language/runtime: Node.js (built-in `vm` module for sandboxing).
- Test tooling: `node:test` + `node:assert` only.
- No npm packages unless explicitly justified in `plan.md`.

## Do not

- Do not commit or push. Report your changes; the orchestrator reviews,
  commits, and pushes.
- Do not modify `.feature` files or hash-locked test specs directly.
- Do not bypass git hooks (`--no-verify`, `-n`, plumbing commands).
