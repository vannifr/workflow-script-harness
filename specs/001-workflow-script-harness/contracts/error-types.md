# Contract: Error Types

This document defines all error types that the workflow-script harness can produce,
including their structure, codes, and when each occurs.

---

## Error Classification

Errors are classified into two categories:

1. **HarnessError**: Problems with the test setup (missing scripted responses, forbidden
   primitives, etc.). These indicate the test configuration is incorrect.

2. **ScriptError**: Errors thrown by the script itself (programmer bugs, logic errors).
   These indicate the script has a defect.

This distinction is critical for the author to understand whether to fix the test or the script.

---

## HarnessError

Base class for all harness-produced errors.

```typescript
class HarnessError extends Error {
  name: 'HarnessError';
  code: HarnessErrorCode;
  message: string;
  context?: object;
}

enum HarnessErrorCode {
  FORBIDDEN_PRIMITIVE = 'FORBIDDEN_PRIMITIVE',
  UNKNOWN_GLOBAL = 'UNKNOWN_GLOBAL',
  MISSING_AGENT_RESPONSE = 'MISSING_AGENT_RESPONSE',
  EXHAUSTED_AGENT_RESPONSES = 'EXHAUSTED_AGENT_RESPONSES',
  EXHAUSTED_BUDGET_SPENT = 'EXHAUSTED_BUDGET_SPENT',
  UNKNOWN_DSL_FUNCTION = 'UNKNOWN_DSL_FUNCTION'
}
```

### Error Codes

#### `FORBIDDEN_PRIMITIVE`

**When**: The script attempts to access a global that is explicitly blocked in the sandbox.

**Forbidden Primitives**:
- `Date`, `Date.now()`, `new Date()`
- `Math.random()`
- `process`
- `require`, `import` (dynamic)
- `module`, `exports`
- `__dirname`, `__filename`
- `Buffer`
- `console`
- `setTimeout`, `setInterval`, `setImmediate`
- `clearTimeout`, `clearInterval`, `clearImmediate`
- `queueMicrotask`
- `fetch`, `URL`, `URLSearchParams`
- Node.js built-in modules (`fs`, `net`, `child_process`, etc.)

**Error Shape**:
```javascript
{
  name: 'HarnessError',
  code: 'FORBIDDEN_PRIMITIVE',
  message: 'Forbidden primitive "Date" is not available in the sandbox. Workflow-scripts must not access host capabilities or non-deterministic APIs.',
  context: {
    primitive: 'Date',
    accessType: 'read' | 'call'
  }
}
```

**Example**:
```javascript
// Script
const timestamp = Date.now();

// HarnessError thrown during execution
{
  code: 'FORBIDDEN_PRIMITIVE',
  message: 'Forbidden primitive "Date" is not available in the sandbox...',
  context: { primitive: 'Date' }
}
```

---

#### `UNKNOWN_GLOBAL`

**When**: The script attempts to access a global that is not defined in the sandbox
(not in the DSL and not a forbidden primitive).

**Error Shape**:
```javascript
{
  name: 'HarnessError',
  code: 'UNKNOWN_GLOBAL',
  message: 'Unknown global "myCustomFunction" is not available in the sandbox. Only DSL primitives are permitted.',
  context: {
    globalName: 'myCustomFunction'
  }
}
```

**Example**:
```javascript
// Script
const value = myCustomFunction();

// HarnessError thrown during execution
{
  code: 'UNKNOWN_GLOBAL',
  message: 'Unknown global "myCustomFunction" is not available...',
  context: { globalName: 'myCustomFunction' }
}
```

---

#### `MISSING_AGENT_RESPONSE`

**When**: The script calls `agent()` with a label for which no scripted responses were
provided in `options.agentResponses`.

**Error Shape**:
```javascript
{
  name: 'HarnessError',
  code: 'MISSING_AGENT_RESPONSE',
  message: 'Agent call with label "reviewer" has no scripted responses. Add responses for this label in options.agentResponses.',
  context: {
    label: 'reviewer',
    availableLabels: ['other-label-1', 'other-label-2']
  }
}
```

**Example**:
```javascript
// Script
const result = await agent('Review', { label: 'reviewer' });

// Options
{ agentResponses: {} }  // No responses for 'reviewer'

// HarnessError thrown
{
  code: 'MISSING_AGENT_RESPONSE',
  message: 'Agent call with label "reviewer" has no scripted responses...',
  context: { label: 'reviewer', availableLabels: [] }
}
```

---

#### `EXHAUSTED_AGENT_RESPONSES`

**When**: The script calls `agent()` with a label more times than there are scripted
responses for that label.

**Error Shape**:
```javascript
{
  name: 'HarnessError',
  code: 'EXHAUSTED_AGENT_RESPONSES',
  message: 'Agent call with label "reviewer" exhausted all scripted responses. Provided 2 responses but called 3 times.',
  context: {
    label: 'reviewer',
    callCount: 3,
    responseCount: 2
  }
}
```

**Example**:
```javascript
// Script calls agent() 3 times with label 'reviewer'
const result1 = await agent('Review 1', { label: 'reviewer' });
const result2 = await agent('Review 2', { label: 'reviewer' });
const result3 = await agent('Review 3', { label: 'reviewer' });

// Options only provides 2 responses
{ agentResponses: { 'reviewer': ['response-1', 'response-2'] } }

// HarnessError thrown on 3rd call
{
  code: 'EXHAUSTED_AGENT_RESPONSES',
  message: 'Agent call with label "reviewer" exhausted all scripted responses...',
  context: { label: 'reviewer', callCount: 3, responseCount: 2 }
}
```

---

#### `EXHAUSTED_BUDGET_SPENT`

**When**: The script calls `budget.spent()` more times than there are scripted values
in `options.budget.spentSequence`.

**Error Shape**:
```javascript
{
  name: 'HarnessError',
  code: 'EXHAUSTED_BUDGET_SPENT',
  message: 'budget.spent() called more times than scripted values provided. Provided 3 values but called 4 times.',
  context: {
    callCount: 4,
    valueCount: 3
  }
}
```

**Example**:
```javascript
// Script calls budget.spent() 4 times
const s1 = budget.spent();
const s2 = budget.spent();
const s3 = budget.spent();
const s4 = budget.spent();

// Options only provides 3 values
{ budget: { total: 100, spentSequence: [10, 20, 30] } }

// HarnessError thrown on 4th call
{
  code: 'EXHAUSTED_BUDGET_SPENT',
  message: 'budget.spent() called more times than scripted values...',
  context: { callCount: 4, valueCount: 3 }
}
```

---

#### `UNKNOWN_DSL_FUNCTION`

**When**: The script attempts to call a function with a name that looks like it could
be a DSL primitive, but isn't recognized.

**Note**: This is less common, as most unknown functions would trigger `UNKNOWN_GLOBAL`.
This code is reserved for cases where the function call appears intentional but
incorrect.

**Error Shape**:
```javascript
{
  name: 'HarnessError',
  code: 'UNKNOWN_DSL_FUNCTION',
  message: 'Unknown DSL function "agentParallel" called. Did you mean "parallel"?',
  context: {
    functionName: 'agentParallel',
    suggestions: ['parallel', 'agent']
  }
}
```

---

## ScriptError

Wrapper for errors thrown by the script itself.

```typescript
class ScriptError extends Error {
  name: 'ScriptError';
  message: string;
  stack?: string;
  originalError: Error;
}
```

**When**: The script throws an error during execution (not related to harness constraints).

**Error Shape**:
```javascript
{
  name: 'ScriptError',
  message: 'Cannot read property "findings" of undefined',
  stack: 'ScriptError: Cannot read property "findings" of undefined\n  at <script>:5:20...',
  originalError: TypeError: Cannot read property "findings" of undefined
}
```

**Example**:
```javascript
// Script has a bug
const review = await agent('Review', { label: 'reviewer' });
const firstFinding = review.findings[0];  // TypeError if review.findings is undefined

// ScriptError captures the original error
{
  name: 'ScriptError',
  message: 'Cannot read property "0" of undefined',
  originalError: TypeError: Cannot read property "0" of undefined
}
```

---

## Distinguishing Errors in Tests

Tests can distinguish between `HarnessError` and `ScriptError` by checking the `name` property:

```javascript
import assert from 'node:assert';

const result = await runWorkflowScript(script, options);

if (result.status === 'error') {
  if (result.error.name === 'HarnessError') {
    // Test configuration issue
    console.error('Test setup error:', result.error.code);
    console.error('Message:', result.error.message);
    console.error('Context:', result.error.context);
  } else if (result.error.name === 'ScriptError') {
    // Script bug
    console.error('Script threw an error:', result.error.message);
    console.error('Stack:', result.error.stack);
  }
}
```

**Or use instanceof-like checks** (actual `instanceof` may not work across module boundaries):

```javascript
if (result.error.name === 'HarnessError') {
  // HarnessError
} else if (result.error.name === 'ScriptError') {
  // ScriptError
}
```

---

## Error Message Quality Requirements

All error messages MUST:

1. **Name the specific problem**: "Agent call with label 'reviewer' has no scripted responses"
   (not just "Missing agent response")

2. **Provide actionable guidance**: "Add responses for this label in options.agentResponses"

3. **Include relevant context**: The label name, the call count, the available options

4. **Distinguish from script errors**: Harness errors clearly state they are test setup issues

---

## Error Handling Flow

```
Script execution starts
        │
        ├── Access a global ──→ Is it in DSL? ──→ Yes ──→ Continue
        │                               │
        │                               └─ No ──→ Is it forbidden? ──→ Yes ──→ FORBIDDEN_PRIMITIVE
        │                                               │
        │                                               └─ No ──→ UNKNOWN_GLOBAL
        │
        ├── Call agent() ──→ Label has responses? ──→ No ──→ MISSING_AGENT_RESPONSE
        │                           │
        │                           └─ Yes ──→ Responses remaining? ──→ No ──→ EXHAUSTED_AGENT_RESPONSES
        │                                           │
        │                                           └─ Yes ──→ Return next response
        │
        ├── Call budget.spent() ──→ Values remaining? ──→ No ──→ EXHAUSTED_BUDGET_SPENT
        │                                   │
        │                                   └─ Yes ──→ Return next value
        │
        ├── Script throws error ──→ Wrap in ScriptError
        │
        └── Script completes ──→ Return ExecutionSuccess
```

---

## Summary Table

| Error Code | Category | When It Occurs | Fix Action |
|------------|----------|----------------|------------|
| `FORBIDDEN_PRIMITIVE` | Harness | Script accesses Date, Math.random, etc. | Remove forbidden call from script |
| `UNKNOWN_GLOBAL` | Harness | Script accesses undefined global | Use only DSL primitives |
| `MISSING_AGENT_RESPONSE` | Harness | No responses scripted for label | Add responses to options.agentResponses |
| `EXHAUSTED_AGENT_RESPONSES` | Harness | More agent() calls than responses | Add more responses or reduce calls |
| `EXHAUSTED_BUDGET_SPENT` | Harness | More spent() calls than values | Add more values to spentSequence |
| `UNKNOWN_DSL_FUNCTION` | Harness | Unrecognized DSL-like function | Use correct DSL function name |
| N/A | Script | Script throws its own error | Fix the script bug |