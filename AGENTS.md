# workflow-script-harness — Agent Instructions

This project follows the Intent Integrity Kit (IIKit) spec-driven workflow.
Governance lives in `CONSTITUTION.md`, project context in `PREMISE.md`, and
the active feature spec in `specs/001-workflow-script-harness/spec.md`.

## Non-negotiable constraints (from CONSTITUTION.md)

- **Test-First (NON-NEGOTIABLE)**: write a failing test before any
  production code; red-green-refactor.
- **Dependency Minimalism** (v2.0.0): use ONLY the language's built-in
  testing facilities — no third-party test framework — **except**
  `@cucumber/cucumber`, permitted solely to execute the hash-locked
  `.feature` files from `/iikit-04-testify`. Assertions still use
  `node:assert` even inside Cucumber step definitions. No other runtime
  dependency may be added unless strictly necessary, and any addition must
  be explicitly justified in the plan/design output before being
  introduced.
- **Faithful Sandbox Fidelity**: the mock runtime must actively block what
  the real sandbox denies (host access, non-deterministic primitives) — not
  merely omit them.
- **Script Compatibility, Never Script Adaptation**: a workflow-script under
  test must run unmodified. Never require changes to the script being
  tested to make it runnable.
- **Deterministic, Genuinely Concurrent Verification**: tests must be
  deterministic and reproducible; where the DSL expresses concurrency
  (`parallel()`, independent `pipeline()` steps), verification must exercise
  real concurrent execution — sequential simulation is not acceptable.

## Tech stack (once decided in plan.md)

- Language/runtime: Node.js (built-in `vm` module for sandboxing).
- Test tooling: `node:test` + `node:assert` only.
- No npm packages unless explicitly justified in `plan.md`.

## Do not

- Do not commit or push. Report your changes; the orchestrator reviews,
  commits, and pushes.
- Do not modify `.feature` files or hash-locked test specs directly.
- Do not bypass git hooks (`--no-verify`, `-n`, plumbing commands).

## Backlog

- Open work lives in one file: `BACKLOG.md` in the repo root. There is no other backlog; plans, status and goal documents are not backlogs.
- Convention: `~/projects/backlog-system/docs/convention.md` (five fixed sections: Nu, Volgende, Geblokkeerd, Gepland, Later; an empty section shows `Geen.`; one line per item: `- [ ] **Title** (F, C or F+C · deadline: YYYY-MM-DD · context: brainstorm|content|dev|publicatie) — one sentence; source.`).
- Finished work is removed from the file (history is in git). Work that is not in progress does not go under Nu.
- An item with a deadline or a blocker also gets a task in the portfolio instance (`~/projects/portfolio`, skill `backlog-next`) and a link in the item: `task: TASK-<n>` inside the parentheses. The validator warns when the two differ.
- Change the backlog in the same commit as the work it describes.
- Validate: `python3 -I scripts/backlog-check/src/check_backlogs.py --file BACKLOG.md --name workflow-script-harness`. The validator is a vendored copy (`scripts/backlog-check/`); update it with `sh ~/projects/backlog-system/scripts/vendor-validator.sh .`. CI runs the same check in the step `backlog-check`.
- What to do when something is unclear or the backlog file is missing: `~/projects/backlog-system/docs/rollout.md`.

## Privacy — full name in content

- Never add the full name "Frederik Vannieuwenhuyse" to files in this repo (code, docs, configs, UI copy, generated content) without an explicit check.
- Two cases don't need confirmation: LICENSE/copyright attribution, and content where the name is the byline/attribution of a public speaker or author on his own material (e.g. a speaker bio, a personal site's own content).
- Any other case — and always before making this repo public — requires searching the repo for the name and getting explicit confirmation before adding or keeping it.
- Commit author identity is a separate concern (see the git identity rule) and is not covered by this rule.
