# Data Model: Workflow-Script Test Harness

## Overview

This document defines the core entities, their fields, relationships, validation rules,
and state transitions for the workflow-script test harness.

---

## Core Entities

### 1. WorkflowScript (Input)

**Description**: The source code of the script being tested. Provided as text, not a file path.

**Fields**:
- `text: string` — The complete source code of the workflow script
- `meta?: { name: string, description: string, phases: Phase[] }` — Optional metadata object
  - Extracted from `export const meta = ...` if present
  - Used to validate that `phase()` calls match declared phases

**Validation Rules**:
- MUST be valid JavaScript (syntax check before execution)
- MUST be an ES module (top-level `export` statements present)
- MAY include top-level `await` statements
- `meta` extraction: MUST be a pure literal object (no variables/calls in the object)

**Relationships**:
- Executed by `runWorkflowScript()` to produce an `ExecutionResult`
- Uses `AgentResponseScript` (via harness configuration)
- Uses `BudgetScript` (via harness configuration)

---

### 2. AgentResponseScript (Test Configuration)

**Description**: Defines the scripted responses for `agent()` calls, organized by label.

**Fields**:
- `responsesByLabel: Map<string, AgentResponse[]>` — Map from label to ordered list of responses
- Each `AgentResponse` is one of:
  - `{ type: 'value', value: any }` — Successful response with a value
  - `{ type: 'null' }` — Simulated failed/empty agent response
  - `{ type: 'error', error: Error }` — Agent call that should throw an error

**Validation Rules**:
- Labels MUST be non-empty strings
- Response lists MUST be non-empty arrays (at least one response per label)
- Responses MUST be consumed in order: first call with label `L` gets responses `L[0]`,
  second call gets `L[1]`, etc.

**State Transitions**:
- `initial` → `consuming` (when first agent call with that label occurs)
- `consuming` → `exhausted` (when all scripted responses have been consumed)
- `exhausted` → `error` (if another call occurs with that label after exhaustion)

**Relationships**:
- Consumed by `agent()` mock implementation during script execution
- One `AgentResponseScript` per test run (passed as parameter to `runWorkflowScript`)

---

### 3. BudgetScript (Test Configuration)

**Description**: Defines the scripted budget values available to the script.

**Fields**:
- `total: number` — Fixed value for `budget.total`
- `spentSequence: number[]` — Ordered list of values for successive `budget.spent()` calls

**Validation Rules**:
- `total` MUST be a non-negative number
- `spentSequence` MUST be an array of non-negative numbers
- Each call to `budget.spent()` consumes the next value in the sequence
- If `budget.spent()` is called more times than `spentSequence.length`:
  - HARNESS ERROR (not a script error): clear message about exhausted budget script

**State Transitions**:
- `initial` → `consuming` (when first `budget.spent()` call occurs)
- `consuming` → `exhausted` (when all scripted values have been consumed)
- `exhausted` → `error` (if another `budget.spent()` call occurs)

**Relationships**:
- Used by `budget` mock implementation during script execution
- One `BudgetScript` per test run (passed as parameter to `runWorkflowScript`)

---

### 4. ExecutionResult (Output)

**Description**: The result of executing a workflow script, including success/failure and diagnostics.

**Fields**:

**On Success**:
- `status: 'success'`
- `value: any` — The value returned/exported by the script
- `trace: ExecutionTrace` — Record of DSL primitive executions
- `exports: { [name: string]: any }` — All named exports from the script (e.g., `meta`)

**On Failure**:
- `status: 'error'`
- `error: HarnessError | ScriptError` — Distinguished error types
- `trace: ExecutionTrace` — Trace up to the point of failure

**Validation Rules**:
- MUST have either `status: 'success'` OR `status: 'error'`, never both
- If `status: 'error'`, `error` field MUST be present
- If `status: 'success'`, `value` field MUST be present

**Relationships**:
- Produced by `runWorkflowScript()`
- Contains `ExecutionTrace` for concurrency verification

---

### 5. ExecutionTrace (Diagnostic)

**Description**: A chronological record of DSL primitive executions, used for concurrency verification.

**Fields**:
- `entries: TraceEntry[]` — Ordered list of execution events

**TraceEntry**:
- `id: string` — Unique identifier (e.g., `parallel-0`, `pipeline-item1-stage2`)
- `type: 'agent' | 'parallel' | 'pipeline' | 'phase' | 'log'`
- `label?: string` — Label for agent calls, phase titles
- `startCounter: number` — Monotonic counter at start (NOT timestamp)
- `endCounter: number | null` — Counter at end (null if still running)
- `error?: Error` — If this entry failed

**Validation Rules**:
- `startCounter` MUST be < `endCounter` (if `endCounter` is not null)
- Entries MUST be in order of `startCounter`

**Usage in Tests**:
- Tests can check overlap: `entry1.startCounter < entry2.endCounter && entry2.startCounter < entry1.endCounter`
- Tests can check ordering: `entry1.endCounter < entry2.startCounter` (sequential)

---

### 6. HarnessError (Error Type)

**Description**: An error produced by the harness itself, indicating a problem with the test setup.

**Fields**:
- `name: 'HarnessError'`
- `code: HarnessErrorCode` — Machine-readable error code
- `message: string` — Human-readable description
- `context?: object` — Additional details (e.g., which label was missing responses)

**HarnessErrorCode** (enum):
- `FORBIDDEN_PRIMITIVE` — Script attempted to access a blocked global (Date, Math.random, etc.)
- `UNKNOWN_GLOBAL` — Script attempted to access an undefined global
- `MISSING_AGENT_RESPONSE` — `agent()` called with a label that has no scripted responses
- `EXHAUSTED_AGENT_RESPONSES` — `agent()` called more times than scripted responses for that label
- `EXHAUSTED_BUDGET_SPENT` — `budget.spent()` called more times than scripted values
- `UNKNOWN_DSL_FUNCTION` — Script called a function not in the DSL

**Validation Rules**:
- MUST have a clear, actionable message
- MUST include the specific primitive/label/value that caused the error

**Relationships**:
- One of the error types in `ExecutionResult` when `status: 'error'`

---

### 7. ScriptError (Error Type)

**Description**: An error thrown by the script itself (a programmer error, not a harness error).

**Fields**:
- `name: 'ScriptError'`
- `message: string` — The original error message from the script
- `stack?: string` — Stack trace from the script execution
- `originalError: Error` — The original error object thrown by the script

**Validation Rules**:
- MUST be distinguishable from `HarnessError` (different `name`)
- SHOULD preserve the original error's stack trace

**Relationships**:
- One of the error types in `ExecutionResult` when `status: 'error'`

---

### 8. Phase (Metadata Sub-entity)

**Description**: A phase declaration in the script's `meta.phases` array.

**Fields**:
- `title: string` — The phase name, must match `phase()` calls exactly
- `detail?: string` — Optional description of the phase

**Validation Rules**:
- `title` MUST be non-empty
- If the script calls `phase(title)`, `title` MUST exist in `meta.phases[].title`

**Relationships**:
- Part of `WorkflowScript.meta`
- Validated against `phase()` calls during execution

---

## Entity Relationships Diagram

```
WorkflowScript (input)
    │
    ├─ meta ────────────> Phase[]
    │
    └─ execution ───────> ExecutionResult
                              │
                              ├─ trace ──────> ExecutionTrace
                              │                    │
                              │                    └─ entries ──> TraceEntry[]
                              │
                              ├─ error ──────> HarnessError
                              │                    OR
                              │                ScriptError
                              │
                              └─ exports ────> { [name]: any }

AgentResponseScript (config)
    │
    └─ responsesByLabel ──> Map<string, AgentResponse[]>

BudgetScript (config)
    │
    ├─ total ──────────────> number
    │
    └─ spentSequence ──────> number[]
```

---

## State Transition Summary

### AgentResponseScript

```
[Initial: responses available]
        │
        ▼
[Consuming: responses being used]
        │
        ▼
[Exhausted: all responses consumed]
        │
        ▼
[Error: further calls with this label fail with EXHAUSTED_AGENT_RESPONSES]
```

### BudgetScript

```
[Initial: total set, spentSequence available]
        │
        ▼
[Consuming: spent() returning values]
        │
        ▼
[Exhausted: all spentSequence values consumed]
        │
        ▼
[Error: further spent() calls fail with EXHAUSTED_BUDGET_SPENT]
```

### ExecutionResult

```
[Script starts]
        │
        ├─ Success path ──> [status: 'success', value: any, trace: ExecutionTrace]
        │
        └─ Failure path ──> [status: 'error', error: HarnessError | ScriptError, trace: ExecutionTrace]
```

---

## Validation Checklist

For each execution of `runWorkflowScript(scriptText, options)`:

1. **Script Validation**:
   - [ ] `scriptText` is valid JavaScript syntax
   - [ ] `scriptText` is an ES module (contains `export` statements)
   - [ ] If `meta` is present, it's a pure literal object

2. **Options Validation**:
   - [ ] `options.agentResponses` labels are non-empty strings
   - [ ] `options.agentResponses` response lists are non-empty
   - [ ] `options.budget.total` is a non-negative number
   - [ ] `options.budget.spentSequence` is an array of non-negative numbers

3. **Runtime Validation**:
   - [ ] Each `agent()` call has a scripted response available
   - [ ] Each `budget.spent()` call has a scripted value available
   - [ ] No forbidden primitives are accessed
   - [ ] No unknown globals are accessed

4. **Result Validation**:
   - [ ] `ExecutionResult` has either `status: 'success'` or `status: 'error'`
   - [ ] `ExecutionResult.trace` has at least one entry (the script started)
   - [ ] Errors are properly classified as `HarnessError` or `ScriptError`