# workflow-script-harness

[![npm version](https://img.shields.io/npm/v/workflow-script-harness.svg)](https://www.npmjs.com/package/workflow-script-harness)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

A test harness for scripts written against Claude Code's **Dynamic Workflows** feature — the `Workflow` tool's DSL (`agent()`, `pipeline()`, `parallel()`, `phase()`, `log()`, `args`, `budget`).

- It reproduces that sandbox in Node's built-in `vm` module, so a workflow-script can be tested under `node:test` — unmodified, with no real Claude Code session, no real agents, and no network — while still exercising genuine concurrency and the same forbidden-primitive restrictions the real sandbox enforces.

**Sandbox semantics last verified against Claude Code's Workflow tool as of 2026-09-09** (Node.js 18+).

Anthropic can change the runtime's allowed globals or concurrency behavior at any time — if something here silently stops matching reality, please [open an issue](https://github.com/vannifr/workflow-script-harness/issues) with the Claude Code version you're on; see `CONSTITUTION.md` for how to re-verify.

## Install

```bash
npm install workflow-script-harness
```

Requires **Node.js 18+**. To work on the harness itself, see [development setup](docs/development.md).
Background and FAQ: [docs/background.md](docs/background.md).

## Usage

### Minimal example


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

## Contributing

Bug reports and small, focused pull requests are welcome — see
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the fork/branch/PR process, what
CI checks a pull request runs, and code-style expectations.
Instructions for AI coding agents working on this repo are in [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE) — see the `LICENSE` file for the full text.

Open work: `BACKLOG.md`.
