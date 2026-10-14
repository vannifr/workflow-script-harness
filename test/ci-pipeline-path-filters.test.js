'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pipeline = fs.readFileSync(path.join(__dirname, '..', '.woodpecker.yml'), 'utf8');

const FILTERED = ['sonarqube'];
const NEVER_FILTERED = ['gitleaks', 'env-guard', 'backlog-check', 'docs-check', 'vuln-scan', 'sbom', 'test'];
const KEYS = ['image', 'commands', 'when', 'depends_on', 'environment'];
const FORBIDDEN = /\b(failure|evaluate|detach|skip_clone|runs_on|status|privileged|cron)\s*:/;
const PUSH_MAIN = ['- event: push', 'branch: main'];
const PUSH_MAIN_PR = [...PUSH_MAIN, '- event: pull_request'];
const DOCS_FILTER = ['path:', "exclude: ['**/*.md', 'docs/**']"];
const WHEN = {
  gitleaks: PUSH_MAIN_PR,
  'env-guard': PUSH_MAIN_PR,
  test: PUSH_MAIN_PR,
  'backlog-check': PUSH_MAIN,
  'docs-check': PUSH_MAIN,
  'vuln-scan': PUSH_MAIN,
  sbom: PUSH_MAIN,
  sonarqube: [...PUSH_MAIN, ...DOCS_FILTER],
};
const DEPENDS = {
  gitleaks: null,
  'env-guard': null,
  'backlog-check': null,
  'docs-check': null,
  test: null,
  'vuln-scan': 'depends_on: [test]',
  sbom: 'depends_on: [test]',
  sonarqube: 'depends_on: [test]',
};
const HEADER = [
  'when:',
  '  - event: push',
  '    branch: main',
  '  - event: pull_request',
  'clone:',
  '  git:',
  '    image: woodpeckerci/plugin-git@sha256:550075c844fcec0af41d9d28f9860aa5d8c43e1e9419be4b9266dc02c2f29804',
  '    settings:',
  '      depth: 0',
  '      partial: false',
];

function codeLines(text) {
  return text.split('\n').filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
}

const indentOf = (l) => l.length - l.trimStart().length;

function parse() {
  assert.strictEqual(pipeline.split('\n').filter((l) => /^steps:/.test(l)).length, 1);
  const idx = pipeline.indexOf('\nsteps:\n');
  assert.ok(idx >= 0, 'steps: line must be exactly "steps:"');
  const header = codeLines(pipeline.slice(0, idx));
  const body = codeLines(pipeline.slice(idx + '\nsteps:\n'.length));
  const steps = {};
  let current = null;
  let dash = 0;
  for (const l of body) {
    const ind = indentOf(l);
    assert.ok(ind >= 2, `unexpected top-level line after steps: ${l}`);
    if (ind === 2) {
      assert.ok(l.startsWith('  -'), `bad indent-2 line: ${l}`);
      dash += 1;
      const m = /^ {2}- name: ([a-z][a-z0-9-]*)$/.exec(l);
      assert.ok(m, `step must start with "- name: <plain name>": ${l}`);
      assert.ok(!(m[1] in steps), `duplicate step ${m[1]}`);
      current = { name: m[1], keys: [], lines: {} };
      steps[m[1]] = current;
    } else if (ind === 4) {
      const m = /^ {4}([a-z_]+):( .*)?$/.exec(l);
      assert.ok(m, `bad step-level line: ${l}`);
      assert.ok(KEYS.includes(m[1]), `key not allowed at step level: ${l}`);
      assert.ok(!current.keys.includes(m[1]), `duplicate key ${m[1]} in ${current.name}`);
      current.keys.push(m[1]);
      current.lines[m[1]] = { line: l, rest: [] };
      current.last = m[1];
    } else {
      assert.ok(current && current.last, `orphan line: ${l}`);
      current.lines[current.last].rest.push(l);
    }
  }
  return { header, steps, dash, body };
}

test('G4 pipeline header is exactly the pinned lines and has no path filter', () => {
  const { header } = parse();
  assert.deepStrictEqual(header, HEADER);
  assert.ok(!header.some((l) => l.includes('path:')));
});

test('G1/G5 step set derives from "- name:" lines and no foreign step forms exist', () => {
  const { steps, dash } = parse();
  assert.deepStrictEqual(Object.keys(steps).sort(), [...FILTERED, ...NEVER_FILTERED].sort());
  assert.strictEqual(dash, Object.keys(steps).length);
});

test('G1 forbidden keys appear nowhere in the pipeline', () => {
  assert.ok(!codeLines(pipeline).some((l) => FORBIDDEN.test(l)));
});

test('G2 each step has a bare "when:" whose lines equal the pinned entries exactly', () => {
  const { steps } = parse();
  for (const name of Object.keys(WHEN)) {
    const w = steps[name].lines.when;
    assert.ok(w, `${name} has no when`);
    assert.strictEqual(w.line, '    when:', name);
    assert.ok(w.rest.every((l) => indentOf(l) >= 6), name);
    assert.deepStrictEqual(w.rest.map((l) => l.trim()), WHEN[name], name);
  }
});

test('G2 only the filtered steps carry a path filter, anywhere', () => {
  const { steps } = parse();
  for (const [name, s] of Object.entries(steps)) {
    const has = Object.values(s.lines).some((v) => [v.line, ...v.rest].some((l) => /\bpath\b/.test(l.replace(/'[^']*'/g, ''))));
    assert.strictEqual(has, FILTERED.includes(name), name);
  }
});

test('G3 depends_on equals the pinned value per step, no filtered dependency, no empty list', () => {
  const { steps } = parse();
  for (const [name, s] of Object.entries(steps)) {
    const d = s.lines.depends_on;
    assert.strictEqual(d ? d.line.trim() : null, DEPENDS[name], name);
    if (d) assert.strictEqual(d.rest.length, 0, name);
    if (d) assert.ok(!/\[\s*\]/.test(d.line), name);
    if (!FILTERED.includes(name) && d) {
      for (const f of FILTERED) assert.ok(!d.line.includes(f), `${name} depends on filtered ${f}`);
    }
  }
});
