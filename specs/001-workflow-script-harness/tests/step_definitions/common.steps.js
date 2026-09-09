const { When } = require('@cucumber/cucumber');
const { runWorkflowScript } = require('../../../../src/harness.js');

// Shared across all user stories: every Given step sets `this.script` and,
// where needed, `this.options` (agentResponses/budget/args) on the World.
// This is the ONE canonical registration for this phrase — do not
// re-register it in a per-story step file, or Cucumber reports it as
// ambiguous (multiple matching step definitions).
When('the script is executed', async function () {
  try {
    this.scriptResult = await runWorkflowScript(this.script, this.options || {});
  } catch (error) {
    this.scriptResult = { status: 'error', error };
  }
});
