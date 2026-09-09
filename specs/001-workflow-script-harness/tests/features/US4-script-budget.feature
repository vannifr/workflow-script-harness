# DO NOT MODIFY SCENARIOS
# Derived from requirements. Fix code to pass tests; re-run /iikit-04-testify if requirements change.
@US-004
Feature: US4 - Scripten van budget (Priority: P4)

  @TS-010 @FR-008 @SC-002 @P4 @acceptance
  Scenario: budget.total returns the scripted fixed value
    Given a test that sets budget.total to a fixed value
    When the script reads that value
    Then the returned value matches what the test specified

  @TS-011 @FR-009 @SC-002 @P4 @acceptance
  Scenario: budget.spent() returns scripted values in sequence
    Given a test that scripts a sequence of values for budget.spent()
    When the script calls budget.spent() multiple times
    Then each call receives the next scripted value in the sequence
