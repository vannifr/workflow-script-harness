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
