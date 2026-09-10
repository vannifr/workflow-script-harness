# workflow-script-harness

A test harness for scripts written against Claude Code's **Workflow tool**
DSL (`agent()`, `pipeline()`, `parallel()`, `phase()`, `log()`, `args`,
`budget`). It reproduces that sandbox in Node's built-in `vm` module, so a
workflow-script can be tested under `node:test` — unmodified, with no real
Claude Code session, no real agents, and no network — while still exercising
genuine concurrency and the same forbidden-primitive restrictions the real
sandbox enforces.

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

## Install

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
// As a git dependency (e.g. "workflow-script-harness": "github:vannifr/workflow-script-harness"
// in package.json) or a local path — this package is not published to npm.
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
