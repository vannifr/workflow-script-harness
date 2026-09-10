# workflow-script-harness Premise

## What

A generic, reusable test harness for scripts written against Claude Code's
Workflow-tool DSL (`agent()`, `pipeline()`, `parallel()`, `phase()`, `log()`,
`args`, `budget`). The harness reproduces the Workflow tool's sandbox
runtime via Node's `vm` module, so a workflow-script can be run and tested
unmodified — with no change to the script file itself — outside Claude Code,
under `node:test`.

## Who

Authors of Workflow-tool scripts (humans and agents) who want to write,
verify, and regression-test such scripts before running them in a real
Claude Code session. First concrete consumer: the `content-os` project,
which tests `.claude/workflows/session-design-method.js` via this harness
as a devDependency.

## Why

Workflow-tool scripts run in a sandbox with no Node APIs and no
`Date.now()`/`Math.random()`/`new Date()`, and orchestrate concurrency via
`agent()`/`pipeline()`/`parallel()`. There is no way to test such a script
locally, deterministically, and quickly without starting a real Claude Code
session — today every change has to be validated manually in production.
That's slow, not reproducible, and makes TDD on workflow-scripts impossible.
This harness solves that with a `node:test`-usable mock of the runtime.

## Domain

Test infrastructure / developer tooling for Claude Code's Workflow-tool DSL.
Core concepts: **workflow-script** (the code under test, unmodified),
**sandbox runtime** (the Node `vm` context with no Node APIs),
**agent() response** (a scripted response per label/call order, including a
null simulation for a failed agent call), **budget**
(`budget.total`/`budget.spent()`, scriptable per test), **concurrency
semantics** of `parallel()`/`pipeline()` (genuine concurrency, not merely
simulated sequentially).

## Scope

**In scope:** the public API `runWorkflowScript(scriptText, {agentResponses,
args, budget})` in `src/harness.js`, its accompanying tests in
`test/harness.test.js`, and the BDD `.feature` files that capture the
harness's own behavior (not that of individual workflow-scripts).

**Out of scope:** running workflow-scripts against a real Claude Code
session or real agents; building new Workflow-tool DSL functions; support
for sandbox-like DSLs other than the Workflow tool.
