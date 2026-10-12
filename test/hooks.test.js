'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const hooksSource = process.env.HOOKS_UNDER_TEST || path.join(root, '.githooks');

function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key];
  }
  return env;
}

function git(cwd, args, extraEnv) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...cleanEnv(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...extraEnv },
  });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.name', 'tester']);
  git(dir, ['config', 'user.email', 'tester@example.invalid']);
  fs.cpSync(hooksSource, path.join(dir, '.githooks'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'scripts'));
  for (const name of ['local-ci-checks.sh', 'verify.sh']) {
    fs.writeFileSync(path.join(dir, 'scripts', name), '#!/bin/sh\necho own-check >> "$(git rev-parse --git-dir)/order.log"\n', { mode: 0o755 });
  }
  git(dir, ['config', 'core.hooksPath', '.githooks']);
  fs.writeFileSync(path.join(dir, 'file.txt'), 'x\n');
  git(dir, ['add', '.']);
  return dir;
}

function writeIikitHook(dir, fileName, marker, body) {
  const hookPath = path.join(dir, '.git', 'hooks', fileName);
  fs.writeFileSync(hookPath, `#!/bin/sh\n# ${marker}\n${body}\n`, { mode: 0o755 });
}

function commit(dir) {
  return git(dir, ['commit', '-q', '-m', 'test: commit']);
}

test('a failing IIKit pre-commit hook fails the commit after the own checks ran', () => {
  const dir = makeRepo();
  writeIikitHook(dir, 'pre-commit', 'IIKIT-PRE-COMMIT', 'echo iikit-pre >> "$(git rev-parse --git-dir)/order.log"\nexit 7');
  const result = commit(dir);
  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(git(dir, ['rev-list', '--all', '--count']).stdout.trim(), '0');
  const order = fs.readFileSync(path.join(dir, '.git', 'order.log'), 'utf8').trim().split('\n');
  assert.deepStrictEqual(order, ['own-check', 'own-check', 'own-check', 'iikit-pre']);
});

test('a failing IIKit hook installed alongside as iikit-pre-commit fails the commit', () => {
  const dir = makeRepo();
  writeIikitHook(dir, 'iikit-pre-commit', 'IIKIT-PRE-COMMIT', 'exit 3');
  assert.notStrictEqual(commit(dir).status, 0);
  assert.strictEqual(git(dir, ['rev-list', '--all', '--count']).stdout.trim(), '0');
});

test('a passing IIKit pre-commit and post-commit hook are both called', () => {
  const dir = makeRepo();
  writeIikitHook(dir, 'pre-commit', 'IIKIT-PRE-COMMIT', 'echo pre >> "$(git rev-parse --git-dir)/chain.log"');
  writeIikitHook(dir, 'post-commit', 'IIKIT-POST-COMMIT', 'echo post >> "$(git rev-parse --git-dir)/chain.log"');
  const result = commit(dir);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(git(dir, ['rev-list', '--all', '--count']).stdout.trim(), '1');
  assert.strictEqual(fs.readFileSync(path.join(dir, '.git', 'chain.log'), 'utf8'), 'pre\npost\n');
});

test('without IIKit hooks the chain is skipped with one log line and the commit succeeds', () => {
  const dir = makeRepo();
  const result = commit(dir);
  assert.strictEqual(result.status, 0, result.stderr);
  const log = result.stdout + result.stderr;
  assert.strictEqual(log.split('\n').filter((l) => l.includes('iikit hook not found (pre-commit)')).length, 1);
  assert.strictEqual(log.split('\n').filter((l) => l.includes('iikit hook not found (post-commit)')).length, 1);
  assert.strictEqual(git(dir, ['rev-list', '--all', '--count']).stdout.trim(), '1');
});

test('a non-IIKit pre-commit file in the shared hooks directory is not chained', () => {
  const dir = makeRepo();
  fs.writeFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 9\n', { mode: 0o755 });
  assert.strictEqual(commit(dir).status, 0);
});
