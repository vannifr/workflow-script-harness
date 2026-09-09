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
