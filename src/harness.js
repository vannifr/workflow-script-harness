'use strict';

const vm = require('node:vm');

// Non-semantic export-capture: replaces only the `export` keyword
// sequences the DSL contract defines (`export const meta = ...` and
// `export default ...`), never the expression/value that follows. See
// research.md Challenge 1/2 for why a real ES module linker cannot be
// used here (it would require the script to `import` the DSL globals,
// contradicting the "ambient global, never imported" contract).
function prepareScript(scriptText) {
  const modified = scriptText
    .replace(/export\s+const\s+meta\s*=/, 'const meta =')
    .replace(/export\s+default\s+/, '_exportResult = ');

  return `
    let _exportResult;
    ${modified}
    return _exportResult;
  `;
}

class HarnessError extends Error {
  constructor(message, code, context) {
    super(message);
    this.name = 'HarnessError';
    this.code = code;
    this.context = context;
  }
}

// Errors thrown INSIDE the sandboxed script (TypeError from a bad property
// access, ReferenceError, etc.) are constructed using the VM CONTEXT'S OWN
// Error/TypeError intrinsics — not the host's. Because `buildSandboxContext`
// wraps the context's global object in a restrictive Proxy, that Proxy's
// `get` trap is also consulted when V8 LAZILY computes such an error's
// `.stack` string (stack formatting needs to resolve helpers from the
// realm the error belongs to) — and since `Error`/other formatting
// internals are not in our DSL allowlist, reading `.stack` on a raw
// vm-thrown error can itself throw and CRASH THE PROCESS (uncaught),
// reproducibly, for the most ordinary script bugs (confirmed empirically:
// `undefined.someProperty` inside the sandbox). `heal-and-cache` the stack
// immediately after catching, before anyone — including our own code —
// touches `.stack` again.
function healOriginalErrorStack(originalError) {
  try {
    // The `return` itself forces the lazy `.stack` getter to evaluate now,
    // inside this try.
    return originalError.stack;
  } catch (stackComputationError) {
    const safeStack = `${String(originalError)}\n    (original stack unavailable: ${stackComputationError.message})`;
    try {
      Object.defineProperty(originalError, 'stack', {
        value: safeStack,
        configurable: true,
        writable: true
      });
      return safeStack;
    } catch (redefineError) {
      // Best effort — even if we can't neutralize the dangerous getter on
      // the original object, still return a safe string for our own use.
      return `${safeStack} (also could not redefine .stack: ${redefineError.message})`;
    }
  }
}

class ScriptError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'ScriptError';
    this.originalError = originalError;
    this.stack = healOriginalErrorStack(originalError);
  }
}

// Extracts the object-literal text of `export const meta = {...}` by
// brace-depth counting (not a naive regex) so it works regardless of how
// deeply nested meta.phases's own objects/arrays are — a shallow regex
// stops at the first "}" it happens to see, which breaks the moment the
// literal contains a nested object (exactly what `phases: [{ ... }]`
// always does). String literals are skipped over so a `{`/`}` inside a
// quoted string never miscounts the depth.
// Tracks whether the scanner is inside a quoted string, one character at
// a time, so a `{`/`}` inside a string literal never miscounts brace
// depth. Pulled out of extractMetaLiteral to keep that function's
// cognitive complexity down — it only needs to know "was this character
// part of string bookkeeping" (skip brace counting) or not (count it).
function advanceStringState(state, ch) {
  if (state.skipNext) {
    return { inString: state.inString, skipNext: false };
  }
  if (state.inString) {
    if (ch === '\\') {
      return { inString: state.inString, skipNext: true };
    }
    if (ch === state.inString) {
      return { inString: null, skipNext: false };
    }
    return state;
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    return { inString: ch, skipNext: false };
  }
  return state;
}

function extractMetaLiteral(scriptText) {
  const marker = /export\s+const\s+meta\s*=\s*/.exec(scriptText);
  if (!marker) {
    return undefined;
  }
  const start = marker.index + marker[0].length;
  if (scriptText[start] !== '{') {
    return undefined;
  }

  let depth = 0;
  let stringState = { inString: null, skipNext: false };
  for (let i = start; i < scriptText.length; i++) {
    const ch = scriptText[i];
    const wasInString = stringState.inString;
    stringState = advanceStringState(stringState, ch);
    if (wasInString || stringState.inString) {
      continue; // this character was part of string bookkeeping, not a brace
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}' && --depth === 0) {
      return scriptText.slice(start, i + 1);
    }
  }
  return undefined;
}

function parseMeta(scriptText) {
  const literal = extractMetaLiteral(scriptText);
  if (literal === undefined) {
    return undefined;
  }
  // `meta` is contractually a pure literal (no variables/calls) — evaluate
  // it in a bare, throwaway context, not the script's own sandbox context.
  return vm.runInNewContext(`(${literal})`, {});
}

// A Proxy-based allowlist: the sandboxed script can only ever see the
// globals explicitly present in `dslPrimitives`. Everything else is meant
// to throw HarnessError(UNKNOWN_GLOBAL) per CONSTITUTION.md Principle III
// (actively block, don't just omit).
//
// `has` must unconditionally return true: if it returned false, V8 would
// treat the identifier as an unresolvable reference and raise its own
// native ReferenceError before our `get` trap ever runs.
//
// IMPORTANT, verified empirically: throwing DIRECTLY inside this `get`
// trap does NOT reliably propagate our HarnessError — for an unqualified
// global identifier lookup (bare read OR call), V8 appears to need to
// resolve further internals (plausibly `Error`/`ReferenceError` itself)
// through the SAME trap while synthesizing its own exception, and the
// whole thing collapses into a native `ReferenceError` instead of our
// custom error. Returning a "poisoned" callable Proxy from `get` (which
// only throws when it is later CALLED or has a property read on it, i.e.
// during ordinary `[[Call]]`/`[[Get]]`, not during global-identifier
// resolution) avoids that collapse and is what makes `unsupportedFunction()`
// and a directly-returned bare reference correctly surface as HarnessError.
//
// KNOWN LIMITATION (accepted, not a security hole): if a script captures
// this poisoned value WITHOUT calling or otherwise touching it — e.g.
// `const leaked = { ref: someUnknownGlobal }; export default leaked;` —
// no throw occurs, and the harmless (inert, always-throwing-when-used)
// poisoned object ends up nested in the result. It never becomes a
// genuinely working reference to anything forbidden, so this is a
// detection-completeness gap, not a sandbox breach. For the SPECIFIC,
// enumerable forbidden primitives (Date, Math, require, ...), T040/US5
// instead pre-defines throwing GETTERS directly on the target object
// BEFORE the script runs — that pattern throws eagerly, at first access,
// with no such gap, and does not hit the collapse-to-ReferenceError issue
// (confirmed empirically) because the property already exists when the
// script accesses it, rather than being synthesized reactively inside
// this trap.
// Explicitly forbidden host/non-deterministic globals (FR-010/FR-011).
// `console` is deliberately NOT in this list: it is exercised by an
// earlier, already-passing test (T005) as an example of a merely UNKNOWN
// global, not a specifically-forbidden one — this project only forbids
// the enumerable set the DSL contract actually names.
const FORBIDDEN_PRIMITIVES = [
  'Date', 'Math', 'require', 'module', 'exports', 'process',
  '__dirname', '__filename', 'Buffer',
  'setTimeout', 'setInterval', 'setImmediate',
  'clearTimeout', 'clearInterval', 'clearImmediate',
  'queueMicrotask', 'fetch', 'URL', 'URLSearchParams'
];

// Pre-defines a POISONED VALUE for each forbidden name directly on the
// target object, BEFORE the Proxy/vm context are ever created — the value
// itself is a Proxy that throws on any further use (property access, call,
// or `new`). This must be a value, NOT a throwing getter: verified
// empirically that a throwing getter correctly blocks a member-expression
// access (`Date.now()`, `new Date()` — the throw happens at the initial
// `Date` read, before `.now`/`new` ever apply) but does NOT block a
// forbidden name called DIRECTLY as a bare identifier (`require("fs")`) —
// that specific call-callee resolution path hits the same
// collapse-to-ReferenceError V8 quirk documented on buildSandboxContext
// below. A poisoned Proxy VALUE (not a getter) sidesteps this the same way
// the unknown-global fallback does, while still throwing at the earliest
// possible point for the member-access pattern (property access on it).
function installForbiddenPrimitives(target) {
  for (const name of FORBIDDEN_PRIMITIVES) {
    const error = new HarnessError(
      `Forbidden primitive "${name}" is not available in the sandbox. Workflow-scripts must not access host capabilities or non-deterministic APIs.`,
      'FORBIDDEN_PRIMITIVE',
      { primitive: name }
    );
    const poisoned = new Proxy(function () {}, {
      get: () => { throw error; },
      apply: () => { throw error; },
      construct: () => { throw error; }
    });
    Object.defineProperty(target, name, {
      value: poisoned,
      enumerable: true,
      configurable: true
    });
  }
}

function buildSandboxContext(dslPrimitives) {
  installForbiddenPrimitives(dslPrimitives);
  const proxy = new Proxy(dslPrimitives, {
    has() {
      return true;
    },
    get(target, prop) {
      if (typeof prop === 'symbol') {
        return target[prop];
      }
      if (prop in target) {
        return target[prop];
      }
      const error = new HarnessError(
        `Unknown global "${prop}" is not available in the sandbox. Only DSL primitives are permitted.`,
        'UNKNOWN_GLOBAL',
        { globalName: prop }
      );
      const poisonedFunction = function () {
        throw error;
      };
      return new Proxy(poisonedFunction, {
        get: () => { throw error; },
        apply: () => { throw error; }
      });
    }
  });

  return vm.createContext(proxy);
}

// Fail-fast aggregate error for parallel(): waits for every thunk to
// SETTLE (not just the first rejection) so `completed`/`failed` reflect
// the true outcome of every thunk, per research.md Challenge 6.
class ParallelError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ParallelError';
    this.code = 'PARALLEL_FAILURE';
    this.completed = details.completed;
    this.failed = details.failed;
    this.pending = details.pending;
  }
}

// Cross-realm object identity: any plain object/array the SANDBOXED
// SCRIPT constructs itself (an object literal, `[...spread]`, etc. inside
// the script's own code) carries the VM CONTEXT'S OWN Object/Array
// intrinsics, not the host's — `vm.createContext()` gives every context
// its own full set of built-ins. `assert.deepStrictEqual` compares
// `[[Prototype]]` as part of strict equality, so it will spuriously
// report such a value as unequal to a host-constructed object with
// identical own-properties. Values that pass THROUGH unmodified from
// `options` (e.g. an `agentResponses` value the mock just returns as-is)
// stay host-realm and are unaffected. Callers writing assertions against
// `result.value` should use `assert.deepEqual` (or compare individual
// fields) whenever the value could contain anything the script itself
// constructed, not `assert.deepStrictEqual`.
async function runWorkflowScript(scriptText, options) {
  const meta = parseMeta(scriptText);
  const declaredPhaseTitles = new Set(
    (meta && Array.isArray(meta.phases) ? meta.phases : []).map((p) => p.title)
  );

  // Initialize per-call state to track agent call counters for this specific run
  const agentCallCounters = {};

  // Initialize per-call state to track budget spent counters for this specific run
  const budgetSpentCounters = {};

  // Execution trace (FR-006/FR-007, contracts/runWorkflowScript.md
  // ExecutionTrace): a monotonic COUNTER, not a wall-clock timestamp —
  // the sandboxed script has no access to Date/timers (Principle III),
  // and the harness's own trace must stay deterministic (Principle V) even
  // though the underlying execution is genuinely concurrent. Per-call
  // state, like the counters above — never shared across runWorkflowScript
  // invocations.
  let traceCounter = 0;
  const traceEntries = [];
  function recordStart(type, id, label) {
    const entry = { id, type, label, startCounter: traceCounter++, endCounter: null };
    traceEntries.push(entry);
    return entry;
  }
  function recordEnd(entry) {
    entry.endCounter = traceCounter++;
  }

  const dslPrimitives = {
    args: options.args,
    phase(title) {
      if (declaredPhaseTitles.size > 0 && !declaredPhaseTitles.has(title)) {
        // Per contracts/runWorkflowScript.md "Phase Validation": a
        // mismatch is a ScriptError (the script's own bug), not a
        // HarnessError — throw a plain Error here and let the
        // classification below turn it into a ScriptError.
        throw new Error(
          `phase("${title}") does not match any title in meta.phases`
        );
      }
      return undefined;
    },
    log() {
      // Intentionally a no-op sink for now: FR-002 only requires log()
      // to be callable without affecting the script's result.
      return undefined;
    },
    async agent(_call, opts = {}) {
      if (!opts.label) {
        throw new Error('agent() requires a label option');
      }

      const label = opts.label;
      const entry = recordStart('agent', `agent-${label}-${agentCallCounters[label] || 0}`, label);
      // A real agent() call is inherently asynchronous; yielding at least
      // one microtask here is what lets multiple agent() calls issued via
      // parallel()/pipeline() genuinely interleave instead of each
      // running start-to-finish before the next is even entered.
      await Promise.resolve();

      try {
        const responses = options.agentResponses || {};
        const response = responses[label];

        if (response === undefined) {
          const availableLabels = Object.keys(responses);
          throw new HarnessError(
            `Agent call with label "${label}" has no scripted responses. Add responses for this label in options.agentResponses.`,
            'MISSING_AGENT_RESPONSE',
            { label, availableLabels }
          );
        }

        if (!agentCallCounters[label]) {
          agentCallCounters[label] = 0;
        }
        const callIndex = agentCallCounters[label]++;

        if (Array.isArray(response)) {
          if (callIndex >= response.length) {
            throw new HarnessError(
              `Agent call with label "${label}" exhausted all scripted responses. Provided ${response.length} responses but called ${callIndex + 1} times.`,
              'EXHAUSTED_AGENT_RESPONSES',
              { label, callCount: callIndex + 1, responseCount: response.length }
            );
          }
          const responseValue = response[callIndex];
          if (responseValue && typeof responseValue === 'object' && responseValue.type === 'null') {
            return null;
          }
          return responseValue;
        }

        if (response && typeof response === 'object' && response.type === 'null') {
          return null;
        }
        // Non-array responses: return the same value for every call
        // (backward compatibility with the single-response design).
        return response;
      } finally {
        recordEnd(entry);
      }
    },
    async parallel(thunks) {
      const entries = thunks.map((_, i) => recordStart('parallel', `parallel-${i}`));
      const settled = await Promise.all(
        thunks.map((thunk, i) =>
          Promise.resolve()
            .then(() => thunk())
            .then(
              (value) => { recordEnd(entries[i]); return { ok: true, value }; },
              (error) => { recordEnd(entries[i]); return { ok: false, error }; }
            )
        )
      );

      const failed = settled
        .map((r, index) => ({ index, ...r }))
        .filter((r) => !r.ok)
        .map((r) => ({ index: r.index, error: r.error }));

      if (failed.length > 0) {
        const completed = settled
          .map((r, index) => ({ index, ...r }))
          .filter((r) => r.ok)
          .map((r) => ({ index: r.index, result: r.value }));
        throw new ParallelError(
          `Parallel execution failed: ${failed.length} of ${thunks.length} task(s) failed`,
          { completed, failed, pending: [] }
        );
      }

      return settled.map((r) => r.value);
    },
    async pipeline(items, ...stages) {
      const itemPromises = items.map(async (item, itemIndex) => {
        let current = item;
        for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
          const entry = recordStart('pipeline', `pipeline-item${itemIndex}-stage${stageIndex}`);
          try {
            current = await stages[stageIndex](current);
          } finally {
            recordEnd(entry);
          }
        }
        return current;
      });
      // Items progress independently and concurrently; per-item stage
      // order is still enforced by the sequential await chain above.
      return Promise.all(itemPromises);
    },
    budget: {
      total: options.budget?.total,
      spent: function() {
        if (!options.budget || !Array.isArray(options.budget.spentSequence)) {
          throw new HarnessError(
            'budget.spent() called but options.budget.spentSequence is not provided as an array',
            'EXHAUSTED_BUDGET_SPENT',
            { callCount: 0, valueCount: 0 }
          );
        }
        
        const spentSequence = options.budget.spentSequence;
        
        // Initialize spent counter if it doesn't exist yet
        if (!budgetSpentCounters.spentIndex) {
          budgetSpentCounters.spentIndex = 0;
        }
        
        const callIndex = budgetSpentCounters.spentIndex++;
        
        if (callIndex >= spentSequence.length) {
          // Budget exhaustion - throw a HarnessError with the required code
          throw new HarnessError(
            'budget.spent() called more times than scripted values provided. Provided ' + spentSequence.length + ' values but called ' + (callIndex + 1) + ' times.',
            'EXHAUSTED_BUDGET_SPENT',
            { callCount: callIndex + 1, valueCount: spentSequence.length }
          );
        }
        
        return spentSequence[callIndex];
      }
    }
  };
  
  const context = buildSandboxContext(dslPrimitives);
  const wrapped = `(async () => { ${prepareScript(scriptText)} })()`;

  const trace = { entries: traceEntries };

  try {
    const value = await vm.runInContext(wrapped, context, { timeout: 5000 });
    return { status: 'success', value, trace };
  } catch (error) {
    // Verified empirically that `instanceof` works correctly here even
    // though the error may have been thrown from inside the vm context —
    // HarnessError instances are always constructed in the host realm (the
    // Proxy trap is host code), so identity is preserved across the vm
    // boundary. No need for fragile duck-typing on name/code.
    if (error instanceof HarnessError) {
      return { status: 'error', error, trace };
    }
    return { status: 'error', error: new ScriptError(error.message, error), trace };
  }
}

module.exports = { runWorkflowScript };
