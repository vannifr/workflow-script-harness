# Quickstart: Testing Workflow Scripts

This guide shows how to test the five core user stories from the spec using the
workflow-script harness. Each scenario is described in prose, focusing on what
the test author needs to write and what they can verify.

---

## Scenario 1: Running a Simple Workflow Script (User Story 1)

### Goal

Test that a workflow script runs unmodified and returns the expected result.

### Test Setup

The test author has a workflow script that:
- Uses `args` to receive input parameters
- Makes one `agent()` call with a specific label
- Returns the agent's response as the script's output

**Script Behavior**:
```
Read args.filePath
Call agent("Review this file", { label: "reviewer" })
Return the agent's response
```

### Test Configuration

The test author calls `runWorkflowScript` with:
1. The script text (read from a file or inlined)
2. `options.args` set to `{ filePath: "/src/index.js" }`
3. `options.agentResponses` with one scripted response for label `"reviewer"`:
   - First (and only) response: `{ findings: [], approved: true }`

### Assertions

The test verifies:
1. `result.status` is `"success"` (not an error)
2. `result.value` equals the scripted response: `{ findings: [], approved: true }`
3. `result.trace.entries` contains at least one entry (the agent call was recorded)
4. The script text was used exactly as provided (no modifications)

### Success Indicator

The script executed without requiring any changes to its source code, and the
harness correctly captured the agent's response and returned it as the result.

---

## Scenario 2: Scripting Agent Responses Including Failure (User Story 2)

### Goal

Test that a script handles both successful and failed agent calls correctly.

### Test Setup

The test author has a workflow script that:
- Calls `agent()` twice with the same label
- Handles the case where the second agent call fails (returns null)
- Uses a fallback value when the agent fails

**Script Behavior**:
```
Call agent("Primary review", { label: "reviewer" })
If the response is null:
  Log "Primary review failed, using backup"
  Return "fallback-result"
Otherwise:
  Return the response
```

### Test Configuration

The test author calls `runWorkflowScript` with:
1. `options.agentResponses` for label `"reviewer"`:
   - First response: `{ findings: [], approved: true }` (successful)
   - Second response: `{ type: "null" }` (simulated failure)

### Assertions

The test verifies:
1. `result.status` is `"success"`
2. `result.value` equals `"fallback-result"` (the script's fallback path was taken)
3. `result.trace.entries` has two agent call entries (both calls were recorded)
4. The first entry succeeded, the second entry shows a null result

### Success Indicator

The script's error-handling logic was exercised, and the harness correctly
simulated both a successful and a failed agent call.

---

## Scenario 3: Verifying Genuine Concurrency in `parallel()` (User Story 3)

### Goal

Test that `parallel()` executes multiple tasks concurrently, not sequentially.

### Test Setup

The test author has a workflow script that:
- Uses `parallel()` to run three agent calls concurrently
- Each call has a different label

**Script Behavior**:
```
Call parallel([
  () => agent("Task A", { label: "task-a" }),
  () => agent("Task B", { label: "task-b" }),
  () => agent("Task C", { label: "task-c" })
])
Return all results
```

### Test Configuration

The test author calls `runWorkflowScript` with:
1. `options.agentResponses` for each label:
   - `"task-a"`: `["result-A"]`
   - `"task-b"`: `["result-B"]`
   - `"task-c"`: `["result-C"]`

### Assertions

The test verifies:
1. `result.status` is `"success"`
2. `result.value` equals `["result-A", "result-B", "result-C"]`
3. **Concurrency verification**:
   - `result.trace.entries` contains three entries (one for each task)
   - The entries overlap: at least two tasks were executing simultaneously
   - Overlap is determined by checking that task B started before task A ended
   - This proves genuine concurrency (sequential execution would not overlap)

### Success Indicator

The trace shows that tasks B and C started before task A finished, proving that
the harness executed them genuinely concurrently, not one after another.

---

## Scenario 4: Scripting Budget Values (User Story 4)

### Goal

Test that a script makes budget-aware decisions based on `budget.total` and
`budget.spent()`.

### Test Setup

The test author has a workflow script that:
- Checks `budget.total`
- Calls `budget.spent()` multiple times to track spending
- Stops making agent calls when spending approaches the limit

**Script Behavior**:
```
Read budget.total (e.g., 100)
Loop:
  Call budget.spent() to get current spending
  If spent > 80% of total:
    Stop and return "budget-exceeded"
  Otherwise:
    Call agent("Do work", { label: "worker" })
Return final status
```

### Test Configuration

The test author calls `runWorkflowScript` with:
1. `options.budget.total` set to `100`
2. `options.budget.spentSequence` set to `[10, 25, 50, 75, 90]`
3. `options.agentResponses` for label `"worker"` with multiple responses

### Assertions

The test verifies:
1. `result.status` is `"success"`
2. `result.value` equals `"budget-exceeded"` (the script stopped at the right time)
3. `budget.spent()` was called in the expected order (5 times)
4. The script stopped calling `agent()` after the 5th `budget.spent()` call
  returned `90` (exceeding 80% of total)

### Success Indicator

The script's budget-aware logic was exercised, and the harness correctly provided
scripted values for `budget.total` and successive `budget.spent()` calls.

---

## Scenario 5: Detecting Forbidden Primitives (User Story 5)

### Goal

Test that the harness detects and clearly reports when a script attempts to use
a forbidden primitive like `Date.now()`.

### Test Setup

The test author has a workflow script that:
- Attempts to read the current timestamp using `Date.now()`
- This is forbidden in the real sandbox

**Script Behavior**:
```
Attempt to call Date.now()
Export the result
```

### Test Configuration

The test author calls `runWorkflowScript` with:
1. Minimal options (no special configuration needed)

### Assertions

The test verifies:
1. `result.status` is `"error"`
2. `result.error.name` is `"HarnessError"` (not a script error)
3. `result.error.code` is `"FORBIDDEN_PRIMITIVE"`
4. `result.error.message` explicitly mentions `"Date"`
5. `result.error.context.primitive` equals `"Date"`

### Success Indicator

The harness proactively blocked the forbidden primitive and provided a clear,
actionable error message naming the exact issue. The test author knows to remove
the `Date.now()` call from the script.

---

## Combined Scenario: Multi-Phase Workflow with Concurrency

### Goal

Test a realistic workflow script that uses multiple DSL features together.

### Test Setup

The test author has a workflow script that:
- Declares two phases: "Review" and "Verify"
- In the Review phase, calls `agent()` to review code
- In the Verify phase, uses `parallel()` to verify each finding concurrently
- Tracks budget and stops if over limit
- Returns the review and verification results

**Script Behavior**:
```
Export meta with phases: Review, Verify

Phase: Review
  Call agent("Review code", { label: "reviewer", phase: "Review" })
  Get findings

Phase: Verify
  For each finding in parallel:
    Call agent("Verify finding", { label: "verifier" })

Return { review, verification }
```

### Test Configuration

The test author calls `runWorkflowScript` with:
1. `options.agentResponses`:
   - `"reviewer"`: `[{ findings: [{ file: "a.js" }, { file: "b.js" }] }]`
   - `"verifier"`: `["verified-a", "verified-b"]` (two calls, one per finding)
2. `options.budget`:
   - `total`: 100
   - `spentSequence`: [10, 20, 30, 40]
3. `options.args`: `{ targetFile: "index.js" }`

### Assertions

The test verifies:
1. `result.status` is `"success"`
2. `result.exports.meta.phases` matches the declared phases
3. `result.trace.entries` shows:
   - One agent call for the review phase
   - Two agent calls for the verify phase
   - The two verify calls overlapped (concurrent execution)
4. `budget.spent()` was called the expected number of times
5. The script's result structure is correct

### Success Indicator

All DSL features work together correctly: phases are tracked, agent calls are
scripted, concurrency is verified, budget is monitored, and the result is
structured as expected.

---

## Key Testing Patterns

### 1. Script Source as Input

Tests provide the script as text (not a file path), enabling:
- Inline scripts for simple tests
- Reading from files for realistic scripts
- Parameterized tests with different script variations

### 2. Deterministic Assertions

Tests use the trace's counter-based overlap detection, not timestamps:
- Deterministic across runs (no flakiness)
- Verifies genuine concurrency (not just result order)

### 3. Error Classification

Tests distinguish harness errors from script errors:
- `HarnessError`: fix the test configuration
- `ScriptError`: fix the script code

### 4. Comprehensive Trace

The trace captures all DSL primitive executions:
- Enables concurrency verification
- Shows execution order
- Captures errors at the point of failure

---

## Getting Started Checklist

- [ ] Install Node.js 18+ (required for `node:test`)
- [ ] Create a test file (e.g., `test/my-workflow.test.js`)
- [ ] Import `runWorkflowScript` from the harness
- [ ] Write or read your workflow script text
- [ ] Configure `options.agentResponses` for each label used
- [ ] Configure `options.budget` if the script uses budget
- [ ] Configure `options.args` if the script expects arguments
- [ ] Call `runWorkflowScript(scriptText, options)`
- [ ] Assert on `result.status`, `result.value`, `result.trace`
- [ ] Run tests with `node --test test/my-workflow.test.js`