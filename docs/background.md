# Background

Why the harness exists, what it gives you, and how it differs from a generic sandbox.

## In plain terms

- A "workflow-script" is a small program that orchestrates several AI sub-agents to do a multi-step task — for example, one script might review a piece of writing in several passes: check the argument, check the audience fit, check the tone, then combine those into a final verdict.

Writing that script is easy to get subtly wrong: does it call the right number of sub-agents? Does it handle one of them failing or returning nothing?

Does it actually run steps at the same time when it's supposed to, instead of secretly doing them one by one?

Today, the only way to check any of that is to actually run the script for real — spend real money and real time calling real AI agents, every single time you want to check a small change.

That's slow, it costs money for every test, and it's hard to deliberately test the "what if an agent fails" case on purpose.

- This harness lets you run that same script script **exactly as written**, but swap the real AI agents for scripted, instant, free stand-ins you control: "when the script asks agent X, pretend it answered with this," or "pretend this one failed." You get the answer back in milliseconds, for free, and you can deliberately test the failure cases that are hard to trigger on demand with the real thing.

- It also double-checks that the script actually behaves the way the real system would — for instance, that steps which are supposed to run at the same time genuinely do, and that the script never tries to do something it isn't allowed to do (like reading the real system clock).

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
  tasks concurrently (`Promise.all`, not a sequential loop); `pipeline()` lets independent items overlap across stages while still enforcing that a given item's stage 2 never starts before its own stage 1 finished.

  A counter-based execution trace (`result.trace`) lets a test prove this overlap actually happened, deterministically (no wall-clock flakiness).
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

## Why not a generic JS sandbox?

`isolated-vm`, QuickJS-via-WASM, and (deprecated, CVE-carrying) `vm2` solve a different problem: safely running *untrusted* code in production.

- This harness isn't a security boundary and doesn't try to be one — Node's `vm` module is explicitly not hardened against a malicious script, which is fine here because the script under test is **yours**, running locally in a test process you already trust.

What it needs to get right instead is *behavioral accuracy*: the same allowed/forbidden globals, the same `agent()`/`parallel()`/`pipeline()` semantics, and genuine (not simulated) concurrency, so a green test actually predicts what happens in the real Workflow tool.

That's a narrower, different goal than sandboxing untrusted code, which is why a general-purpose sandbox library doesn't replace this.

## FAQ

**Does this run inside Claude Code?** No — it's a standalone Node package
you run with `node:test`, completely outside any Claude Code session.

**Does this replace testing against real agents?** No.

It replaces the *repeated, per-change* real-agent runs you'd otherwise need during development — validate orchestration logic, error handling, and concurrency here for free and instantly, then do a final real run before you trust a script in production.

**What if Anthropic changes the Workflow tool's sandbox?** The forbidden- primitives list and concurrency semantics here are a point-in-time snapshot (see the verification date at the top of this README).

If they drift from reality, please open an issue — see `CONSTITUTION.md` for how this project re-verifies against the real runtime.

## Status

A small, focused tool, built and used for testing my own Workflow-tool scripts — not an official Anthropic project.

It has no dependencies beyond Node's built-in `vm` module, a small test surface, and a spec-driven history (see above) if you want to check a design decision before relying on it.

Issues and pull requests are welcome; there's no formal support commitment beyond that.
