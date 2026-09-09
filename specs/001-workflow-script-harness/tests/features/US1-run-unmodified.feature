# DO NOT MODIFY SCENARIOS
# Derived from requirements. Fix code to pass tests; re-run /iikit-04-testify if requirements change.
@US-001
Feature: US1 - Run a workflow-script unmodified (Priority: P1)

  @TS-001 @FR-001 @FR-013 @SC-001 @P1 @acceptance
  Scenario: A valid script with one agent() call runs unmodified via the harness
    Given a valid workflow script that reads args and makes one agent() call
    When the script is executed via the harness
    Then the harness returns the script's return value without error

  @TS-002 @FR-001 @SC-001 @P1 @acceptance
  Scenario: The same script text requires no adaptation for the harness
    Given the same script file
    When it is offered to both the harness and (hypothetically) the real Workflow-tool sandbox
    Then neither requires an adaptation to the script file

  @TS-003 @FR-013 @SC-005 @P1 @acceptance
  Scenario: An unsupported DSL function produces a clear, named error
    Given a script that uses a DSL function not supported by the harness
    When the script is executed
    Then the harness provides a clear error message that names the unknown function
