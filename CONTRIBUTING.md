# Contributing

Thanks for considering a contribution. This is a small, personally
maintained project — there's no formal support commitment, but bug reports
and small, focused pull requests are genuinely welcome.

## Who can merge changes

Only the maintainer ([@vannifr](https://github.com/vannifr)) has write
access to this repository. Everyone else contributes through the standard
GitHub fork-and-pull-request flow described below — there is no other way
to get a change merged.

## How to propose a change

1. **Fork** the repository to your own GitHub account.
2. **Clone** your fork and create a branch for your change:
   ```bash
   git clone https://github.com/<you>/workflow-script-harness.git
   cd workflow-script-harness
   git checkout -b my-change
   npm install
   ```
3. **Make your change with tests.** This project follows spec-driven
   development and mandatory TDD (see `CONSTITUTION.md`) — a bug fix or
   feature without a test won't be merged. For anything beyond a trivial
   fix, a short description of the change and why it's needed in the PR
   description makes review much faster than a large, unexplained diff.
4. **Run the full local gate before opening a PR**:
   ```bash
   npm test          # unit tests + BDD scenarios
   ```
   (Git hooks installed via `npm install` run this automatically on
   commit/push in your own clone.)
5. **Open a pull request** against `main`. Push it as a draft first if
   you'd like early feedback before it's finished.

## What happens to your PR

CI runs automatically on every pull request: secret scanning (gitleaks),
an `.env`-leak guard, and the full test suite (unit tests + BDD scenarios).
All of that must pass before a PR can be merged.

One step does **not** run on pull requests: the SonarQube quality-gate
check. That step needs credentials for this project's private,
self-hosted SonarQube instance, and a fork's PR pipeline must never be
handed those credentials — so it only runs on pushes to `main`, after a PR
has already been merged. If you want a SonarQube-equivalent read before
that point, run `ruff`-style static analysis locally, or just ask in the
PR — the maintainer runs this check locally before merging anything
non-trivial.

## Code style

- No comments unless they explain a non-obvious *why* (a workaround, a
  hidden constraint) — not what the code already says by being
  well-named.
- Match the existing test style (`node:test` + `node:assert`, no other
  test framework — see `CONSTITUTION.md`'s dependency-minimalism
  principle).

## Reporting a bug without a fix

Open a [GitHub Issue](https://github.com/vannifr/workflow-script-harness/issues)
with: what you expected, what happened instead, and a minimal
workflow-script that reproduces it if at all possible.
