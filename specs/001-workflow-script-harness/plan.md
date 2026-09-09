# Implementation Plan: Workflow-Script Test Harness

**Branch**: `001-workflow-script-harness` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-workflow-script-harness/spec.md`

**Note**: This template is filled in by the `/iikit-plan` command.

## Summary

Build a test harness for Claude Code's Workflow-tool DSL that enables workflow-scripts
to run unmodified under `node:test` with scripted agent responses, budget values, and
verification of genuine concurrency. The harness uses Node's `vm` module to create a
sandboxed execution environment that blocks forbidden primitives (Date.now, Math.random,
Node APIs) and provides the DSL functions (`agent`, `pipeline`, `parallel`, `phase`,
`log`, `args`, `budget`) as ambient globals.

**Technical Approach**:
- ES module execution via `vm.runInContext()` with async wrapper to support top-level await
- Ambient globals injected into sandbox context (no imports required by scripts)
- Counter-based execution traces for deterministic concurrency verification
- Proxy-based global allowlist with explicit error messages for forbidden primitives
- Zero dependencies — only Node.js built-in `vm` module

---

## Technical Context

**Language/Version**: Node.js 18.x+
- Reason: the harness uses only long-stable `vm.createContext`/`vm.runInContext`
  (no version-specific `vm` API is required — see `research.md` Challenge 1/2);
  the actual floor is `node:test` availability, which CONSTITUTION.md mandates
  as the only test tool
- Minimum: Node.js 18.x (when `node:test` became available)

**Primary Dependencies**: None
- **Constitution Compliance**: Principle II (Dependency Minimalism) requires explicit justification
- **Justification for NONE**: Node.js `vm` module provides all necessary sandboxing capabilities.
  The harness's purpose is to test scripts against a mock runtime — adding dependencies would
  increase the attack surface and maintenance burden without providing functionality that the
  standard library lacks. All core features (sandboxing, module execution, concurrency primitives)
  are available via Node.js built-ins.

**Storage**: N/A (in-memory execution only, no persistence)

**Testing**: `node:test` + `node:assert`
- **Constitution Compliance**: Principle II mandates built-in testing facilities only
- No third-party test frameworks (Jest, Mocha, etc.) — use Node.js native test runner

**Target Platform**: Node.js runtime (Linux, macOS, Windows)

**Project Type**: single
- Single package/library
- No frontend, no mobile, no multi-package monorepo

**Performance Goals**:
- Script execution: <100ms for typical workflows (< 10 agent calls)
- Sandbox initialization: <10ms
- No specific throughput requirements — developer tooling, not production runtime

**Constraints**:
- **Deterministic**: Tests must be reproducible (no wall-clock dependencies)
- **Script compatibility**: Must run scripts unmodified
- **Sandbox fidelity**: Must actively block forbidden primitives
- **Zero dependencies**: Must not require npm packages

**Scale/Scope**:
- 1 core module (`src/harness.js`)
- 1 test file (`test/harness.test.js`)
- Support for 5 user stories (P1-P5)
- Expected script size: 10-500 lines
- Expected test size: 50-500 tests per project using the harness

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Test-First (NON-NEGOTIABLE) ✅

**Compliance**: All production code in the harness will be preceded by failing tests.
The implementation will follow red-green-refactor for every function and feature.

**Evidence**: The plan includes creating `test/harness.test.js` before `src/harness.js`.

---

### Principle II: Dependency Minimalism ✅

**Compliance**: Zero dependencies. Only Node.js built-in modules are used.

**Evidence**:
- `vm` module for sandboxing
- `node:test` for testing
- `node:assert` for assertions
- No npm packages required

**Justification**: The standard library provides all necessary capabilities:
- `vm.createContext()` for sandbox creation
- `vm.runInContext()` for script execution
- `Promise`, `Promise.all()` for concurrency
- `Proxy` for global allowlist

---

### Principle III: Faithful Sandbox Fidelity ✅

**Compliance**: The harness actively blocks forbidden primitives (Date.now, Math.random,
Node APIs) using a Proxy-based allowlist. Accessing a forbidden primitive throws an
immediate, descriptive error.

**Evidence**: `research.md` Challenge 4 documents the blocking strategy:
- Proxy with allowlist of permitted globals
- Explicit `FORBIDDEN_PRIMITIVE` error with the primitive name
- All Node.js built-ins and non-deterministic APIs are blocked

---

### Principle IV: Script Compatibility, Never Script Adaptation ✅

**Compliance**: The script text is used as-is. No modifications to the script file
or script content are required.

**Evidence**: `research.md` Challenge 2 documents the execution approach:
- `vm.runInContext()` executes the script text directly
- Ambient globals are injected into the context (no import statements required)
- Minimal text transformation for export capture is non-semantic (captures the value
  without altering control flow or logic)

**Note**: The contract specifies "globals are injected as ambient globals — the script
never imports them". The execution strategy respects this by providing globals in the
context, not via import statements.

---

### Principle V: Deterministic, Genuinely Concurrent Verification ✅

**Compliance**: 
1. **Deterministic**: Execution traces use monotonic counters (not timestamps), ensuring
   tests are reproducible and not flaky.
2. **Genuine Concurrency**: `parallel()` and `pipeline()` use `Promise.all()` and real
   async execution, not sequential simulation. The trace captures overlap via start/end
   counters.

**Evidence**: `research.md` Challenge 3 documents the concurrency verification approach:
- Counter-based traces (deterministic)
- `Promise.all()` for genuine concurrent execution
- Overlap detection via trace inspection

---

**Constitution Check Result**: ✅ All five principles satisfied. No violations to justify.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-workflow-script-harness/
  plan.md              # This file
  research.md          # Phase 0 output: technical research and design decisions
  data-model.md        # Phase 1 output: core entities, fields, relationships
  quickstart.md        # Phase 1 output: test scenarios and usage examples
  contracts/           # Phase 1 output: API contracts
    runWorkflowScript.md  # Public API signature, parameters, return values
    error-types.md        # Error types, codes, and when they occur
  tasks.md             # Phase 2 output (/iikit-tasks - NOT created by /iikit-plan)
```

### Source Code (repository root)

```text
src/
  harness.js           # Main module: runWorkflowScript() and supporting utilities

test/
  harness.test.js      # Test suite for the harness (node:test + node:assert)
```

**Structure Decision**: Single-project structure with one source module and one test file.
This is the minimal structure for a focused library with no dependencies and a single
public API. All complexity is in the `runWorkflowScript()` function and its internal
helpers, not in the file layout.

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations detected. All Constitution principles are satisfied without requiring
exceptions or workarounds.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | N/A        | N/A                                 |

---

## Implementation Phases

### Phase 0: Research (COMPLETED)

**Status**: Research documented in `research.md`

**Key Decisions**:
1. Use `vm.runInContext()` with async wrapper (not `vm.SourceTextModule`)
2. Inject globals as context properties (ambient, not imported)
3. Counter-based traces for deterministic concurrency verification
4. Proxy-based allowlist for active blocking of forbidden primitives
5. Fail-fast error handling in `parallel()` with detailed `ParallelError`

### Phase 1: Design (COMPLETED)

**Status**: Design documented in:
- `data-model.md` — Entities and relationships
- `contracts/runWorkflowScript.md` — API contract
- `contracts/error-types.md` — Error taxonomy
- `quickstart.md` — Usage examples

**Key Artifacts**:
- `ExecutionResult` structure (success vs. error)
- `ExecutionTrace` with counter-based entries
- `HarnessError` vs. `ScriptError` distinction
- Concurrency verification via overlap detection

### Phase 2: Tasks (NEXT)

**Command**: `/iikit-tasks` to generate `tasks.md`

**Expected Task Breakdown**:
1. Implement sandbox context creation with DSL globals
2. Implement `runWorkflowScript()` function skeleton
3. Implement `agent()` mock with scripted responses
4. Implement `parallel()` with genuine concurrency
5. Implement `pipeline()` with overlap semantics
6. Implement `phase()`, `log()`, `args`, `budget` mocks
7. Implement forbidden primitive blocking
8. Implement execution trace recording
9. Implement error classification (HarnessError vs. ScriptError)
10. Write comprehensive tests for each user story

---

## Risk Mitigation

### Risk 1: ES Module Execution Edge Cases

**Concern**: Top-level await and export statements may have edge cases in `vm`.

**Mitigation**: Test with realistic scripts from the content-os project before
considering the implementation complete. The quickstart scenarios cover the most
common patterns.

### Risk 2: Concurrency Verification May Miss Some Bugs

**Concern**: Counter-based traces prove overlap but may not catch all race conditions.

**Mitigation**: The trace records the exact order of events, enabling tests to verify
interleaving. This is stronger than just checking result order. For additional safety,
the harness could offer a "stress test mode" that runs the script multiple times with
different timings (future enhancement).

### Risk 3: Script Authors May Use Unsupported DSL Features

**Concern**: The real Workflow-tool may add new DSL functions not yet in the harness.

**Mitigation**: The `UNKNOWN_DSL_FUNCTION` error clearly identifies when an unsupported
function is called. The harness should be updated when new DSL features are added to
the real Workflow-tool.

---

## Acceptance Criteria

### Functional Requirements (from spec.md)

- [ ] FR-001: Script runs unmodified via `runWorkflowScript(scriptText, options)`
- [ ] FR-002: DSL primitives (`agent`, `pipeline`, `parallel`, `phase`, `log`, `args`, `budget`)
  available as ambient globals
- [ ] FR-003: Scripted agent responses per label and per order
- [ ] FR-004: Null/failed agent response simulation
- [ ] FR-005: Clear error when agent responses exhausted
- [ ] FR-006: Genuine concurrency in `parallel()` and `pipeline()`
- [ ] FR-007: Correct ordering between dependent pipeline stages
- [ ] FR-008: Scriptable `budget.total`
- [ ] FR-009: Scriptable `budget.spent()` sequence
- [ ] FR-010: Forbidden primitive detection (Date.now, Math.random, etc.)
- [ ] FR-011: Host capability blocking (Node APIs)
- [ ] FR-012: Distinguish harness errors from script errors

### Success Criteria (from spec.md)

- [ ] SC-001: 100% of scripts run without modification
- [ ] SC-002: All 5 user stories testable via public API alone
- [ ] SC-003: Null agent response triggers observable error-handling path
- [ ] SC-004: Concurrency verifiable via trace overlap (not just result order)
- [ ] SC-005: All harness errors name the specific problem

### Constitution Compliance

- [ ] All code preceded by failing tests (Principle I)
- [ ] Zero dependencies (Principle II)
- [ ] Forbidden primitives actively blocked (Principle III)
- [ ] Scripts run unmodified (Principle IV)
- [ ] Tests deterministic and concurrency genuine (Principle V)

---

## Next Steps

1. Run `/iikit-tasks` to generate `tasks.md`
2. Implement tasks in order, writing tests first for each
3. Verify all acceptance criteria pass
4. Test with realistic scripts from content-os project
5. Document any additional edge cases discovered during implementation