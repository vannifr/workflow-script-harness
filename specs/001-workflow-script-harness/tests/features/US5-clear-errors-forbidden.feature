# DO NOT MODIFY SCENARIOS
# Derived from requirements. Fix code to pass tests; re-run /iikit-04-testify if requirements change.
@US-005
Feature: US5 - Duidelijke fouten bij verboden aanroepen (Priority: P5)

  @TS-012 @FR-010 @SC-005 @P5 @acceptance
  Scenario: Date.now() is actively blocked with a named error
    Given a script that calls Date.now()
    When the script is executed
    Then execution fails with an error message that explicitly names Date.now() as the cause

  @TS-013 @FR-010 @SC-005 @P5 @acceptance
  Scenario: Math.random() and new Date() are blocked the same recognizable way
    Given a script that calls Math.random() or new Date()
    When the script is executed
    Then execution fails in the same recognizable way

  @TS-014 @FR-011 @SC-005 @P5 @acceptance
  Scenario: A Node-only host API is blocked with a sandbox-boundary error
    Given a script that calls a Node-only API (e.g. filesystem or network access)
    When the script is executed
    Then execution fails with an error message that clarifies the call is outside the sandbox
