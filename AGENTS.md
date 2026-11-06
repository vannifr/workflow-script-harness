# workflow-script-harness — Agent Instructions

This project follows the Intent Integrity Kit (IIKit) spec-driven workflow.
Governance lives in `CONSTITUTION.md`, project context in `PREMISE.md`, and
the active feature spec in `specs/001-workflow-script-harness/spec.md`.

## Profiel

- Profiel: beheer (testharnas, Node.js)
- Tier C: de sandbox-fideliteit van de mock-runtime en de hash-locked `.feature`-bestanden: nooit direct wijzigen
- Deploy: geen
- Gevoeligheid: geen secrets; geen echte workflow-scripts met klantdata
- Check: `npm test`; CI `.woodpecker.yml` (vuln-scan, sonarqube, backlog-check)

## Non-negotiable constraints (from CONSTITUTION.md)

- **Test-First (NON-NEGOTIABLE)**: write a failing test before any
  production code; red-green-refactor.
- **Dependency Minimalism** (v2.0.0): use ONLY the language's built-in
  testing facilities — no third-party test framework — **except** `@cucumber/cucumber`, permitted solely to execute the hash-locked `.feature` files from `/iikit-04-testify`. Assertions still use `node:assert` even inside Cucumber step definitions.

  No other runtime dependency may be added unless strictly necessary, and any addition must be explicitly justified in the plan/design output before being introduced.
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

- Do not modify `.feature` files or hash-locked test specs directly.
- Do not bypass git hooks (`--no-verify`, `-n`, plumbing commands).

## CI dependency gate

- The `vuln-scan` step runs `trivy fs --severity CRITICAL,HIGH --ignore-unfixed --exit-code 1 --include-dev-deps` from a digest-pinned image and blocks the pipeline on a fixable finding. `--include-dev-deps` is required: the repo has only devDependencies, which trivy skips by default (then it scans nothing). `test/ci-pipeline.test.js` guards the step (exit code, `--ignore-unfixed`, no `|| true`, no `failure:`, digest pin).

## CI quality gate

- Only the `sonarqube` step skips docs-only pushes (`path.exclude: ['**/*.md', 'docs/**']` on its push/main `when`); every other step, including `test`, always runs on the events it already ran on (gate steps are never filtered), and `test/ci-pipeline-path-filters.test.js` guards this (no other step gets a `path`, no pipeline-level `path`, no `evaluate:`/`failure:`). The guard reads line structure, so it protects against accidental edits, not against deliberately crafted YAML quoting.
- The `sonarqube` step runs `./scripts/local-ci-checks.sh --strict sonarqube`. The wrapper keeps the scanner exit status in `sonar_rc`, runs `sh scripts/sonar-conditions.sh "$sonar_rc"` and returns that status, so a failed scan still fails the step. On a failed scan the script queries the SonarQube quality-gate status API and prints each failing condition (metric, comparator, threshold, actual value); the token goes to curl on stdin only and is never printed. `scripts/sonar-conditions.sh` is byte-identical to the shared reference (`~/projects/ci-hardening/handover/sonar-conditions.sh`, check with `cmp`) and lies outside `sonar.sources`, so it is not part of the Sonar coverage. `test/sonar-conditions.test.js` guards it with a stub `curl` and a stub `sonar-scanner` on `PATH`.

## Backlog

- Open work: `BACKLOG.md` only, convention `~/projects/backlog-system/docs/convention.md`; an item with a deadline or blocker also gets `task: TASK-<n>`.
- Validate: `python3 -I scripts/backlog-check/src/check_backlogs.py --file BACKLOG.md --name workflow-script-harness`; vendored copy, update with `sh ~/projects/backlog-system/scripts/vendor-validator.sh .`. CI runs the same check in the step `backlog-check`.

## Privacy

- Never add the owner's full name to files without an explicit check; exceptions: LICENSE/copyright and the byline of a public speaker on their own material. Search the repo for the name before making anything public.

## Agent working rules

- Global working rules: `~/.claude/CLAUDE.md`; do not copy them here.
- Repo conventions are checked by `~/projects/agent-config/tools/docs-check/check_repo_docs.py`; keep this file under 120 lines.

## Learned rules
- In Cucumber step definitions escape literal ( ) as \( \) and / as \/ (unescaped () is a parse error, (text) becomes optional); tags go on their own line; steps are global across files. Verify generated features with cucumber-js --dry-run.
