# Technical Research: Workflow-Script Test Harness

## Overview

This document captures the research and design decisions for the technical challenges
in building a test harness for Claude Code's Workflow-tool DSL. Each section addresses
a specific uncertainty with the chosen approach, rationale, and alternatives considered.

---

## Challenge 1: ES Module Execution in Node's `vm` Module with Top-Level Await

### Problem

Workflow-scripts are ES modules with top-level `await` and `export` statements, and
the DSL primitives must be **ambient globals** (per the contract: "the script never
imports them") rather than something the script imports. These two requirements
pull in different directions: `vm.SourceTextModule`/`vm.SyntheticModule` handle
`export`/top-level-await cleanly, but they distribute values via **imports**, which
would require the script to `import` the DSL — contradicting the "ambient global,
never imported" requirement (see Challenge 2 for the full reasoning that ruled this
out).

### Chosen Approach

Use `vm.runInContext()` against a `vm.createContext()` sandbox whose context object
already has the DSL primitives as plain properties (true ambient globals, no import
needed). The script text itself is wrapped in an async IIFE so top-level `await`
works, and `export default <expr>` is captured via a minimal, non-semantic text
substitution (`export default ` → `_exportResult = `) rather than a real module
linker — see Challenge 2 for why this is safe and how it preserves script semantics.

**Implementation Pattern**:
```javascript
const vm = require('vm');

const sandboxContext = vm.createContext({
  agent: createMockAgent(agentResponses),
  pipeline: createMockPipeline(),
  parallel: createMockParallel(),
  phase: createMockPhase(),
  log: createMockLog(),
  args,
  budget: createMockBudget(budgetConfig),
  // Explicitly no Node globals (no console, process, require, Date, Math, ...)
});

const prepared = prepareScript(scriptText); // see Challenge 2
const result = await vm.runInContext(
  `(async () => { ${prepared} })()`,
  sandboxContext,
  { timeout: 5000 }
);
```

### Rationale

- The DSL primitives are true ambient globals (context properties), matching the
  contract's "never imported" requirement exactly.
- Top-level await works via the async-IIFE wrapper.
- `export default` is captured with a minimal text substitution that does not alter
  control flow or logic — the rest of the script text is untouched.
- No transpilation, bundling, or module linker required, and no dependencies.

### Alternatives Considered

1. **`vm.SourceTextModule` + `vm.SyntheticModule`**: Handles `export`/top-level-await
   natively, but requires the script to `import` the globals from the synthetic
   module — contradicting the "ambient global, never imported" contract
   requirement. **REJECTED** (see Challenge 2).

2. **Dynamic import() with file:// URL**: Would require writing the script to a temp
   file, breaking the "script text as input" contract and introducing file I/O
   dependency in the harness. **REJECTED**.

3. **Babel/ESBuild transpilation to CommonJS**: Violates the "no dependencies"
   constraint in CONSTITUTION.md, and adds a build step that could introduce
   subtle differences from the original script behavior. **REJECTED**.

4. **vm.compileFunction**: Only supports function bodies, not full modules with
   exports and top-level await. **REJECTED**.

### Minimum Node Version

No `vm` API newer than `vm.createContext()`/`vm.runInContext()` is required — both
have been stable for a very long time. The real floor is set by the project's own
**test tooling**, not by the sandboxing mechanism: CONSTITUTION.md mandates
`node:test`, which requires **Node.js 18.x+** (stable, non-experimental as of
Node.js 20; usable from 18 onward). Target Node.js 18.x+ for that reason.

---

## Challenge 2: Injecting Ambient Globals Without Script Imports

### Problem

The DSL functions (`agent`, `pipeline`, `parallel`, `phase`, `log`) and variables
(`args`, `budget`) must be available as ambient globals in the sandbox — the
contract is explicit: "these are injected as ambient globals in the script's
execution context — the script never imports them." A real ES module linker
(`vm.SourceTextModule` + `vm.SyntheticModule`) distributes values via `import`,
not via ambient globals — so it cannot satisfy this requirement without either
modifying the script to add an `import` statement (which would violate
Principle IV, Script Compatibility) or abandoning the module-linker approach.

### Chosen Approach

Use `vm.createContext()` to build a context object whose properties ARE the
DSL primitives (true ambient globals — a plain property lookup, not an import),
then run the script with `vm.runInContext()` against that context. Two
consequences of dropping the module linker have to be handled explicitly:

1. **Top-level `await`**: not available outside a real module. Resolved by
   wrapping the script text in an async IIFE: `` `(async () => { ${scriptText} })()` ``.
2. **`export` statements**: not valid outside a real module. Resolved with a
   minimal, non-semantic text substitution that captures the exported value
   without touching any other code:

```javascript
function prepareScript(scriptText) {
  // `export const meta = {...}` -> `const meta = {...}` (still assigned to a
  // local `meta` the script can read/declare normally)
  // `export default <expr>` -> `_exportResult = <expr>` (only the prefix up
  // to the end of that line is replaced; a multi-line object/array literal
  // after it is untouched and remains valid, since only the assignment
  // target changed, not the value's own syntax)
  const modified = scriptText
    .replace(/export\s+const\s+meta\s*=/, 'const meta =')
    .replace(/export\s+default\s+/, '_exportResult = ');

  return `
    let _exportResult;
    ${modified}
    return _exportResult;
  `;
}

const sandboxContext = vm.createContext({
  agent: createMockAgent(agentResponses),
  pipeline: createMockPipeline(),
  parallel: createMockParallel(),
  phase: createMockPhase(),
  log: createMockLog(),
  args,
  budget: createMockBudget(budgetConfig),
  // Explicitly no other globals — see Challenge 4 for active blocking
});

const result = await vm.runInContext(
  `(async () => { ${prepareScript(scriptText)} })()`,
  sandboxContext,
  { timeout: 5000 }
);
```

**Why this substitution is non-semantic**: it only ever replaces the `export`
keyword sequence itself (`export const meta =` or `export default `) with a
plain-JS equivalent that assigns to the same expression — it never touches the
expression/value that follows, so control flow, logic, and the value's own
(possibly multi-line) syntax are unaffected. It does not handle other export
forms (`export { name }`, `export function foo() {}`) — the current DSL
contract only requires `export const meta` and `export default`, so this is a
deliberately narrow, contract-scoped substitution, not a general ES-module
transpiler. If future workflow-scripts use additional export forms, this
substitution must be extended (tracked as a known limitation, not silently
widened).

### Rationale

- Globals are truly ambient (context properties, no import syntax in the
  script) — matches the contract exactly.
- Top-level await works via the async-IIFE wrapper.
- The export substitution is minimal and scoped to exactly the two export
  forms the contract defines; it never rewrites the values/expressions
  themselves.
- No dependencies required.

### Alternatives Considered

1. **`vm.SourceTextModule` + `vm.SyntheticModule` (real ES module linker)**:
   Would require the script to `import` the DSL from the synthetic module,
   which contradicts "ambient global, never imported" — and pre-pending an
   `import` line to the script text would itself be a script modification,
   violating Principle IV. **REJECTED**.
2. **Pre-processing to inject an `import` statement**: Same rejection as
   above — modifies the script.
3. **Full AST-based export rewriting (via `acorn`/similar)**: More robust
   than a regex substitution, but pulls in a dependency, which
   CONSTITUTION.md's Dependency Minimalism principle requires to be avoided
   unless the standard library is genuinely insufficient — the narrow,
   contract-scoped regex substitution above is sufficient for the two export
   forms the DSL contract actually defines. **REJECTED** for this scope.

---

## Challenge 3: Verifying Genuine Concurrency Without Non-Determinism

### Problem

Tests must verify that `parallel()` and independent `pipeline()` steps execute
genuinely concurrently, not sequentially. However, the sandbox must NOT have
access to `Date.now()` or timers, which would introduce non-determinism into
test assertions.

### Chosen Approach

Use a **monotonic counter** and **execution traces** controlled by the harness.
The harness's internal implementation uses real `setTimeout`/`Promise.race`, but
the sandboxed script only sees a deterministic, test-controlled sequence.

**Implementation**:

1. **Execution Trace Recording**: Each DSL primitive records its start/end with a
   harness-controlled counter (not time-based).

2. **Interleaving Observation**: The test can inspect the trace to verify overlap:

```javascript
// In harness internal state (NOT exposed to sandbox)
let executionTrace = [];
let counter = 0;

function recordStart(type, label) {
  executionTrace.push({ type, label, start: counter++, end: null });
}

function recordEnd(label) {
  const entry = executionTrace.find(e => e.label === label && e.end === null);
  if (entry) entry.end = counter++;
}

// parallel() implementation
async function parallel(thunks) {
  const labels = thunks.map((_, i) => `parallel-${i}`);
  
  // Record all starts BEFORE awaiting any
  labels.forEach(label => recordStart('parallel', label));
  
  const promises = thunks.map((thunk, i) => 
    Promise.resolve()
      .then(() => thunk())
      .then(result => {
        recordEnd(labels[i]);
        return result;
      })
  );
  
  // Genuinely concurrent execution via Promise.all
  return Promise.all(promises);
}

// Test can verify:
const result = await runWorkflowScript(script, { ... });
assert(result.trace[0].start < result.trace[1].end); // Overlap verified
```

3. **Test-Controlled Delays**: For tests that need specific timing/ordering, the
   harness can accept a `delays` config that injects artificial delays into agent
   responses:

```javascript
const options = {
  agentResponses: {
    'reviewer': [
      { value: 'A', delay: 10 }, // 10 "ticks" before returning
      { value: 'B', delay: 0 }
    ]
  }
};
```

The "ticks" are not wall-clock time but sequence counters, ensuring determinism.

### Rationale

- Genuine concurrency is exercised (Promise.all, real async execution)
- Test assertions are deterministic (counter-based traces, not timestamps)
- The sandbox remains non-deterministic-free (no Date/timer access)
- Tests can reason about overlap without flakiness

### Alternatives Considered

1. **Timestamp-based assertions**: Would require exposing `Date.now()` to the
   sandbox, violating the non-determinism constraint. Tests would be flaky.

2. **Sequence-only verification**: Checking only the order of completions doesn't
   prove concurrency — sequential execution could produce the same order.

3. **External timing (test harness only)**: The test harness could use real
   timers to measure script execution time. This doesn't verify that *internal*
   DSL primitives ran concurrently, only that the overall script was fast.

---

## Challenge 4: Blocking Forbidden Primitives (Date, Math.random, Node APIs)

### Problem

The sandbox must actively block access to `Date.now()`, `new Date()`, `Math.random()`,
and all Node.js built-in modules (`fs`, `net`, `process`, `child_process`, etc.).
The error messages must be clear and specific, naming the forbidden capability.

### Chosen Approach

Create a sandbox context with an **allowlist** of permitted globals. All others
throw a descriptive error when accessed.

**Implementation**:

```javascript
const FORBIDDEN_GLOBALS = [
  'Date', 'Math', 'process', 'require', 'module', 'exports',
  '__dirname', '__filename', 'Buffer', 'console', 'global', 'setTimeout',
  'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'clearImmediate',
  'queueMicrotask', 'fetch', 'URL', 'URLSearchParams'
];

const ALLOWED_GLOBALS = ['agent', 'pipeline', 'parallel', 'phase', 'log', 'args', 'budget'];

function createSandboxContext(dslPrimitives) {
  const context = {};
  
  // Add allowed DSL primitives
  for (const [key, value] of Object.entries(dslPrimitives)) {
    context[key] = value;
  }
  
  // Add traps for forbidden globals
  for (const forbidden of FORBIDDEN_GLOBALS) {
    Object.defineProperty(context, forbidden, {
      get() {
        const error = new Error(
          `Forbidden primitive "${forbidden}" is not available in the sandbox. ` +
          `Workflow-scripts must not access host capabilities or non-deterministic APIs.`
        );
        error.code = 'FORBIDDEN_PRIMITIVE';
        error.primitive = forbidden;
        throw error;
      },
      configurable: false,
      enumerable: false
    });
  }
  
  return vm.createContext(context);
}
```

For more comprehensive blocking, use a **Proxy** around the global object:

```javascript
const sandboxGlobal = new Proxy({}, {
  has(target, prop) {
    // All properties must be explicitly defined
    return prop in target;
  },
  get(target, prop) {
    if (prop in target) {
      return target[prop];
    }
    throw new Error(
      `Unknown global "${String(prop)}" is not available in the sandbox. ` +
      `Only DSL primitives are permitted.`
    );
  }
});

// Populate only allowed primitives
for (const [key, value] of Object.entries(dslPrimitives)) {
  sandboxGlobal[key] = value;
}

const context = vm.createContext(sandboxGlobal);
```

### Rationale

- **Proactive blocking**: Attempting to access a forbidden primitive throws
  immediately, rather than returning `undefined` and causing confusing errors later.
- **Clear error messages**: Each error explicitly names the forbidden primitive
  and explains why it's blocked.
- **Comprehensive coverage**: By using a Proxy with a whitelist, any attempt to
  access anything outside the DSL fails clearly.

### Alternatives Considered

1. **Omitting forbidden globals**: Simply not including them in the context would
  result in `undefined` access, leading to confusing "Cannot read property of
   undefined" errors. **REJECTED** for poor error UX.

2. **Runtime detection via AST parsing**: Parse the script AST to detect usage
  of forbidden globals. Overkill and would miss dynamic property access. The
  runtime approach is sufficient and simpler.

3. **Using vm.Module.customInspect**: Only works for inspection, not execution.

---

## Challenge 5: Handling `pipeline()` Semantics (Overlapping Stages)

### Problem

The `pipeline(items, ...stageFns)` DSL primitive has non-trivial semantics:
stages are NOT fully sequential per-item. Item 1 can enter stage 2 while item 2
is still in stage 1. This is genuine pipelining with overlap.

### Chosen Approach

Implement `pipeline` using a **staged queue** that allows items to progress
independently through stages while preserving stage ordering per item.

**Implementation**:

```javascript
async function pipeline(items, ...stages) {
  // Initialize result array for each item
  const results = new Array(items.length);
  let current = [...items];
  
  // Process each stage
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const stageFn = stages[stageIndex];
    
    // Apply stage function to each item concurrently
    const stagePromises = current.map((item, itemIndex) => {
      const label = `pipeline-stage${stageIndex}-item${itemIndex}`;
      recordStart('pipeline', label);
      
      return Promise.resolve(stageFn(item))
        .then(result => {
          recordEnd(label);
          return { itemIndex, result };
        });
    });
    
    // Wait for ALL items to complete this stage before moving to next
    // (but items within the stage ran concurrently)
    const stageResults = await Promise.all(stagePromises);
    
    // Update current for next stage
    current = stageResults.map(r => r.result);
  }
  
  return current;
}
```

Wait — this is sequential across stages. The contract says "item 1 can enter
stage 2 while item 2 is still finishing stage 1". This requires **true
pipelining**:

**Correct Implementation**:

```javascript
async function pipeline(items, ...stages) {
  if (items.length === 0) return [];
  
  const results = items.map(() => ({ stages: [], done: false }));
  
  // Process each item through all stages
  const itemPromises = items.map(async (item, itemIndex) => {
    let current = item;
    
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      const stageFn = stages[stageIndex];
      const label = `pipeline-item${itemIndex}-stage${stageIndex}`;
      
      recordStart('pipeline', label);
      current = await Promise.resolve(stageFn(current));
      recordEnd(label);
      
      results[itemIndex].stages.push(current);
    }
    
    results[itemIndex].done = true;
    return current;
  });
  
  // All items run through their stages concurrently
  // (individual items still run stages sequentially)
  return Promise.all(itemPromises);
}
```

This still doesn't capture the overlap between items at different stages. The
key insight is: stages are functions that can return promises, and items move
independently.

**Implementation with Observable Overlap**:

The key is that `stageFn(item)` can be an async operation (e.g., calling
`agent()`). While item 1 awaits its agent response for stage 2, item 2 can
start stage 1.

```javascript
async function pipeline(items, ...stages) {
  const results = new Array(items.length);
  const stagesResults = [];
  
  // For each item, create a promise chain through all stages
  const itemPromises = items.map(async (item, itemIndex) => {
    let current = item;
    
    for (const stageFn of stages) {
      // Stage functions can be async (e.g., calling agent())
      // While this awaits, other items can progress
      current = await stageFn(current);
    }
    
    return current;
  });
  
  // All items progress through stages concurrently
  // (genuine overlap happens when stages are async)
  return Promise.all(itemPromises);
}
```

The overlap is observable in the trace: if stage 1 of item 2 starts after
stage 2 of item 1 has started, they overlapped.

### Testing Overlap

```javascript
const script = `
const results = await pipeline(
  ['a', 'b'],
  async (item) => {
    await agent(\`process \${item}\`, { label: item });
    return item.toUpperCase();
  }
);
`;

const options = {
  agentResponses: {
    'a': [{ value: 'A-result', delay: 5 }],
    'b': [{ value: 'B-result', delay: 2 }]
  }
};

const result = await runWorkflowScript(script, options);

// Verify overlap: item 'b' stage 1 started after item 'a' stage 1 but
// before it finished
const trace = result.trace;
const aStart = trace.find(e => e.label === 'a').start;
const aEnd = trace.find(e => e.label === 'a').end;
const bStart = trace.find(e => e.label === 'b').start;

assert(bStart > aStart); // b started after a
assert(bStart < aEnd); // but before a finished → overlap
```

---

## Challenge 6: Error Handling in `parallel()` (Design Decision Required)

### Problem

The contract states: "If one thunk rejects, document and design how that affects
the others (this is a real open design question)".

### Chosen Approach

Fail-fast: if any thunk in `parallel()` rejects, `parallel()` immediately rejects
with a `ParallelError` that includes:
- The error from the failing thunk
- A list of which thunks completed successfully
- A list of which thunks were still pending (and their results/errors if they
  complete later)

**Implementation**:

```javascript
class ParallelError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ParallelError';
    this.code = 'PARALLEL_FAILURE';
    this.completed = details.completed; // { index, result }[]
    this.failed = details.failed; // { index, error }
    this.pending = details.pending; // index[]
  }
}

async function parallel(thunks) {
  const results = new Array(thunks.length);
  const status = thunks.map(() => ({ state: 'pending' }));
  
  const promises = thunks.map(async (thunk, index) => {
    try {
      const result = await thunk();
      status[index] = { state: 'completed', result };
      return { index, result };
    } catch (error) {
      status[index] = { state: 'failed', error };
      throw { index, error }; // Throw to be caught by Promise.all
    }
  });
  
  try {
    const settled = await Promise.all(promises);
    return settled.map(s => s.result);
  } catch (failure) {
    // Construct ParallelError with details
    const completed = status
      .filter(s => s.state === 'completed')
      .map((s, i) => ({ index: i, result: s.result }));
    
    const failed = [failure];
    
    const pending = status
      .map((s, i) => ({ state: s.state, index: i }))
      .filter(s => s.state === 'pending')
      .map(s => s.index);
    
    throw new ParallelError(
      `Parallel execution failed: thunk ${failure.index} rejected with ${failure.error.message}`,
      { completed, failed, pending }
    );
  }
}
```

**Note**: With `Promise.all`, other promises continue running even after one
rejects. We capture their status at the moment of failure.

### Rationale

- **Fail-fast** is idiomatic for Promise-based concurrency in JavaScript
- **Detailed error** allows tests to verify that some thunks succeeded before
  the failure occurred
- **Pending list** shows which thunks were still running, useful for debugging

### Alternative Considered

**Wait-for-all**: Use `Promise.allSettled()` to wait for all thunks to complete,
then aggregate results. This is slower and doesn't match the fail-fast behavior
users expect from `Promise.all`. Could be offered as a future option.

---

## Summary of Design Decisions

| Challenge | Decision | Key Rationale |
|-----------|----------|---------------|
| ES Modules in vm | `vm.runInContext()` with async wrapper, minimal export capture | No dependencies, preserves script semantics |
| Ambient Globals | Populate sandbox context directly, no imports | Matches contract's "NOT via import" requirement |
| Concurrency Verification | Counter-based execution traces | Deterministic tests, genuine concurrency |
| Forbidden Primitives | Proxy with whitelist, explicit errors | Active blocking, clear diagnostics |
| Pipeline Semantics | Per-item stage chains with Promise.all | Genuine overlap, testable traces |
| Parallel Error Handling | Fail-fast with detailed ParallelError | Idiomatic, testable failure details |

All decisions prioritize:
1. Zero dependencies (CONSTITUTION Principle II)
2. Script unmodified execution (CONSTITUTION Principle IV)
3. Deterministic tests (CONSTITUTION Principle V)
4. Clear, actionable errors (FR-012)