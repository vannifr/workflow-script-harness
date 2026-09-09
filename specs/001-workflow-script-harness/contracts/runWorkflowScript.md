# Contract: `runWorkflowScript(scriptText, options)`

## Function Signature

```typescript
function runWorkflowScript(
  scriptText: string,
  options: RunWorkflowScriptOptions
): Promise<ExecutionResult>
```

## Parameters

### `scriptText: string`

The complete source code of the workflow script as a string. Must be valid ES module
JavaScript (may include top-level `await` and `export` statements).

**Requirements**:
- Must be syntactically valid JavaScript
- Must be an ES module (contain `export` statements or `export default`)
- Must NOT be modified by the harness — the script text is used as-is
- May include `export const meta = { ... }` for phase metadata

**Example**:
```javascript
export const meta = {
  name: 'review-workflow',
  phases: [
    { title: 'Review', detail: 'Review the code' },
    { title: 'Verify', detail: 'Verify the findings' }
  ]
};

const review = await agent('Review the code', { label: 'reviewer', phase: 'Review' });
const verification = await parallel(
  review.findings.map(f => () => agent(`Verify ${f.title}`, { label: `verify:${f.file}` }))
);

export default { review, verification };
```

### `options: RunWorkflowScriptOptions`

Configuration for the test execution, including scripted responses and budget.

```typescript
interface RunWorkflowScriptOptions {
  agentResponses?: AgentResponseScript;
  budget?: BudgetScript;
  args?: any;
}
```

#### `options.agentResponses?: AgentResponseScript`

Defines the scripted responses for `agent()` calls, organized by label.

```typescript
interface AgentResponseScript {
  [label: string]: AgentResponse[];
}

type AgentResponse = 
  | any  // Direct value (shorthand for { type: 'value', value: ... })
  | { type: 'value', value: any }
  | { type: 'null' }
  | { type: 'error', error: Error | string };
```

**Shorthand**: Passing a direct value (not an object with `type`) is equivalent to
`{ type: 'value', value: <that value> }`.

**Examples**:
```javascript
// Simple value shorthand
{ agentResponses: { 'reviewer': ['response-1', 'response-2'] } }

// Explicit types
{ agentResponses: {
    'reviewer': [
      { type: 'value', value: { text: 'LGTM' } },
      { type: 'null' }  // Simulate failed agent call
    ]
  }
}

// Error simulation
{ agentResponses: {
    'reviewer': [
      { type: 'error', error: new Error('Agent timeout') }
    ]
  }
}
```

**Behavior**:
- First call to `agent(prompt, { label: 'reviewer' })` returns the first response
- Second call returns the second response
- If all responses are exhausted, throws `HarnessError` with code `EXHAUSTED_AGENT_RESPONSES`
- If no responses are provided for a label, throws `HarnessError` with code `MISSING_AGENT_RESPONSE`

#### `options.budget?: BudgetScript`

Defines the scripted budget values for the script.

```typescript
interface BudgetScript {
  total: number;
  spentSequence: number[];
}
```

**Example**:
```javascript
{ budget: { total: 100, spentSequence: [10, 25, 50, 75] } }
```

**Behavior**:
- `budget.total` returns the fixed `total` value
- First call to `budget.spent()` returns `spentSequence[0]`
- Second call returns `spentSequence[1]`
- If `spentSequence` is exhausted, throws `HarnessError` with code `EXHAUSTED_BUDGET_SPENT`

#### `options.args?: any`

The arguments to pass to the script via the `args` global.

**Example**:
```javascript
{ args: { filePath: '/src/index.js', maxFindings: 10 } }
```

**Behavior**:
- The `args` variable in the script has the exact value passed in `options.args`
- Can be any JavaScript value (object, array, primitive, null, undefined)

## Return Value

### `Promise<ExecutionResult>`

The result of executing the script, either success or error.

```typescript
type ExecutionResult = 
  | ExecutionSuccess
  | ExecutionError;

interface ExecutionSuccess {
  status: 'success';
  value: any;              // The script's exported/returned value
  exports: { [name: string]: any };  // Named exports (e.g., meta)
  trace: ExecutionTrace;   // Record of DSL primitive executions
}

interface ExecutionError {
  status: 'error';
  error: HarnessError | ScriptError;  // Distinguished error type
  trace: ExecutionTrace;              // Trace up to the point of failure
}
```

#### `ExecutionSuccess`

- `status`: Always `'success'`
- `value`: The value from `export default <value>` or the last evaluated expression
- `exports`: Object containing all named exports (e.g., `{ meta: { ... } }`)
- `trace`: An `ExecutionTrace` object for concurrency verification

#### `ExecutionError`

- `status`: Always `'error'`
- `error`: Either a `HarnessError` (test setup issue) or `ScriptError` (script bug)
- `trace`: The trace up to the point where the error occurred

#### `ExecutionTrace`

```typescript
interface ExecutionTrace {
  entries: TraceEntry[];
}

interface TraceEntry {
  id: string;
  type: 'agent' | 'parallel' | 'pipeline' | 'phase' | 'log';
  label?: string;
  startCounter: number;
  endCounter: number | null;
  error?: Error;
}
```

The `startCounter` and `endCounter` are monotonic integers (NOT wall-clock timestamps),
allowing tests to verify ordering and overlap without non-determinism.

**Overlap Verification Example**:
```javascript
const trace = result.trace.entries;
const entry1 = trace[0];
const entry2 = trace[1];

// Check if entry1 and entry2 overlapped
const overlapped = entry1.startCounter < entry2.endCounter &&
                   entry2.startCounter < entry1.endCounter;

assert(overlapped, 'These operations should have run concurrently');
```

## Error Types

See `./error-types.md` for detailed error definitions.

## Execution Semantics

### Script Execution

1. A sandbox context is created (`vm.createContext`) with only the DSL globals
   available as ambient properties
2. The script text has its `export const meta = ` / `export default ` forms
   substituted with plain assignments (a minimal, non-semantic transform —
   see `research.md` Challenge 2) and is wrapped in an async IIFE, then run
   with `vm.runInContext()` (including top-level await)
3. Named exports (like `meta`) are captured from the resulting local scope
4. The default export is returned as `value`

### Sandbox Isolation

The script has access **ONLY** to:
- `agent(prompt, opts)` — Mocked agent calls
- `pipeline(items, ...stages)` — Pipeline orchestration
- `parallel(thunks)` — Parallel execution
- `phase(title)` — Phase marking
- `log(message)` — Logging
- `args` — Test arguments
- `budget` — Budget information

The script has **NO** access to:
- Node.js built-ins (`fs`, `net`, `process`, `require`, etc.)
- JavaScript globals (`Date`, `Math.random`, `console`, etc.)
- Any custom globals not explicitly in the DSL

Attempting to access a forbidden primitive throws a `HarnessError` with code
`FORBIDDEN_PRIMITIVE` or `UNKNOWN_GLOBAL`.

### Concurrency Semantics

- `parallel(thunks)`: All thunks are started immediately and run concurrently
  (using `Promise.all`). The trace shows overlap between thunks.

- `pipeline(items, ...stages)`: Items progress independently through stages.
  If stages are async (call `agent()`), item N can be in stage 2 while item N+1
  is still in stage 1. The trace shows this overlap.

### Phase Validation

If the script includes `export const meta = { phases: [...] }`:
- Each call to `phase(title)` is validated against `meta.phases[].title`
- A mismatch throws a `ScriptError` (not a harness error)

## Usage Examples

### Basic Example

```javascript
import { runWorkflowScript } from 'workflow-script-harness';
import assert from 'node:assert';

const script = `
export const meta = { name: 'test', phases: [] };
const result = await agent('Say hello', { label: 'greeter' });
export default result;
`;

const result = await runWorkflowScript(script, {
  agentResponses: {
    'greeter': ['Hello, world!']
  }
});

assert.strictEqual(result.status, 'success');
assert.strictEqual(result.value, 'Hello, world!');
```

### Concurrency Verification Example

```javascript
const script = `
const results = await parallel([
  () => agent('Task A', { label: 'task-a' }),
  () => agent('Task B', { label: 'task-b' }),
  () => agent('Task C', { label: 'task-c' })
]);
export default results;
`;

const result = await runWorkflowScript(script, {
  agentResponses: {
    'task-a': ['A-result'],
    'task-b': ['B-result'],
    'task-c': ['C-result']
  }
});

// Verify all three ran concurrently
const entries = result.trace.entries;
assert(entries.length >= 3);

// Check that at least two overlapped
let overlapCount = 0;
for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    const e1 = entries[i];
    const e2 = entries[j];
    if (e1.startCounter < e2.endCounter && e2.startCounter < e1.endCounter) {
      overlapCount++;
    }
  }
}
assert(overlapCount > 0, 'At least two operations should have overlapped');
```

### Error Simulation Example

```javascript
const script = `
const response = await agent('Review', { label: 'reviewer' });
let output;
if (!response) {
  log('Agent call failed, using fallback');
  output = 'fallback';
} else {
  output = response;
}
export default output;
`;

const result = await runWorkflowScript(script, {
  agentResponses: {
    'reviewer': [{ type: 'null' }]  // Simulate failed agent call
  }
});

assert.strictEqual(result.status, 'success');
assert.strictEqual(result.value, 'fallback');
```

**Note**: `export default` is only valid at the top level of a module — it
cannot appear inside an `if`/`else` block. Assign to a local variable first
and `export default` it once, at the top level, as shown above.

### Forbidden Primitive Detection Example

```javascript
const script = `
const timestamp = Date.now();
export default timestamp;
`;

const result = await runWorkflowScript(script);

assert.strictEqual(result.status, 'error');
assert.strictEqual(result.error.code, 'FORBIDDEN_PRIMITIVE');
assert(result.error.message.includes('Date'));
```

## Implementation Notes

- Uses Node's `vm` module for sandboxing (`vm.createContext`/`vm.runInContext`,
  not `vm.SourceTextModule` — see `research.md` Challenge 1/2 for why)
- No external dependencies
- Minimum Node.js version: 18.x (set by `node:test` availability, not by any
  `vm` API constraint)
- Tests must use `node:test` and `node:assert` only