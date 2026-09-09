const { Given, When, Then } = require('@cucumber/cucumber');
const { runWorkflowScript } = require('../../../../src/harness.js');
const assert = require('node:assert');

Given('a test that sets budget.total to a fixed value', function () {
  this.budgetTotal = 100;
});

When('the script reads that value', async function () {
  const script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const total = budget.total;
    export default total;
  `;

  try {
    this.scriptResult = await runWorkflowScript(script, {
      budget: {
        total: this.budgetTotal,
        spentSequence: []
      }
    });
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});

Then('the returned value matches what the test specified', function () {
  assert.strictEqual(this.scriptResult.status, 'success');
  assert.strictEqual(this.scriptResult.value, this.budgetTotal);
});

Given('a test that scripts a sequence of values for budget.spent\\(\\)', function () {
  this.spentSequence = [10, 25, 50];
});

When('the script calls budget.spent\\(\\) multiple times', async function () {
  const script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const spent1 = budget.spent();
    const spent2 = budget.spent();
    const spent3 = budget.spent();
    export default { spent1, spent2, spent3 };
  `;

  try {
    this.scriptResult = await runWorkflowScript(script, {
      budget: {
        total: 100,
        spentSequence: this.spentSequence
      }
    });
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});

Then('each call receives the next scripted value in the sequence', function () {
  assert.strictEqual(this.scriptResult.status, 'success');
  assert.strictEqual(this.scriptResult.value.spent1, this.spentSequence[0]);
  assert.strictEqual(this.scriptResult.value.spent2, this.spentSequence[1]);
  assert.strictEqual(this.scriptResult.value.spent3, this.spentSequence[2]);
});
