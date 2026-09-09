# DO NOT MODIFY SCENARIOS
# Derived from requirements. Fix code to pass tests; re-run /iikit-04-testify if requirements change.
@US-002
Feature: US2 - Scripten van agent()-antwoorden, incl. mislukking (Priority: P2)

  @TS-004 @FR-003 @SC-002 @P2 @acceptance
  Scenario: Scripted agent() responses are returned in order for a label
    Given a test that specifies responses [A, B] in that order for label "reviewer"
    When the script calls agent() twice with label "reviewer"
    Then the first call receives A and the second call receives B

  @TS-005 @FR-004 @SC-003 @P2 @acceptance
  Scenario: A scripted null response simulates a failed agent call
    Given a test that specifies a null response at the second position for a label
    When the script makes the second agent() call for that label
    Then the harness simulates a failed/empty agent response and the script handles the failure

  @TS-006 @FR-005 @SC-005 @P2 @acceptance
  Scenario: Exhausted scripted responses produce a clear, diagnosable error
    Given a script that calls agent() more times than specified responses for a label
    When the extra call is made
    Then the harness signals this with a clear, diagnosable error
