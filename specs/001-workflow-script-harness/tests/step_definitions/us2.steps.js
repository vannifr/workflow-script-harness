const { Given, When, Then } = require('@cucumber/cucumber');
const { runWorkflowScript } = require('../../../../src/harness.js');
const assert = require('node:assert');

Given('a test that specifies responses [A, B] in that order for label {string}', function (label) {
  this.label = label;
  this.responses = {
    [label]: ['A', 'B']
  };
});

When('the script calls agent\\(\\) twice with label {string}', async function (label) {
  const script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const result1 = await agent('First call', { label: '${label}' });
    const result2 = await agent('Second call', { label: '${label}' });
    export default { result1, result2 };
  `;

  try {
    this.scriptResult = await runWorkflowScript(script, {
      agentResponses: this.responses
    });
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});

Then('the first call receives A and the second call receives B', function () {
  assert.strictEqual(this.scriptResult.status, 'success');
  assert.strictEqual(this.scriptResult.value.result1, 'A');
  assert.strictEqual(this.scriptResult.value.result2, 'B');
});

Given('a test that specifies a null response at the second position for a label', function () {
  this.label = 'test-label';
  this.responses = {
    [this.label]: ['first-response', { type: 'null' }]
  };
});

When('the script makes the second agent\\(\\) call for that label', async function () {
  const script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const result1 = await agent('First call', { label: '${this.label}' });
    const result2 = await agent('Second call', { label: '${this.label}' });
    export default { result1, result2 };
  `;

  try {
    this.scriptResult = await runWorkflowScript(script, {
      agentResponses: this.responses
    });
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});

// Escape the slash: "failed/empty" would otherwise be parsed as a Cucumber
// Expression alternative-text group ("failed" OR "empty"), which does not
// match the literal "/" character in the .feature file's step text.
Then('the harness simulates a failed\\/empty agent response and the script handles the failure', function () {
  // A scripted null response should be handled gracefully by the script
  // itself (fallback logic), so the overall run still succeeds.
  assert.strictEqual(this.scriptResult.status, 'success');
  assert.strictEqual(this.scriptResult.value.result1, 'first-response');
  assert.strictEqual(this.scriptResult.value.result2, null);
});

Given('a script that calls agent\\(\\) more times than specified responses for a label', function () {
  this.label = 'limited-responses';
  this.responses = {
    [this.label]: ['first']
  };
});

When('the extra call is made', async function () {
  const script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const result1 = await agent('First call', { label: '${this.label}' });
    const result2 = await agent('Second call', { label: '${this.label}' });
    export default { result1, result2 };
  `;

  try {
    this.scriptResult = await runWorkflowScript(script, {
      agentResponses: this.responses
    });
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});

Then('the harness signals this with a clear, diagnosable error', function () {
  assert.strictEqual(this.scriptResult.status, 'error');
  assert.ok(
    this.scriptResult.error.message.toLowerCase().includes('exhausted') ||
    this.scriptResult.error.message.toLowerCase().includes('missing') ||
    this.scriptResult.error.message.toLowerCase().includes('no response')
  );
});
