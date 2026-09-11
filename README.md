# workflow-script-harness

[![npm version](https://img.shields.io/npm/v/workflow-script-harness.svg)](https://www.npmjs.com/package/workflow-script-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

A test harness for scripts written against Claude Code's **Dynamic
Workflows** feature — the `Workflow` tool's DSL (`agent()`, `pipeline()`,
`parallel()`, `phase()`, `log()`, `args`, `budget`). It reproduces that
sandbox in Node's built-in `vm` module, so a workflow-script can be tested
under `node:test` — unmodified, with no real Claude Code session, no real
agents, and no network — while still exercising genuine concurrency and the
same forbidden-primitive restrictions the real sandbox enforces.

**Sandbox semantics last verified against Claude Code's Workflow tool as of
2026-09-09** (Node.js 18+). Anthropic can change the runtime's allowed
globals or concurrency behavior at any time — if something here silently
stops matching reality, please [open an
issue](https://github.com/vannifr/workflow-script-harness/issues) with the
Claude Code version you're on; see `CONSTITUTION.md` for how to re-verify.

## Quickstart

```bash
npm install workflow-script-harness
```

```js
const { runWorkflowScript } = require('workflow-script-harness');

const script = `
  export const meta = { name: 'review', phases: [] };
  const result = await agent('Review this file', { label: 'reviewer' });
  export default result;
`;

const result = await runWorkflowScript(script, {
  agentResponses: { reviewer: [{ findings: [], approved: true }] }
});

result.value; // { findings: [], approved: true }
```

## In plain terms

A "workflow-script" is a small program that orchestrates several AI
sub-agents to do a multi-step task — for example, one script might review
a piece of writing in several passes: check the argument, check the
audience fit, check the tone, then combine those into a final verdict.
Writing that script is easy to get subtly wrong: does it call the right
number of sub-agents? Does it handle one of them failing or returning
nothing? Does it actually run steps at the same time when it's supposed
to, instead of secretly doing them one by one?

Today, the only way to check any of that is to actually run the script
for real — spend real money and real time calling real AI agents, every
single time you want to check a small change. That's slow, it costs
money for every test, and it's hard to deliberately test the "what if an
agent fails" case on purpose.

This harness lets you run that same script script **exactly as written**,
but swap the real AI agents for scripted, instant, free stand-ins you
control: "when the script asks agent X, pretend it answered with this,"
or "pretend this one failed." You get the answer back in milliseconds,
for free, and you can deliberately test the failure cases that are hard
to trigger on demand with the real thing. It also double-checks that the
script actually behaves the way the real system would — for instance,
that steps which are supposed to run at the same time genuinely do, and
that the script never tries to do something it isn't allowed to do (like
reading the real system clock).

In short: it's a flight simulator for these AI-orchestrating scripts —
same instruments, same behavior, no real flight required to practice on.

## What this gives you

- **Script-blind testing.** You hand `runWorkflowScript()` the exact text
  of a workflow-script (read from a file, or inlined) and it runs
  unmodified — no wrapper, no adapter, no rewriting.
- **Scriptable `agent()` responses**, per label, in call order — including
  a `{type: 'null'}` response to simulate a failed/empty agent call, and a
  clear error when a label's responses run out.
- **Real concurrency, not a simulation.** `parallel()` genuinely runs its
  tasks concurrently (`Promise.all`, not a sequential loop); `pipeline()`
  lets independent items overlap across stages while still enforcing that
  a given item's stage 2 never starts before its own stage 1 finished. A
  counter-based execution trace (`result.trace`) lets a test prove this
  overlap actually happened, deterministically (no wall-clock flakiness).
- **Scriptable `budget`** (`budget.total`, an ordered `budget.spent()`
  sequence), so budget-aware branches in a script are testable too.
- **The same sandbox restrictions the real tool enforces**: `Date`,
  `Math`, `require`, `process`, and other host/non-deterministic
  primitives are actively blocked (not just silently absent) with a named
  `FORBIDDEN_PRIMITIVE` error; any other undeclared global throws
  `UNKNOWN_GLOBAL`.
- **Errors you can tell apart.** A `HarnessError` (test/config problem —
  fix the test) is always distinguishable by `.name` from a `ScriptError`
  (the script's own bug — fix the script), including plain bugs like a
  `TypeError` from a bad property access.

See `specs/001-workflow-script-harness/` for the full spec, the design
decisions and their rationale (`plan.md`/`research.md`), the API contract
(`contracts/`), and the BDD acceptance scenarios (`tests/features/`) that
back every claim above.

## Local development setup

Cloning this repo to work on the harness itself (not needed just to consume
it — see [Quickstart](#quickstart) for that):

```bash
npm install
```

This installs exactly one dependency: `@cucumber/cucumber`, used solely to
execute this project's own BDD acceptance scenarios (see
`CONSTITUTION.md`). `src/harness.js` itself has zero dependencies — only
Node's built-in `vm` module.

Requires **Node.js 18+** (the floor is `node:test`'s availability, not
anything the sandbox itself needs).

## Usage

```js
// Alternative to the npm package: a git dependency
// ("workflow-script-harness": "github:vannifr/workflow-script-harness" in
// package.json) or a local path.
const { runWorkflowScript } = require('workflow-script-harness');

const script = `
  export const meta = { name: 'review', phases: [] };
  const result = await agent('Review this file', { label: 'reviewer' });
  export default result;
`;

const result = await runWorkflowScript(script, {
  args: { filePath: '/src/index.js' },
  agentResponses: {
    reviewer: [{ findings: [], approved: true }]
  }
});

result.status;          // 'success'
result.value;            // { findings: [], approved: true }
result.trace.entries;    // execution trace (see below)
```

### `runWorkflowScript(scriptText, options)`

| `options` field | Purpose |
|---|---|
| `args` | Exposed unmodified as the `args` global inside the script. |
| `agentResponses` | `{ [label]: value \| value[] }`. A single value is returned for every call with that label; an array is consumed in order, one response per call. `{ type: 'null' }` resolves to `null` (simulated failure). |
| `budget` | `{ total, spentSequence: number[] }`. `budget.total` reads back `total`; each `budget.spent()` call consumes the next `spentSequence` entry, in order. |

Returns `Promise<{ status: 'success', value, trace } | { status: 'error', error, trace }>`.

On success, `value` is whatever the script `export default`s. On failure,
`error` is either:
- a **`HarnessError`** (`.code` one of `UNKNOWN_GLOBAL`, `FORBIDDEN_PRIMITIVE`,
  `MISSING_AGENT_RESPONSE`, `EXHAUSTED_AGENT_RESPONSES`,
  `EXHAUSTED_BUDGET_SPENT`) — a problem with the test/config, not the script; or
- a **`ScriptError`** (`.originalError` holds the real underlying error,
  e.g. a `TypeError`, or a `ParallelError` from a failed `parallel()` task)
  — a bug in the script itself.

`trace.entries` is an array of `{ id, type, label, startCounter, endCounter }`
— monotonic counters, not timestamps, so overlap can be checked
deterministically: two entries genuinely overlapped if
`a.startCounter < b.endCounter && b.startCounter < a.endCounter`.

**Full worked examples** (one per user story, plus a combined multi-feature
script): `specs/001-workflow-script-harness/quickstart.md` — each one is
validated to run correctly against the current implementation, not just
described.

## Why not a generic JS sandbox?

`isolated-vm`, QuickJS-via-WASM, and (deprecated, CVE-carrying) `vm2` solve
a different problem: safely running *untrusted* code in production. This
harness isn't a security boundary and doesn't try to be one — Node's `vm`
module is explicitly not hardened against a malicious script, which is
fine here because the script under test is **yours**, running locally in a
test process you already trust. What it needs to get right instead is
*behavioral accuracy*: the same allowed/forbidden globals, the same
`agent()`/`parallel()`/`pipeline()` semantics, and genuine (not simulated)
concurrency, so a green test actually predicts what happens in the real
Workflow tool. That's a narrower, different goal than sandboxing untrusted
code, which is why a general-purpose sandbox library doesn't replace this.

## FAQ

**Does this run inside Claude Code?** No — it's a standalone Node package
you run with `node:test`, completely outside any Claude Code session.

**Does this replace testing against real agents?** No. It replaces the
*repeated, per-change* real-agent runs you'd otherwise need during
development — validate orchestration logic, error handling, and
concurrency here for free and instantly, then do a final real run before
you trust a script in production.

**What if Anthropic changes the Workflow tool's sandbox?** The forbidden-
primitives list and concurrency semantics here are a point-in-time
snapshot (see the verification date at the top of this README). If
they drift from reality, please open an issue — see `CONSTITUTION.md` for
how this project re-verifies against the real runtime.

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

## Development

```bash
npm test          # everything: unit tests + BDD scenarios
npm run test:unit # node:test only
npm run test:bdd  # BDD scenarios only (npx cucumber-js)
```

Git hooks (`pre-commit`/`pre-push`) install automatically on `npm install`
and run the same checks CI does — see `CONSTITUTION.md` for the project's
governing principles (TDD is mandatory) and
`specs/001-workflow-script-harness/` for the full spec-driven history of
this feature (constitution → spec → plan → tasks → implementation, all
independently reviewed and verified at each step, not just generated).

## Status

A small, focused tool, built and used for testing my own Workflow-tool
scripts — not an official Anthropic project. It has no dependencies beyond
Node's built-in `vm` module, a small test surface, and a spec-driven
history (see above) if you want to check a design decision before relying
on it. Issues and pull requests are welcome; there's no formal support
commitment beyond that.

## Contributing

Bug reports and small, focused pull requests are welcome — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the fork/branch/PR process, what
CI checks a pull request runs, and code-style expectations.

## License

[MIT](LICENSE) — see the `LICENSE` file for the full text.
