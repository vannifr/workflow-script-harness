# Development setup

How to work on the harness itself, and what the repository contains.

## Local development setup

Cloning this repo to work on the harness itself (not needed just to consume
it — see [Install](../README.md#install) for that):

```bash
npm install
```

This installs exactly one dependency: `@cucumber/cucumber`, used solely to
execute this project's own BDD acceptance scenarios (see
`CONSTITUTION.md`). `src/harness.js` itself has zero dependencies — only
Node's built-in `vm` module.

Requires **Node.js 18+** (the floor is `node:test`'s availability, not
anything the sandbox itself needs).

## Development

```bash
npm test          # everything: unit tests + BDD scenarios
npm run test:unit # node:test only
npm run test:bdd  # BDD scenarios only (npx cucumber-js)
```

- Git hooks (`pre-commit`/`pre-push`) install automatically on `npm install` and run the same checks CI does — see `CONSTITUTION.md` for the project's governing principles (TDD is mandatory) and `specs/001-workflow-script-harness/` for the full spec-driven history of this feature (constitution → spec → plan → tasks → implementation, all independently reviewed and verified at each step, not just generated).

## Repository layout

To just **use** the harness, you only need `src/harness.js` (via npm) and
this README. Everything else here is process documentation for
maintainers and contributors, kept public for transparency rather than
because a consumer needs to read it:

| Path | What it's for |
|---|---|
| `src/harness.js` | The entire implementation. Single file, zero runtime dependencies. |
| `CONSTITUTION.md`, `PREMISE.md` | This project's governing principles and scope (spec-driven development, mandatory TDD). |
| `specs/001-workflow-script-harness/` | The full spec → plan → tasks → implementation trail, plus the BDD `.feature` files — evidence for the claims in this README, not required reading. |
| `AGENTS.md`, `CLAUDE.md` | Instructions for AI coding agents working on *this* repo's own codebase — irrelevant if you're only consuming the package. |
| `CONTRIBUTING.md` | The PR process, if you want to contribute a fix. |
