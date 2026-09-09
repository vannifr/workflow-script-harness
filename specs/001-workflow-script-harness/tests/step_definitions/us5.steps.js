const { Given, Then } = require('@cucumber/cucumber');
const assert = require('node:assert');

// Note: the shared "When the script is executed" step lives in
// common.steps.js — do not re-register it here.

Given('a script that calls Date.now\\(\\)', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const timestamp = Date.now();
    export default timestamp;
  `;
  this.options = {};
});

Then('execution fails with an error message that explicitly names Date.now\\(\\) as the cause', function () {
  assert.strictEqual(this.scriptResult.status, 'error');
  assert.ok(
    this.scriptResult.error.message.includes('Date') &&
    this.scriptResult.error.message.includes('now')
  );
});

Given('a script that calls Math.random\\(\\) or new Date\\(\\)', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const randomValue = Math.random();
    export default randomValue;
  `;
  this.options = {};
});

Then('execution fails in the same recognizable way', function () {
  assert.strictEqual(this.scriptResult.status, 'error');
  const message = this.scriptResult.error.message;
  assert.ok(
    (message.toLowerCase().includes('math') && message.toLowerCase().includes('random')) ||
    (message.includes('Math') && message.includes('random'))
  );
});

Given('a script that calls a Node-only API \\(e.g. filesystem or network access\\)', function () {
  this.script = `
    export const meta = { name: 'test-workflow', phases: [] };
    const fs = require('fs');
    export default 'result';
  `;
  this.options = {};
});

Then('execution fails with an error message that clarifies the call is outside the sandbox', function () {
  assert.strictEqual(this.scriptResult.status, 'error');
  assert.ok(
    this.scriptResult.error.message.toLowerCase().includes('require') ||
    this.scriptResult.error.message.toLowerCase().includes('fs') ||
    this.scriptResult.error.message.toLowerCase().includes('forbidden') ||
    this.scriptResult.error.message.toLowerCase().includes('outside')
  );
});
