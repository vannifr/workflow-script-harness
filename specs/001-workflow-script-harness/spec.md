# Feature Specification: Workflow-Script Test Harness

**Feature Branch**: `001-workflow-script-harness`
**Created**: 2026-09-09
**Status**: Draft
**Input**: User description: "Feature: workflow-script-test-harness. User
stories in the form 'as a workflow-script author I want to be able to
script/verify X'. Core capabilities to cover: (1) running a workflow-script
unmodified against a mocked sandbox runtime (agent(), pipeline(), parallel(),
phase(), log(), args, budget) via runWorkflowScript(scriptText, options);
(2) being able to script agent() responses per label/order, including
simulating a null/failed agent response; (3) verifying genuine concurrency
in parallel()/pipeline() — not merely pretending to be sequential;
(4) making budget.total and budget.spent() scriptable from the test setup;
(5) clear, actionable error messages when the script under test calls
forbidden Node APIs or non-deterministic primitives (Date.now(),
Math.random(), new Date())."

## User Stories *(mandatory)*

### User Story 1 - Run a workflow-script unmodified (Priority: P1)

As a workflow-script author, I want to run my workflow-script unmodified
against a mocked sandbox runtime, so that I can verify the script's behavior
without adapting it for testing purposes and without starting a real
session.

**Why this priority**: without this there is no harness — every other
capability builds on it. This is the minimal usable unit: submit a script
and get a result back.

**Independent Test**: can be fully tested by handing the harness a simple
workflow-script (one that uses `agent()`, `log()`, and `args`, no complex
orchestration) and verifying that the script runs to completion and
produces the expected result, without the script file itself being
modified.

**Acceptance Scenarios**:

1. **Given** a valid workflow-script that reads `args` and makes one
   `agent()` call, **When** the script is run through the harness,
   **Then** the harness returns the script's return value with no error.
2. **Given** the same script file, **When** it is submitted both to the
   harness and (hypothetically) to the real Workflow-tool sandbox, **Then**
   neither requires any change to the script file.
3. **Given** a script that uses a DSL function the harness does not
   support, **When** the script is run, **Then** the author gets a clear
   error message naming the unknown function, instead of a silent no-op or
   an incomprehensible crash.

---

### User Story 2 - Scripting agent() responses, including failure (Priority: P2)

As a workflow-script author, I want to determine, per label and per call
order, what response an `agent()` call in my script receives — including
simulating a failed or empty (`null`) agent response — so that I can verify
both the happy path and error handling in my script.

**Why this priority**: without scriptable responses, every test is limited
to "the script runs", never to "the script reacts correctly to what the
agent returns" — that is the core of what a test of orchestration logic
needs to demonstrate.

**Independent Test**: can be fully tested by supplying a sequence of
responses for a given label (including one `null` response) and verifying
that successive `agent()` calls with that label receive those responses in
the given order, and that the script takes its error-handling path when
the `null` response comes up.

**Acceptance Scenarios**:

1. **Given** a test that supplies responses `[A, B]` in that order for
   label `"reviewer"`, **When** the script calls `agent()` with label
   `"reviewer"` twice, **Then** the first call receives `A` and the second
   receives `B`.
2. **Given** a test that supplies a `null` response at the second position
   for a label, **When** the script makes that second call, **Then** the
   harness simulates a failed/empty agent response and the script's own
   error handling can react to it.
3. **Given** a script that calls a label more times than there are scripted
   responses for it, **When** the extra call is made, **Then** the harness
   produces a clear, diagnosable error — no silent `undefined` and no crash
   without context.

---

### User Story 3 - Verifying genuine concurrency (Priority: P3)

As a workflow-script author, I want to be able to verify that `parallel()`
and `pipeline()` in my script actually execute concurrently where the
script expects it, so that ordering or race defects come to light that
would go unnoticed under a merely sequential simulation.

**Why this priority**: this is the hardest and highest-risk category to
verify, but a less frequent first barrier than P1/P2 — an author can
already get value from the harness without this, though coverage remains
incomplete for scripts that rely on concurrency semantics.

**Independent Test**: can be fully tested by supplying a script that hands
multiple tasks to `parallel()`, each with its own scripted agent
delay/order, and verifying that the harness can demonstrate that those
tasks executed overlapping in time (not strictly one after another).

**Acceptance Scenarios**:

1. **Given** a script that hands three tasks to `parallel()`, **When** the
   script is run, **Then** the test can demonstrate that at least two of
   those tasks were in flight at the same time, not merely one after
   another.
2. **Given** a script that uses `pipeline()` to run steps in sequence,
   **When** the script is run, **Then** the harness verifies that each step
   only starts after the previous step has produced its result (correct
   ordering), while independent tasks within the same step are allowed to
   run concurrently.
3. **Given** a script in which a task inside `parallel()` fails, **When**
   the script is run, **Then** the test can verify whether and how that
   affects the other, concurrently running tasks, consistent with the real
   Workflow tool's behavior.

---

### User Story 4 - Scripting budget (Priority: P4)

As a workflow-script author, I want to set `budget.total` and the behavior
of `budget.spent()` from my test, so that I can verify how my script
reacts as a budget limit approaches or is exceeded.

**Why this priority**: budget-aware behavior is a real part of
workflow-scripts, but touches a smaller share of scripts than agent-response
or concurrency behavior — hence lower than P2/P3.

**Independent Test**: can be fully tested by setting up a test with a fixed
`budget.total` and a scripted sequence of values for `budget.spent()`, and
verifying that the script takes its budget-dependent branch (e.g. stop,
scale down) at the correct moment.

**Acceptance Scenarios**:

1. **Given** a test that sets `budget.total` to a fixed value, **When** the
   script reads that value, **Then** the value returned matches what the
   test supplied.
2. **Given** a test that has scripted an ordered sequence of values for
   `budget.spent()`, **When** the script calls `budget.spent()` multiple
   times, **Then** each call receives the next scripted value in that
   sequence.

---

### User Story 5 - Clear errors on forbidden calls (Priority: P5)

As a workflow-script author, I want a clear, actionable error message when
my script calls a Node API or a non-deterministic primitive (`Date.now()`,
`Math.random()`, `new Date()`) that is forbidden in the real sandbox, so
that I catch such errors locally instead of only when the script fails in
a real session.

**Why this priority**: this is a verification capability that complements
the others (it protects the reliability of P1-P4), but does not itself
test new script behavior — hence the lowest priority, though its presence
is what makes every other test trustworthy.

**Independent Test**: can be fully tested by supplying a script that calls
`Date.now()` (or a comparable forbidden primitive) and verifying that the
harness blocks it with an error message that explicitly names the
forbidden call.

**Acceptance Scenarios**:

1. **Given** a script that calls `Date.now()`, **When** the script is run,
   **Then** execution fails with an error message that explicitly names
   `Date.now()` as the cause.
2. **Given** a script that calls `Math.random()` or `new Date()`, **When**
   the script is run, **Then** execution fails in the same, recognizable
   way.
3. **Given** a script that calls a Node-only API (e.g. filesystem or
   network access outside the DSL), **When** the script is run, **Then**
   execution fails with an error message that makes clear that call falls
   outside the sandbox.

### Edge Cases

- What happens when the script calls `agent()` with a label for which no
  responses have been scripted at all?
- What happens when `parallel()` is given an empty list of tasks?
- What happens when `pipeline()` is called with zero stages?
- What happens when the script itself throws an error (not via a
  forbidden API, but an ordinary programming bug) — is that distinguished
  from a harness error?
- What happens when `budget.spent()` is called more times than there are
  scripted values?
- Every call to the harness function is stateless: the scripted agent
  responses and the budget script apply only to that one call and are not
  shared across calls. An author who wants to re-test the same script text
  with different scripted responses does so via a new, independent call —
  not by reusing state within a single call.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The harness MUST be able to run a workflow-script unmodified
  (no change to the script file) via a public function that accepts the
  script text and test options and returns the script's result.
- **FR-002**: The harness MUST expose the DSL primitives `agent()`,
  `pipeline()`, `parallel()`, `phase()`, `log()`, `args`, and `budget`
  inside the script under test, with behavior indistinguishable to the
  script from the real sandbox runtime.
- **FR-003**: The test setup MUST allow the response of an `agent()` call
  to be fixed in advance, per label and per call order.
- **FR-004**: The test setup MUST allow simulating a `null`/failed agent
  response for a specific call, so that the script under test can exercise
  its error-handling path.
- **FR-005**: When the script makes an `agent()` call for a label for
  which no (further) scripted response is available, the harness MUST
  signal this with a clear, diagnosable error instead of a silent or
  unclear outcome.
- **FR-006**: The harness MUST exhibit genuine concurrent execution for
  `parallel()` and for independent steps within `pipeline()`, verifiable
  from the test — not a sequential simulation that merely presents itself
  as concurrent.
- **FR-007**: The harness MUST guarantee ordering between dependent steps
  in `pipeline()`: a step only starts after the preceding step has produced
  its result.
- **FR-008**: The test setup MUST allow `budget.total` to be set to a
  fixed value, visible to the script under test.
- **FR-009**: The test setup MUST allow scripting an ordered sequence of
  values for `budget.spent()`, returned in that order on successive calls.
- **FR-010**: When the script under test calls a non-deterministic
  primitive that is forbidden in the real sandbox (including, but not
  limited to, wall-clock time and randomness), the harness MUST fail
  execution with an error message that names the specific forbidden call.
- **FR-011**: When the script under test calls a host capability that
  falls outside the DSL and outside the sandbox, the harness MUST fail
  execution with an error message that makes clear that call falls outside
  the allowed environment.
- **FR-012**: The harness MUST return an error thrown by the script itself
  (an ordinary programming bug in the script) distinguishably from an
  error the harness itself signals (e.g. forbidden call, missing scripted
  response) — the author must be able to tell from the error whether the
  script or the test setup is the cause.
- **FR-013**: When the script under test calls a function that is not
  part of the supported DSL primitives (`agent`, `pipeline`, `parallel`,
  `phase`, `log`, `args`, `budget`), the harness MUST signal this with a
  clear error naming the unknown function, instead of a silent
  `undefined` call or an incomprehensible crash (see User Story 1,
  acceptance scenario 3).

### Key Entities *(include if feature involves data)*

- **Workflow-script**: the code under test; a text source that uses the
  DSL primitives and is submitted to the harness unmodified.
- **Agent-response script**: an ordered, per-label sequence of
  pre-recorded responses (or a `null` marker for a failed response) that
  the harness assigns to successive `agent()` calls with that label.
- **Budget script**: a pre-recorded `total` value plus an ordered sequence
  of values for successive `spent()` calls.
- **Execution result**: what the harness returns after a script run
  completes — the script's return value on success, or a structured error
  (with a clear source: script vs. harness) on failure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A workflow-script that already runs in the real Workflow-tool
  sandbox requires no change whatsoever to also run under the harness, in
  100% of tested cases.
- **SC-002**: For each of the five core capabilities (running a script,
  scripting agent responses including failure, verifying concurrency,
  scripting budget, forbidden-call detection), an author can write a
  passing test without needing to read the harness's own source code —
  based solely on the public API and error messages.
- **SC-003**: A scripted `null` agent response leads to a test-observable
  error-handling path in the script in 100% of cases, never to a silent
  crash of the harness itself.
- **SC-004**: A test that expects concurrent execution within `parallel()`
  can demonstrate it based on observable overlap between tasks — not
  merely on the final ordering of results, which could also look
  sequential by coincidence.
- **SC-005**: Every error message the harness itself produces (forbidden
  call, missing scripted response, unknown DSL function) explicitly names
  what went wrong, so that an author can determine the cause without
  consulting the harness's source code.
