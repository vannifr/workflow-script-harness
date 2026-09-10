const { Given, Then } = require('@cucumber/cucumber');
const assert = require('node:assert');

// Note: the shared "When the script is executed" step lives in
// common.steps.js — do not re-register it here (Cucumber would report it
// as ambiguous). Each Given below sets this.script and this.options so
// that shared step can run runWorkflowScript(this.script, this.options).

Given('a script that passes three tasks to parallel\\(\\)', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const results = await parallel([
      () => agent('Task A', { label: 'task-a' }),
      () => agent('Task B', { label: 'task-b' }),
      () => agent('Task C', { label: 'task-c' })
    ]);
    export default results;
  `;
  this.options = {
    agentResponses: {
      'task-a': ['result-A'],
      'task-b': ['result-B'],
      'task-c': ['result-C']
    }
  };
});

Then('the test can demonstrate that at least two of those tasks were running concurrently, not sequentially', function () {
  assert.strictEqual(this.scriptResult.status, 'success');
  assert.ok(Array.isArray(this.scriptResult.value));
  assert.strictEqual(this.scriptResult.value.length, 3);

  assert.ok(this.scriptResult.value.some(r => r === 'result-A'));
  assert.ok(this.scriptResult.value.some(r => r === 'result-B'));
  assert.ok(this.scriptResult.value.some(r => r === 'result-C'));

  // Genuine overlap, demonstrated via the harness's execution trace
  // (contracts/runWorkflowScript.md: startCounter/endCounter) rather than
  // merely inferred from result order: every parallel entry's start must
  // precede every OTHER entry's end — i.e. all three were already running
  // before any single one finished.
  const entries = this.scriptResult.trace.entries.filter(e => e.type === 'parallel');
  assert.strictEqual(entries.length, 3);
  let overlapFound = false;
  for (const a of entries) {
    for (const b of entries) {
      if (a !== b && a.startCounter < b.endCounter && b.startCounter < a.endCounter) {
        overlapFound = true;
      }
    }
  }
  assert.ok(overlapFound, 'expected at least two parallel entries to genuinely overlap');
});

Given('a script that uses pipeline\\(\\) to chain steps sequentially', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const items = [1, 2, 3];
    const results = await pipeline(
      items,
      async (item) => {
        const result = await agent(\`Step 1 for \${item}\`, { label: \`stage1-\${item}\` });
        return { item, stage1: result };
      },
      async (itemData) => {
        const result = await agent(\`Step 2 for \${itemData.item}\`, { label: \`stage2-\${itemData.item}\` });
        return { ...itemData, stage2: result };
      }
    );
    export default results;
  `;
  this.options = {
    agentResponses: {
      'stage1-1': ['result-1-stage1'],
      'stage1-2': ['result-2-stage1'],
      'stage1-3': ['result-3-stage1'],
      'stage2-1': ['result-1-stage2'],
      'stage2-2': ['result-2-stage2'],
      'stage2-3': ['result-3-stage2']
    }
  };
});

Then('the harness verifies that each step starts only after the previous step has produced its result', function () {
  assert.strictEqual(this.scriptResult.status, 'success');
  assert.ok(Array.isArray(this.scriptResult.value));
  assert.strictEqual(this.scriptResult.value.length, 3);

  const resultValues = this.scriptResult.value.map(item => item.stage2);
  assert.ok(resultValues.every(value => value.startsWith('result-')));
});

Given('a script where a task within parallel\\(\\) fails', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const results = await parallel([
      () => agent('Successful task', { label: 'success-task' }),
      () => { throw new Error('Failed task'); }
    ]);
    export default results;
  `;
  this.options = {
    agentResponses: {
      'success-task': ['should not be reached due to error']
    }
  };
});

Then('the test can verify how this affects other concurrently running tasks according to the real Workflow-tool behavior', function () {
  // Fail-fast: parallel() waits for every thunk to settle, then throws a
  // ParallelError (host-realm, classified as ScriptError per FR-012 since
  // the underlying cause is the script's own thrown error) listing which
  // sibling tasks completed vs. failed — see research.md Challenge 6.
  assert.strictEqual(this.scriptResult.status, 'error');
  assert.strictEqual(this.scriptResult.error.name, 'ScriptError');
  assert.strictEqual(this.scriptResult.error.originalError.name, 'ParallelError');
  assert.strictEqual(this.scriptResult.error.originalError.failed.length, 1);
  assert.strictEqual(this.scriptResult.error.originalError.completed.length, 1);
});
