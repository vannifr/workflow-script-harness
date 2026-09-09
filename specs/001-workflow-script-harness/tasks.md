# Implementation Tasks: Workflow-Script Test Harness

**Input**: Design documents from `specs/001-workflow-script-harness/`
**Prerequisites**: plan.md, spec.md (FR-001..FR-013), research.md,
data-model.md, contracts/, and the hash-locked BDD scenarios in
`tests/features/` (do NOT regenerate these — re-run `/iikit-04-testify`
only if requirements change).

**Tests**: TDD is mandatory (CONSTITUTION.md Principle I) — every task
pair below is (write failing `node:test` unit test) → (implement to make
it pass). The BDD scenarios are a second, independent acceptance layer on
top of the unit tests, not a replacement for them.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: can run in parallel (different files, no dependencies) — used
  sparingly here: this project has exactly two source files
  (`src/harness.js`, `test/harness.test.js`), so almost every task
  touches one of the same two files sequentially.
- **[Story]**: `[USn]` for user-story tasks only (not Setup/Foundational/Polish)
- **Traceability**: `TS-XXX`/`FR-XXX` references are embedded in each
  description, using explicit comma-separated lists, never prose ranges.

## TS-ID → FR mapping (from the hash-locked `.feature` files — fixed)

| TS-ID | FR | User Story |
|---|---|---|
| TS-001 | FR-001, FR-002 | US1 |
| TS-002 | FR-001 | US1 |
| TS-003 | FR-013 | US1 |
| TS-004 | FR-003 | US2 |
| TS-005 | FR-004 | US2 |
| TS-006 | FR-005 | US2 |
| TS-007 | FR-006 | US3 |
| TS-008 | FR-007 | US3 |
| TS-009 | FR-006, FR-007 | US3 |
| TS-010 | FR-008 | US4 |
| TS-011 | FR-009 | US4 |
| TS-012 | FR-010 | US5 |
| TS-013 | FR-010 | US5 |
| TS-014 | FR-011 | US5 |

FR-012 (harness-error vs. script-error classification) is cross-cutting —
it has no single TS-ID; it is exercised implicitly across all five
BDD user-story runs and gets one dedicated task in Polish.

---

## Phase 1: Setup

- [ ] T001 [P] Create `src/harness.js` as an empty module exporting a
  `runWorkflowScript` stub that throws "not implemented"
- [ ] T002 [P] Create `test/harness.test.js` as an empty `node:test` file
  (a single `test('placeholder', () => {})` so `node --test test/` runs
  clean)

---

## Phase 2: Foundational (blocks all user stories)

**Purpose**: the shared sandbox-execution mechanism every user story's
`agent()`/`budget`/error behavior builds on top of. No user-story-specific
mocking (agent responses, budget values) lives here — that belongs to the
Phase 3+ story that needs it.

- [ ] T003 Write `node:test` unit test in `test/harness.test.js`: a
  minimal script (no `agent()`/`budget` calls, just `export default 42`)
  runs via `runWorkflowScript()` and returns `{status:'success', value:42}`
  (must fail — `runWorkflowScript` is still a stub)
- [ ] T004 Implement the sandbox context (`vm.createContext()`) and the
  export-capture + async-IIFE script wrapper (per research.md Challenge
  1/2) in `src/harness.js`, enough to make T003 pass
- [ ] T005 Write `node:test` unit test: accessing any global not in the
  DSL allowlist (e.g. `console`) throws a `HarnessError` with code
  `UNKNOWN_GLOBAL` (must fail)
- [ ] T006 Implement the Proxy-based global allowlist (per research.md
  Challenge 4) in `src/harness.js`, enough to make T005 pass — this is
  the shared mechanism FR-010/FR-011 both build on later (T017, T019)
- [ ] T007 Write `node:test` unit test: `options.args` is exposed
  unmodified as the `args` global inside the script (must fail)
- [ ] T008 Implement `args` injection into the sandbox context in
  `src/harness.js`, enough to make T007 pass

**Checkpoint**: `runWorkflowScript()` can run a script with no DSL calls
and exposes `args`; user story implementation can now begin.

---

## Phase 3: User Story 1 - Run a workflow-script unmodified (P1) — MVP

**Goal**: FR-001/FR-002/FR-013 — an unmodified script with one `agent()`
call runs to completion, and an unsupported DSL function produces a named
error.

**Independent Test**: `npx cucumber-js --tags "@US-001"` passes once this
phase is done.

- [ ] T009 [US1] Write `node:test` unit test: a script calling
  `agent('...', {label:'x'})` with a scripted response for label `x`
  returns that response as the script's exported value (TS-001; must fail)
- [ ] T010 [US1] Implement the `agent()` DSL primitive (single scripted
  response, no exhaustion/null handling yet) in `src/harness.js`, enough
  to make T009 pass
- [ ] T011 [US1] Write `node:test` unit test: the exact same script text
  object (`this.script`) produces a non-error result across two separate
  `runWorkflowScript()` calls with equivalent options — i.e. nothing
  about the script itself needs to change (TS-002; must fail if T010 has
  any script-mutation side effect)
- [ ] T012 [US1] Audit `src/harness.js` to confirm the script text is
  never mutated in place (only a local copy is transformed for
  execution) and fix if T011 fails
- [ ] T013 [US1] Write `node:test` unit test: calling a function not in
  the DSL allowlist (e.g. `unsupportedFunction()`) produces a
  `HarnessError` naming the function (TS-003, FR-013; must fail)
- [ ] T014 [US1] Implement unknown-DSL-function detection (distinct from
  the forbidden-primitive path in T006) in `src/harness.js`, enough to
  make T013 pass
- [ ] T015 [US1] Run `npx cucumber-js --tags "@US-001"` (covers
  [TS-001, TS-002, TS-003]) and fix any gap the unit tests above missed

**Checkpoint**: User Story 1 fully functional and independently testable.

---

## Phase 4: User Story 2 - Script agent() responses, incl. failure (P2)

**Independent Test**: `npx cucumber-js --tags "@US-002"` passes once this
phase is done.

- [ ] T016 [US2] Write `node:test` unit test: two `agent()` calls with the
  same label consume scripted responses in order (`[A, B]` → first call
  gets `A`, second gets `B`) (TS-004, FR-003; must fail)
- [ ] T017 [US2] Extend the `agent()` mock in `src/harness.js` to consume
  an ordered response list per label, enough to make T016 pass
- [ ] T018 [US2] Write `node:test` unit test: a scripted `{type:'null'}`
  response resolves the `agent()` call to `null` rather than throwing
  (TS-005, FR-004; must fail)
- [ ] T019 [US2] Implement null-response simulation in the `agent()` mock
  in `src/harness.js`, enough to make T018 pass
- [ ] T020 [US2] Write `node:test` unit test: calling `agent()` with a
  label more times than it has scripted responses throws a `HarnessError`
  with code `EXHAUSTED_AGENT_RESPONSES` naming the label (TS-006, FR-005;
  must fail)
- [ ] T021 [US2] Implement response-exhaustion detection in the `agent()`
  mock in `src/harness.js`, enough to make T020 pass
- [ ] T022 [US2] Run `npx cucumber-js --tags "@US-002"` (covers
  [TS-004, TS-005, TS-006]) and fix any gap the unit tests above missed

**Checkpoint**: User Story 2 fully functional and independently testable.

---

## Phase 5: User Story 3 - Verify genuine concurrency (P3)

**Independent Test**: `npx cucumber-js --tags "@US-003"` passes once this
phase is done.

- [ ] T023 [US3] Write `node:test` unit test: `parallel()` over 3 thunks
  produces an execution trace showing at least two entries with
  overlapping `startCounter`/`endCounter` ranges (TS-007, FR-006; must
  fail — no trace exists yet)
- [ ] T024 [US3] Implement the counter-based execution trace (per
  research.md Challenge 3) and `parallel()` using real concurrent
  execution (`Promise.all`, not a sequential loop) in `src/harness.js`,
  enough to make T023 pass
- [ ] T025 [US3] Write `node:test` unit test: `pipeline()` over 2+ items
  with 2 async stages preserves per-item stage ordering (stage 2 for item
  N never starts before stage 1 for item N completes) while still
  allowing items to overlap across stages (TS-008, FR-007; must fail)
- [ ] T026 [US3] Implement `pipeline()` with per-item stage chains (per
  research.md Challenge 5) in `src/harness.js`, enough to make T025 pass
- [ ] T027 [US3] Write `node:test` unit test: a failing thunk inside
  `parallel()` produces a documented failure shape (`ParallelError` with
  completed/failed/pending, per research.md Challenge 6) (TS-009,
  FR-006+FR-007; must fail)
- [ ] T028 [US3] Implement fail-fast `ParallelError` handling in
  `parallel()` in `src/harness.js`, enough to make T027 pass
- [ ] T029 [US3] Run `npx cucumber-js --tags "@US-003"` (covers
  [TS-007, TS-008, TS-009]) and fix any gap the unit tests above missed

**Checkpoint**: User Story 3 fully functional and independently testable.

---

## Phase 6: User Story 4 - Script budget (P4)

**Independent Test**: `npx cucumber-js --tags "@US-004"` passes once this
phase is done.

- [ ] T030 [US4] Write `node:test` unit test: `options.budget.total` is
  exposed unmodified as `budget.total` inside the script (TS-010, FR-008;
  must fail)
- [ ] T031 [US4] Implement `budget.total` injection in `src/harness.js`,
  enough to make T030 pass
- [ ] T032 [US4] Write `node:test` unit test: successive `budget.spent()`
  calls consume `options.budget.spentSequence` in order, and an
  over-exhausted call throws a `HarnessError` with code
  `EXHAUSTED_BUDGET_SPENT` (TS-011, FR-009; must fail)
- [ ] T033 [US4] Implement `budget.spent()` sequence consumption in
  `src/harness.js`, enough to make T032 pass
- [ ] T034 [US4] Run `npx cucumber-js --tags "@US-004"` (covers
  [TS-010, TS-011]) and fix any gap the unit tests above missed

**Checkpoint**: User Story 4 fully functional and independently testable.

---

## Phase 7: User Story 5 - Clear errors for forbidden calls (P5)

**Independent Test**: `npx cucumber-js --tags "@US-005"` passes once this
phase is done.

- [ ] T035 [US5] Write `node:test` unit test: calling `Date.now()` inside
  the script throws a `HarnessError` with code `FORBIDDEN_PRIMITIVE`
  naming `Date` (TS-012, FR-010; must fail against the Phase 2 allowlist,
  which currently treats unlisted globals as `UNKNOWN_GLOBAL`, not
  `FORBIDDEN_PRIMITIVE`)
- [ ] T036 [US5] Extend the Proxy allowlist from T006 to distinguish
  explicitly-forbidden globals (`Date`, `Math`, `require`, etc. — see
  contracts/error-types.md) from merely-unknown ones, in `src/harness.js`,
  enough to make T035 pass
- [ ] T037 [US5] Write `node:test` unit test: `Math.random()` and
  `new Date()` both fail the same recognizable way as T035 (TS-013,
  FR-010; must fail until covered by T036's list)
- [ ] T038 [US5] Add `Math` and the `Date` constructor to the forbidden
  list from T036 in `src/harness.js`, enough to make T037 pass
- [ ] T039 [US5] Write `node:test` unit test: calling `require('fs')`
  inside the script throws an error naming the call as outside the
  sandbox (TS-014, FR-011; must fail)
- [ ] T040 [US5] Add `require`/`module`/`process`/other Node builtins to
  the forbidden list from T036, with a sandbox-boundary-specific message,
  in `src/harness.js`, enough to make T039 pass
- [ ] T041 [US5] Run `npx cucumber-js --tags "@US-005"` (covers
  [TS-012, TS-013, TS-014]) and fix any gap the unit tests above missed

**Checkpoint**: User Story 5 fully functional and independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T042 Write `node:test` unit test: a plain programmer error thrown
  by the script itself (not a `HarnessError`) is returned as a
  `ScriptError` distinguishable by `name`, per FR-012
- [ ] T043 Implement the `HarnessError`/`ScriptError` classification
  wrapper (FR-012) in `src/harness.js`, enough to make T042 pass —
  cross-cutting: re-run T015/T022/T029/T034/T041's BDD tag commands
  afterward to confirm no regression
- [ ] T044 [P] Walk through every scenario in `quickstart.md` manually
  against the finished `src/harness.js` and fix any discrepancy between
  the documented behavior and the implementation
- [ ] T045 Add a `"test"` script to `package.json` running both
  `node --test test/` and `cucumber-js` as one command, and confirm it
  exits non-zero on any failure (already scaffolded in T001/T002's setup;
  verify it still matches after all phases)
- [ ] T046 Run the full suite (`npm test`) once, from a clean
  `node_modules` install, as the final gate before considering the
  feature complete

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001-T002)**: no dependencies, can start immediately; T001 and
  T002 are the only genuinely parallel pair in this project (different,
  still-empty files)
- **Foundational (T003-T008)**: depends on Setup; BLOCKS all user stories
  — every story's `agent()`/`budget`/error work sits on top of the
  sandbox context, export-capture, and allowlist built here
- **User Story 1 (T009-T015)**: depends on Foundational only — this is
  the MVP slice
- **User Story 2 (T016-T022)**: depends on Foundational + the `agent()`
  skeleton from US1 (T010) — NOT independent of US1 at the code level,
  even though it is independently *testable* once US1 exists
- **User Story 3 (T023-T029)**: depends on Foundational only (does not
  need `agent()`'s response-scripting logic from US2, only the trace
  infrastructure) — can start as soon as Foundational is done, in
  parallel with US2 if capacity allows
- **User Story 4 (T030-T034)**: depends on Foundational only — independent
  of US1/US2/US3, can run in parallel with either
- **User Story 5 (T035-T041)**: depends on Foundational's allowlist (T006)
  only — independent of US1-US4, can run in parallel with any of them
- **Polish (T042-T046)**: depends on all five user stories being complete

### Parallel opportunities

- T001 / T002 (Setup)
- Once Foundational (T003-T008) is done: US3, US4, and US5 can proceed in
  parallel with each other (and with US2, once US1's T010 lands) — but
  within each story the write-test/implement pairs are still sequential
  because they all edit the same two files
- T044 (quickstart walkthrough) can run in parallel with T045/T046 setup

### No circular dependencies found

US2 depends on US1 (T010) at the code level; no story depends back on a
later-priority story. FR-012 (Polish) depends on all stories but nothing
depends on FR-012, so it correctly sits last.

---

## Notes

- [P] tasks = different files, no dependencies — used only for T001/T002
  and T044 in this project; nearly everything else edits
  `src/harness.js` and/or `test/harness.test.js` sequentially.
- Every implementation task must be preceded by its paired failing test —
  do not implement ahead of its test, per CONSTITUTION.md Principle I.
- The BDD "run cucumber-js" tasks (T015, T022, T029, T034, T041) are a
  second, coarser acceptance check on top of the unit tests — not a
  substitute for them, and not a step that regenerates `.feature` files.
