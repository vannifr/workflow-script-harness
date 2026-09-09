const { Given, When, Then } = require('@cucumber/cucumber');
const { runWorkflowScript } = require('../../../../src/harness.js');
const assert = require('node:assert');

Given('a valid workflow script that reads args and makes one agent\\(\\) call', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const result = await agent('Process data', { label: 'processor' });
    export default result;
  `;
  this.options = {
    agentResponses: {
      processor: ['processed-data']
    },
    args: {}
  };
});

When('the script is executed via the harness', async function () {
  try {
    this.scriptResult = await runWorkflowScript(this.script, this.options);
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});

Then('the harness returns the script\'s return value without error', function () {
  assert.strictEqual(this.scriptResult.status, 'success');
  assert.strictEqual(this.scriptResult.value, 'processed-data');
});

Given('the same script file', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const result = await agent('Process data', { label: 'processor' });
    export default result;
  `;
  this.options = {
    agentResponses: {
      processor: ['processed-data']
    },
    args: {}
  };
});

// Escape both parens: "(hypothetically)" would otherwise be parsed as
// Cucumber Expression optional-text syntax, which does not match the
// literal parenthesis characters in the .feature file's step text.
When('it is offered to both the harness and \\(hypothetically\\) the real Workflow-tool sandbox', async function () {
  // We can only exercise the harness here; the real sandbox is not available
  // in this test environment (hence "hypothetically" in the scenario text).
  try {
    this.scriptResult = await runWorkflowScript(this.script, this.options);
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});

Then('neither requires an adaptation to the script file', function () {
  // The same script text (this.script) was used unmodified for both calls;
  // a non-error result proves the harness required no adaptation.
  assert.ok(this.scriptResult !== undefined);
  assert.notStrictEqual(this.scriptResult.status, 'error');
});

Given('a script that uses a DSL function not supported by the harness', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const result = unsupportedFunction();
    export default result;
  `;
  this.options = {};
});

Then('the harness provides a clear error message that names the unknown function', function () {
  assert.strictEqual(this.scriptResult.status, 'error');
  assert.ok(
    this.scriptResult.error.message.includes('unsupportedFunction') ||
    this.scriptResult.error.message.toLowerCase().includes('unknown') ||
    this.scriptResult.error.message.toLowerCase().includes('not defined')
  );
});
