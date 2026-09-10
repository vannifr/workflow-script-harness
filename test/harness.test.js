'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { runWorkflowScript } = require('../src/harness.js');

test('T003: a minimal script with no DSL calls runs and returns its export default', async () => {
  const script = `
    export const meta = { name: 'minimal', phases: [] };
    export default 42;
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.value, 42);
});

test('T005: accessing a global not in the DSL allowlist throws a HarnessError (UNKNOWN_GLOBAL)', async () => {
  const script = `
    export const meta = { name: 'unknown-global', phases: [] };
    const x = console;
    export default x;
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'HarnessError');
  assert.strictEqual(result.error.code, 'UNKNOWN_GLOBAL');
});

test('T007: options.args is exposed unmodified as the args global', async () => {
  const script = `
    export const meta = { name: 'args-test', phases: [] };
    export default args;
  `;
  const inputArgs = { filePath: '/src/index.js', maxFindings: 10 };
  const result = await runWorkflowScript(script, { args: inputArgs });
  assert.strictEqual(result.status, 'success');
  assert.deepStrictEqual(result.value, inputArgs);
});

test('T009: phase() with a title not in meta.phases produces a ScriptError', async () => {
  const script = `
    export const meta = { name: 'phase-test', phases: [{ title: 'Review' }] };
    phase('DoesNotExist');
    export default 'unreachable';
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'ScriptError');
});

test('T009b: phase() with a title that IS in meta.phases succeeds', async () => {
  const script = `
    export const meta = { name: 'phase-test', phases: [{ title: 'Review' }] };
    phase('Review');
    export default 'ok';
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.value, 'ok');
});

test('T011: log() is callable and does not affect the script result', async () => {
  const script = `
    export const meta = { name: 'log-test', phases: [] };
    log('a status message');
    export default 'done';
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.value, 'done');
});

test('T013: agent() with a scripted response for a label returns that response', async () => {
  const script = `
    export const meta = { name: 'agent-test', phases: [] };
    export default agent('some-agent-call', { label: 'x' });
  `;
  const options = {
    args: {},
    agentResponses: {
      x: { status: 'completed', data: { result: 'agent response' } }
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'success');
  assert.deepStrictEqual(result.value, { status: 'completed', data: { result: 'agent response' } });
});

test('T015: the same script text object produces non-error result across two calls (no mutation)', async () => {
  const script = `
    export const meta = { name: 'agent-test', phases: [] };
    export default agent('some-agent-call', { label: 'x' });
  `;
  
  const options = {
    args: {},
    agentResponses: {
      x: { status: 'completed', data: { result: 'first response' } }
    }
  };
  
  // First call
  const result1 = await runWorkflowScript(script, options);
  assert.strictEqual(result1.status, 'success');
  assert.deepStrictEqual(result1.value, { status: 'completed', data: { result: 'first response' } });
  
  // Second call with the exact same script text should also succeed
  const options2 = {
    args: {},
    agentResponses: {
      x: { status: 'completed', data: { result: 'second response' } }
    }
  };
  const result2 = await runWorkflowScript(script, options2);
  assert.strictEqual(result2.status, 'success');
  assert.deepStrictEqual(result2.value, { status: 'completed', data: { result: 'second response' } });
});

test('T017: calling a function not in DSL allowlist produces a HarnessError naming the function', async () => {
  const script = `
    export const meta = { name: 'unknown-func-test', phases: [] };
    export default unsupportedFunction();
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'HarnessError');
  assert.ok(result.error.message.includes('unsupportedFunction'));
  assert.strictEqual(result.error.code, 'UNKNOWN_GLOBAL');
});

// Regression test: a plain script bug (TypeError from a bad property
// access) is constructed using the VM CONTEXT'S OWN Error intrinsics, not
// the host's. Reading its `.stack` naively can trigger the sandbox's
// restrictive global Proxy a second time (while V8 lazily resolves stack-
// formatting internals) and CRASH THE PROCESS with an uncaught exception,
// instead of gracefully returning a ScriptError. Confirmed empirically
// this reproduces 100% of the time without the heal-and-cache fix in
// ScriptError's constructor (see healOriginalErrorStack in harness.js).
test('regression: a plain script TypeError is caught as ScriptError without crashing, and originalError.stack is safe to read', async () => {
  const script = `
    export const meta = { name: 'plain-bug-test', phases: [] };
    const v = undefined;
    export default v.someProperty;
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'ScriptError');
  assert.notStrictEqual(result.error.name, 'HarnessError');
  // The dangerous access: must not throw/crash the process.
  assert.doesNotThrow(() => {
    const s = result.error.originalError.stack;
    assert.strictEqual(typeof s, 'string');
  });
});

test('T020: two agent() calls with the same label consume scripted responses in order', async () => {
  const script = `
    export const meta = { name: 'agent-order-test', phases: [] };
    const first = await agent('call1', { label: 'x' });
    const second = await agent('call2', { label: 'x' });
    export default [first, second];
  `;
  const options = {
    args: {},
    agentResponses: {
      x: [{ status: 'first' }, { status: 'second' }]
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'success');
  // Check length first
  assert.strictEqual(result.value.length, 2);
  // Check individual elements
  assert.strictEqual(result.value[0].status, 'first');
  assert.strictEqual(result.value[1].status, 'second');
});

test('T022: a scripted {type:\'null\'} response resolves the agent() call to null rather than throwing', async () => {
  const script = `
    export const meta = { name: 'agent-null-test', phases: [] };
    const result = await agent('call', { label: 'null-label' });
    export default result;
  `;
  const options = {
    args: {},
    agentResponses: {
      'null-label': { type: 'null' }
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.value, null);
});

test('T024: calling agent() with a label more times than it has scripted responses throws a HarnessError with code EXHAUSTED_AGENT_RESPONSES', async () => {
  const script = `
    export const meta = { name: 'agent-exhaust-test', phases: [] };
    const first = await agent('call1', { label: 'limited' });
    const second = await agent('call2', { label: 'limited' });
    const third = await agent('call3', { label: 'limited' });  // This should throw
    export default [first, second, third];
  `;
  const options = {
    args: {},
    agentResponses: {
      limited: [{ status: 'first' }, { status: 'second' }]  // Only 2 responses for 3 calls
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'HarnessError');
  assert.strictEqual(result.error.code, 'EXHAUSTED_AGENT_RESPONSES');
  assert.strictEqual(result.error.context.label, 'limited');
  assert.strictEqual(result.error.context.callCount, 3);
  assert.strictEqual(result.error.context.responseCount, 2);
});

// T025 is already implemented as part of T021 and T024 implementation

test('T034: options.budget.total is exposed unmodified as budget.total inside the script', async () => {
  const script = `
    export const meta = { name: 'budget-total-test', phases: [] };
    export default budget.total;
  `;
  const options = {
    args: {},
    budget: {
      total: 100
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.value, 100);
});

test('T036: successive budget.spent() calls consume options.budget.spentSequence in order, and an over-exhausted call throws a HarnessError with code EXHAUSTED_BUDGET_SPENT', async () => {
  const script = `
    export const meta = { name: 'budget-spent-test', phases: [] };
    const spent1 = budget.spent();
    const spent2 = budget.spent();
    const spent3 = budget.spent();  // This should throw since we only have 2 values
    export default [spent1, spent2, spent3];
  `;
  const options = {
    args: {},
    budget: {
      total: 100,
      spentSequence: [10, 20]  // Only 2 values for 3 calls
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'HarnessError');
  assert.strictEqual(result.error.code, 'EXHAUSTED_BUDGET_SPENT');
  assert.strictEqual(result.error.context.callCount, 3);
  assert.strictEqual(result.error.context.valueCount, 2);
});

test('T039: Date.now() is actively blocked with a HarnessError(FORBIDDEN_PRIMITIVE) naming Date', async () => {
  const script = `
    export const meta = { name: 'forbidden-date-test', phases: [] };
    const timestamp = Date.now();
    export default timestamp;
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'HarnessError');
  assert.strictEqual(result.error.code, 'FORBIDDEN_PRIMITIVE');
  assert.strictEqual(result.error.context.primitive, 'Date');
});

test('T041: Math.random() and new Date() are both blocked the same recognizable way', async () => {
  const mathScript = `
    export const meta = { name: 'forbidden-math-test', phases: [] };
    export default Math.random();
  `;
  const mathResult = await runWorkflowScript(mathScript, {});
  assert.strictEqual(mathResult.status, 'error');
  assert.strictEqual(mathResult.error.code, 'FORBIDDEN_PRIMITIVE');
  assert.strictEqual(mathResult.error.context.primitive, 'Math');

  const dateScript = `
    export const meta = { name: 'forbidden-new-date-test', phases: [] };
    export default new Date();
  `;
  const dateResult = await runWorkflowScript(dateScript, {});
  assert.strictEqual(dateResult.status, 'error');
  assert.strictEqual(dateResult.error.code, 'FORBIDDEN_PRIMITIVE');
  assert.strictEqual(dateResult.error.context.primitive, 'Date');
});

test('T043: a Node-only host API (require) is blocked with an error naming it as outside the sandbox', async () => {
  const script = `
    export const meta = { name: 'forbidden-require-test', phases: [] };
    const fs = require('fs');
    export default 'unreachable';
  `;
  const result = await runWorkflowScript(script, {});
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(result.error.name, 'HarnessError');
  assert.strictEqual(result.error.code, 'FORBIDDEN_PRIMITIVE');
  assert.strictEqual(result.error.context.primitive, 'require');
});

test('T027: parallel() over 3 thunks produces a trace with genuinely overlapping entries', async () => {
  const script = `
    export const meta = { name: 'parallel-overlap-test', phases: [] };
    const results = await parallel([
      () => agent('Task A', { label: 'task-a' }),
      () => agent('Task B', { label: 'task-b' }),
      () => agent('Task C', { label: 'task-c' })
    ]);
    export default results;
  `;
  const options = {
    agentResponses: {
      'task-a': ['result-A'],
      'task-b': ['result-B'],
      'task-c': ['result-C']
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'success');
  assert.deepStrictEqual(result.value, ['result-A', 'result-B', 'result-C']);

  assert.ok(Array.isArray(result.trace.entries));
  const parallelEntries = result.trace.entries.filter((e) => e.type === 'parallel');
  assert.strictEqual(parallelEntries.length, 3);
  // Genuine overlap: every entry's startCounter must be < every OTHER
  // entry's endCounter — i.e. all three were started before any of them
  // finished, not "start1, end1, start2, end2, ..." (sequential).
  for (const a of parallelEntries) {
    for (const b of parallelEntries) {
      if (a !== b) {
        assert.ok(
          a.startCounter < b.endCounter,
          `expected ${a.id}.start (${a.startCounter}) < ${b.id}.end (${b.endCounter})`
        );
      }
    }
  }
});

test('T029: pipeline() preserves per-item stage ordering while allowing items to overlap across stages', async () => {
  const script = `
    export const meta = { name: 'pipeline-order-test', phases: [] };
    const results = await pipeline(
      [1, 2],
      async (item) => {
        const r = await agent('stage1', { label: \`stage1-\${item}\` });
        return { item, stage1: r };
      },
      async (data) => {
        const r = await agent('stage2', { label: \`stage2-\${data.item}\` });
        return { ...data, stage2: r };
      }
    );
    export default results;
  `;
  const options = {
    agentResponses: {
      'stage1-1': ['s1-1'], 'stage1-2': ['s1-2'],
      'stage2-1': ['s2-1'], 'stage2-2': ['s2-2']
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'success');
  // Non-strict deepEqual, not deepStrictEqual: these objects are
  // constructed BY THE SANDBOXED SCRIPT's own object-literal syntax, so
  // they carry the VM CONTEXT'S OWN Object.prototype, not the host's —
  // deepStrictEqual also compares [[Prototype]] and would spuriously fail
  // here even though every own-property matches exactly. See the
  // "cross-realm object identity" note in harness.js.
  assert.deepEqual(result.value, [
    { item: 1, stage1: 's1-1', stage2: 's2-1' },
    { item: 2, stage1: 's1-2', stage2: 's2-2' }
  ]);

  const pipelineEntries = result.trace.entries.filter((e) => e.type === 'pipeline');
  const item1Stage0 = pipelineEntries.find((e) => e.id === 'pipeline-item0-stage0');
  const item1Stage1 = pipelineEntries.find((e) => e.id === 'pipeline-item0-stage1');
  // Per-item ordering MUST hold: stage 1 for an item never starts before
  // stage 0 for that SAME item has produced its result.
  assert.ok(item1Stage0.endCounter <= item1Stage1.startCounter);
});

test('T031: a failing thunk inside parallel() produces a ParallelError with completed/failed/pending', async () => {
  const script = `
    export const meta = { name: 'parallel-failure-test', phases: [] };
    const results = await parallel([
      () => agent('Successful task', { label: 'success-task' }),
      () => { throw new Error('Failed task'); }
    ]);
    export default results;
  `;
  const options = {
    agentResponses: {
      'success-task': ['should-not-be-reached-in-assertion-but-may-resolve']
    }
  };
  const result = await runWorkflowScript(script, options);
  assert.strictEqual(result.status, 'error');
  // ParallelError is constructed in host code from a script-level failure
  // (one thunk's own thrown Error) — classified as ScriptError, same as
  // any other script-thrown error (FR-012), with the ParallelError detail
  // preserved on originalError for inspection.
  assert.strictEqual(result.error.name, 'ScriptError');
  assert.strictEqual(result.error.originalError.name, 'ParallelError');
  assert.strictEqual(result.error.originalError.failed.length, 1);
  assert.strictEqual(result.error.originalError.completed.length, 1);
});
