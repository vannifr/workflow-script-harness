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

class ScriptError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'ScriptError';
    this.originalError = originalError;
    if (originalError && originalError.stack) {
      this.stack = originalError.stack;
    }
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
// globals explicitly present in `dslPrimitives`. Everything else throws
// HarnessError(UNKNOWN_GLOBAL) — accessing an absent global returns
// `undefined` by default, which produces confusing downstream errors;
// throwing immediately, with the offending name, is the whole point of
// CONSTITUTION.md Principle III (actively block, don't just omit).
//
// `has` must unconditionally return true: if it returned false, V8 would
// treat the identifier as an unresolvable reference and raise its own
// native ReferenceError before our `get` trap ever runs, defeating the
// custom HarnessError below.
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
      throw new HarnessError(
        `Unknown global "${prop}" is not available in the sandbox. Only DSL primitives are permitted.`,
        'UNKNOWN_GLOBAL',
        { globalName: prop }
      );
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
    }
  };
  const context = buildSandboxContext(dslPrimitives);
  const wrapped = `(async () => { ${prepareScript(scriptText)} })()`;

  try {
    const value = await vm.runInContext(wrapped, context, { timeout: 5000 });
    return { status: 'success', value };
  } catch (error) {
    if (error instanceof HarnessError) {
      return { status: 'error', error };
    }
    return { status: 'error', error: new ScriptError(error.message, error) };
  }
}

module.exports = { runWorkflowScript };
