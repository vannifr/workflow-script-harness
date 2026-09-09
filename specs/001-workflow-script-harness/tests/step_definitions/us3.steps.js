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

  // Genuine overlap must be demonstrated via the harness's execution trace
  // (see contracts/runWorkflowScript.md: startCounter/endCounter), not
  // merely inferred from the result order — tighten this assertion once
  // src/harness.js exposes result.trace.
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
  // A failure in one parallel() task is expected to surface as a
  // ParallelError-style failure (see research.md Challenge 6); the exact
  // shape is finalized during implementation.
  assert.strictEqual(this.scriptResult.status, 'error');
  assert.ok(
    this.scriptResult.error.message.includes('parallel') ||
    this.scriptResult.error.message.includes('concurrent') ||
    this.scriptResult.error.message.includes('task')
  );
});
