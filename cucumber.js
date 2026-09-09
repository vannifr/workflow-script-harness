module.exports = {
  default: {
    paths: [
      'specs/001-workflow-script-harness/tests/features/**/*.feature'
    ],
    require: [
      'specs/001-workflow-script-harness/tests/step_definitions/**/*.steps.js'
    ],
    format: ['progress']
  }
};