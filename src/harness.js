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
    void originalError.stack; // force lazy computation now, inside a try
    return originalError.stack;
  } catch (_stackComputationFailed) {
    const safeStack = String(originalError);
    try {
      Object.defineProperty(originalError, 'stack', {
        value: safeStack,
        configurable: true,
        writable: true
      });
    } catch (_cannotRedefine) {
      // Best effort — even if we can't neutralize the dangerous getter on
      // the original object, we still return a safe string for our own use.
    }
    return safeStack;
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
  let inString = null; // one of `'`, `"`, "`" while inside a string, else null
  for (let i = start; i < scriptText.length; i++) {
    const ch = scriptText[i];
    if (inString) {
      if (ch === '\\') {
        i++; // skip the escaped character
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return scriptText.slice(start, i + 1);
      }
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
function buildSandboxContext(dslPrimitives) {
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

async function runWorkflowScript(scriptText, options) {
  const meta = parseMeta(scriptText);
  const declaredPhaseTitles = new Set(
    (meta && Array.isArray(meta.phases) ? meta.phases : []).map((p) => p.title)
  );

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
    agent(_call, opts = {}) {
      if (!opts.label) {
        throw new Error('agent() requires a label option');
      }
      
      const label = opts.label;
      const responses = options.agentResponses || {};
      const response = responses[label];
      
      if (response === undefined) {
        throw new Error(`No response scripted for agent label "${label}"`);
      }
      
      // Handle both single response and array of responses
      // If response is an array, use the first element; otherwise use the response directly
      if (Array.isArray(response)) {
        if (response.length === 0) {
          throw new Error(`No response available for agent label "${label}"`);
        }
        return response[0]; // For now, just return the first response
      }
      return response;
    }
  };
  
  const context = buildSandboxContext(dslPrimitives);
  const wrapped = `(async () => { ${prepareScript(scriptText)} })()`;

  try {
    const value = await vm.runInContext(wrapped, context, { timeout: 5000 });
    return { status: 'success', value };
  } catch (error) {
    // Verified empirically that `instanceof` works correctly here even
    // though the error may have been thrown from inside the vm context —
    // HarnessError instances are always constructed in the host realm (the
    // Proxy trap is host code), so identity is preserved across the vm
    // boundary. No need for fragile duck-typing on name/code.
    if (error instanceof HarnessError) {
      return { status: 'error', error };
    }
    return { status: 'error', error: new ScriptError(error.message, error) };
  }
}

module.exports = { runWorkflowScript };
