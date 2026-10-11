'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pipeline = fs.readFileSync(path.join(root, '.woodpecker.yml'), 'utf8');

function stepBlock(name) {
  const start = pipeline.indexOf(`  - name: ${name}\n`);
  assert.ok(start >= 0, `step ${name} missing`);
  const next = pipeline.indexOf('\n  - name: ', start + 1);
  return pipeline.slice(start, next < 0 ? undefined : next);
}

test('CI clone block fetches full history with a digest-pinned plugin', () => {
  const clone = pipeline.slice(pipeline.indexOf('\nclone:'), pipeline.indexOf('\nsteps:'));
  assert.match(clone, /image: woodpeckerci\/plugin-git@sha256:[0-9a-f]{64}/);
  assert.match(clone, /depth: 0\b/);
  assert.match(clone, /partial: false\b/);
});

test('gitleaks step runs the self-test and the full-history scan with a digest-pinned image', () => {
  const step = stepBlock('gitleaks');
  assert.match(step, /image: ghcr\.io\/gitleaks\/gitleaks:v[0-9.]+@sha256:[0-9a-f]{64}/);
  const commands = step.slice(step.indexOf('commands:'), step.indexOf('when:'));
  const lines = commands.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('- '));
  assert.deepStrictEqual(lines, ['- sh scripts/secret-scan.sh selftest', '- sh scripts/secret-scan.sh']);
});

test('gitleaks step has no silent fallback and no event gap', () => {
  const step = stepBlock('gitleaks').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  assert.doesNotMatch(step, /\|\|\s*true|protect|staged|CI_PREV_COMMIT_SHA|failure:\s*ignore/);
});

test('secret-scan.sh keeps its shallow, partial, zero-count and floor guards', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'secret-scan.sh'), 'utf8');
  assert.match(script, /is-shallow-repository/);
  assert.match(script, /partialclonefilter/);
  assert.match(script, /extensions\.partialclone/);
  assert.match(script, /scanner reported no commits scanned/);
  assert.match(script, /expected at least/);
  assert.match(script, /selftest: planted secret must fail/);
});

test('local-ci-checks.sh delegates gitleaks to secret-scan.sh', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'local-ci-checks.sh'), 'utf8');
  assert.match(script, /sh scripts\/secret-scan\.sh selftest/);
  assert.match(script, /sh scripts\/secret-scan\.sh \|\| return 1/);
  assert.doesNotMatch(script, /CI_PREV_COMMIT_SHA/);
});
