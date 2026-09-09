# DO NOT MODIFY SCENARIOS
# Derived from requirements. Fix code to pass tests; re-run /iikit-04-testify if requirements change.
@US-003
Feature: US3 - Verifiëren van échte concurrency (Priority: P3)

  @TS-007 @FR-006 @SC-004 @P3 @acceptance
  Scenario: Three tasks in parallel() genuinely overlap
    Given a script that passes three tasks to parallel()
    When the script is executed
    Then the test can demonstrate that at least two of those tasks were running concurrently, not sequentially

  @TS-008 @FR-007 @SC-004 @P3 @acceptance
  Scenario: pipeline() preserves per-item stage ordering
    Given a script that uses pipeline() to chain steps sequentially
    When the script is executed
    Then the harness verifies that each step starts only after the previous step has produced its result

  @TS-009 @FR-006 @FR-007 @SC-004 @P3 @acceptance
  Scenario: A failing task within parallel() has documented, verifiable impact on siblings
    Given a script where a task within parallel() fails
    When the script is executed
    Then the test can verify how this affects other concurrently running tasks according to the real Workflow-tool behavior
