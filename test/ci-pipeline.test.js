'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

test('secret-scan.sh isolates its self-test from an inherited git hook environment', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'secret-scan.sh'), 'utf8');
  const selftest = script.slice(script.indexOf('selftest() {'), script.indexOf('case "${1:-}" in'));
  assert.match(selftest, /for v in \$\(git rev-parse --local-env-vars\); do\s+unset "\$v"\s+done/);
  assert.ok(selftest.indexOf('--local-env-vars') < selftest.indexOf('git -C "$tmp" init'));
});

test('secret-scan.sh logs the baseline entry count, scans with gitleaks git and uses a COMMIT marker', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'secret-scan.sh'), 'utf8');
  assert.match(script, /baseline-count\) baseline_count "\$2"; exit 0/);
  assert.match(script, /baseline: \$\{SCAN_BASELINE\} \(\$\(baseline_count "\$SCAN_BASELINE"\) entries\)/);
  assert.match(script, /gitleaks git "\$@" "\$dir"/);
  assert.doesNotMatch(script, /gitleaks detect/);
  assert.match(script, /--format='COMMIT %H' --numstat/);
  assert.match(script, /\$1!="0"&&\$1!="-"/);
});

test('secret-scan.sh selftest leaves the invoking repository untouched under a hook environment', () => {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', ...args], { cwd, env: clean, encoding: 'utf8' });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-hook-'));
  try {
    const repo = path.join(tmp, 'repo');
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(repo);
    fs.mkdirSync(bin);
    assert.strictEqual(git(repo, 'init', '-q').status, 0);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    git(repo, 'add', 'a.txt');
    assert.strictEqual(git(repo, 'commit', '-q', '-m', 'init').status, 0);
    fs.writeFileSync(
      path.join(bin, 'gitleaks'),
      [
        '#!/bin/sh',
        'for a in "$@"; do dir=$a; done',
        'while [ $# -gt 0 ]; do [ "$1" = --report-path ] && report=$2; shift; done',
        'if [ -f "$dir/planted.txt" ]; then echo \'[{"RuleID":"stub"}]\' > "$report"; echo "2 commits scanned."; exit 1; fi',
        'echo "[]" > "$report"; echo "1 commits scanned."; exit 0',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    const snapshot = () => ({
      config: fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8'),
      bare: git(repo, 'config', 'core.bare').stdout,
      count: git(repo, 'rev-list', '--all', '--count').stdout,
      refs: git(repo, 'for-each-ref').stdout,
    });
    const before = snapshot();
    const result = spawnSync('sh', [path.join(root, 'scripts', 'secret-scan.sh'), 'selftest'], {
      cwd: root,
      env: { ...clean, PATH: `${bin}:${process.env.PATH}`, GIT_DIR: path.join(repo, '.git'), GIT_INDEX_FILE: path.join(repo, '.git', 'index') },
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /selftest ok: clean passes, planted secret reported/);
    assert.deepStrictEqual(snapshot(), before);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('local-ci-checks.sh delegates gitleaks to secret-scan.sh', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'local-ci-checks.sh'), 'utf8');
  assert.match(script, /sh scripts\/secret-scan\.sh selftest/);
  assert.match(script, /sh scripts\/secret-scan\.sh \|\| return 1/);
  assert.doesNotMatch(script, /CI_PREV_COMMIT_SHA/);
});

function envGuardSafeDirectories(args, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-guard-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(path.join(root, 'scripts', 'local-ci-checks.sh'), path.join(dir, 'scripts', 'local-ci-checks.sh'));
  fs.chmodSync(path.join(dir, 'scripts', 'local-ci-checks.sh'), 0o755);
  const gitconfig = path.join(dir, 'gitconfig');
  fs.writeFileSync(gitconfig, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, ...extraEnv };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[key];
  if (!('CI' in extraEnv)) delete env.CI;
  spawnSync('git', ['init', '-q'], { cwd: dir, env });
  let status = 0;
  for (let i = 0; i < 3; i += 1) {
    status = spawnSync('./scripts/local-ci-checks.sh', args, { cwd: dir, env, encoding: 'utf8' }).status;
    assert.strictEqual(status, 0);
  }
  const listed = spawnSync('git', ['config', '--file', gitconfig, '--get-all', 'safe.directory'], { env, encoding: 'utf8' }).stdout;
  return listed.split('\n').filter(Boolean).length;
}

test('env-guard registers safe.directory exactly once across repeated strict runs', () => {
  assert.strictEqual(envGuardSafeDirectories(['--strict', 'env-guard'], {}), 1);
});

test('env-guard registers safe.directory exactly once across repeated runs under CI', () => {
  assert.strictEqual(envGuardSafeDirectories(['env-guard'], { CI: 'woodpecker' }), 1);
});

test('env-guard does not write the global git config on a developer machine', () => {
  assert.strictEqual(envGuardSafeDirectories(['env-guard'], {}), 0);
});
