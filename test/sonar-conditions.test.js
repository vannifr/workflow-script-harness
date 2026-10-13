'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const TOKEN = 'tok-9f3c1d2e7a-NOT-A-REAL-TOKEN';
const HOST = 'http://sonar.invalid:9000';
const KEY = 'workflow-script-harness';

const ERROR_BODY = JSON.stringify({
  projectStatus: {
    status: 'ERROR',
    conditions: [
      { status: 'ERROR', metricKey: 'new_coverage', comparator: 'LT', errorThreshold: '80', actualValue: '61.5' },
      { status: 'OK', metricKey: 'new_duplicated_lines_density', comparator: 'GT', errorThreshold: '3', actualValue: '0.0' },
      { status: 'ERROR', metricKey: 'new_violations', comparator: 'GT', errorThreshold: '0', actualValue: '4' },
    ],
  },
});
const OK_BODY = JSON.stringify({
  projectStatus: {
    status: 'OK',
    conditions: [{ status: 'OK', metricKey: 'new_coverage', comparator: 'LT', errorThreshold: '80', actualValue: '91.0' }],
  },
});

function writeStub(dir, name, body) {
  fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

function withFixture(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-cond-'));
  try {
    const repo = path.join(tmp, 'repo');
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.mkdirSync(bin);
    for (const name of ['local-ci-checks.sh', 'sonar-conditions.sh']) {
      fs.copyFileSync(path.join(root, 'scripts', name), path.join(repo, 'scripts', name));
      fs.chmodSync(path.join(repo, 'scripts', name), 0o755);
    }
    fs.copyFileSync(path.join(root, 'sonar-project.properties'), path.join(repo, 'sonar-project.properties'));
    writeStub(
      bin,
      'curl',
      'printf "%s\\n" "$*" >> "$STUB_DIR/curl.log"\ncat >> "$STUB_DIR/curl.stdin"\n[ "$STUB_CURL_FAIL" = "1" ] && exit 22\ncat "$STUB_DIR/body.json"',
    );
    writeStub(
      bin,
      'sonar-scanner',
      'echo "QUALITY GATE STATUS: FAILED - View details on ${SONAR_HOST_URL}/dashboard"\nexit "$STUB_SCANNER_RC"',
    );
    const runStep = ({ body = OK_BODY, scannerRc = 0, curlFails = false, token = TOKEN } = {}) => {
      fs.writeFileSync(path.join(tmp, 'body.json'), body);
      for (const f of ['curl.log', 'curl.stdin']) fs.writeFileSync(path.join(tmp, f), '');
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        SONAR_HOST_URL: HOST,
        SONAR_TOKEN: token,
        STUB_DIR: tmp,
        STUB_CURL_FAIL: curlFails ? '1' : '0',
        STUB_SCANNER_RC: String(scannerRc),
      };
      delete env.CI;
      const result = spawnSync('/bin/sh', ['scripts/local-ci-checks.sh', '--strict', 'sonarqube'], { cwd: repo, env, encoding: 'utf8' });
      return {
        status: result.status,
        out: `${result.stdout}${result.stderr}`,
        curlLog: fs.readFileSync(path.join(tmp, 'curl.log'), 'utf8'),
        curlStdin: fs.readFileSync(path.join(tmp, 'curl.stdin'), 'utf8'),
      };
    };
    fn({ runStep });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('a failed gate prints each failing condition and keeps failing the step', () => {
  withFixture(({ runStep }) => {
    const r = runStep({ body: ERROR_BODY, scannerRc: 3 });
    assert.notStrictEqual(r.status, 0);
    assert.match(r.out, /QUALITY GATE STATUS: FAILED/);
    assert.ok(r.out.includes(`quality gate status ERROR for ${KEY}`));
    assert.ok(r.out.includes('FAILED metric=new_coverage comparator=LT threshold=80 actual=61.5'));
    assert.ok(r.out.includes('FAILED metric=new_violations comparator=GT threshold=0 actual=4'));
    assert.ok(!r.out.includes('new_duplicated_lines_density'));
  });
});

test('every non-zero scanner status still fails the step', () => {
  withFixture(({ runStep }) => {
    for (const scannerRc of [1, 2, 3, 137]) {
      assert.notStrictEqual(runStep({ body: ERROR_BODY, scannerRc }).status, 0);
    }
  });
});

test('scanner success prints nothing extra and makes no request', () => {
  withFixture(({ runStep }) => {
    const r = runStep({ body: ERROR_BODY, scannerRc: 0 });
    assert.strictEqual(r.status, 0);
    assert.ok(!r.out.includes('sonar-conditions'));
    assert.ok(!r.out.includes('FAILED metric'));
    assert.strictEqual(r.curlLog, '');
  });
});

test('an OK gate with a failed scanner prints no condition and still fails', () => {
  withFixture(({ runStep }) => {
    const r = runStep({ body: OK_BODY, scannerRc: 1 });
    assert.notStrictEqual(r.status, 0);
    assert.ok(!r.out.includes('sonar-conditions'));
  });
});

test('the request carries the project key and the token only on stdin', () => {
  withFixture(({ runStep }) => {
    const r = runStep({ body: ERROR_BODY, scannerRc: 2 });
    assert.ok(r.curlLog.includes('api/qualitygates/project_status'));
    assert.ok(r.curlLog.includes(`projectKey=${KEY}`));
    assert.ok(r.curlLog.includes('-K -'));
    assert.ok(!r.curlLog.includes(TOKEN));
    assert.strictEqual(r.curlStdin, `user = "${TOKEN}:"\n`);
  });
});

test('the token is never printed', () => {
  withFixture(({ runStep }) => {
    for (const [body, scannerRc, curlFails] of [[ERROR_BODY, 1, false], [OK_BODY, 1, false], [ERROR_BODY, 0, false], [OK_BODY, 1, true]]) {
      assert.ok(!runStep({ body, scannerRc, curlFails }).out.includes(TOKEN));
    }
  });
});

test('an unavailable status request degrades visibly and keeps failing', () => {
  withFixture(({ runStep }) => {
    const r = runStep({ scannerRc: 2, curlFails: true });
    assert.notStrictEqual(r.status, 0);
    assert.ok(r.out.includes('conditions not available'));
  });
});

test('neither script enables shell tracing or curl verbose output', () => {
  for (const name of ['local-ci-checks.sh', 'sonar-conditions.sh']) {
    const text = fs.readFileSync(path.join(root, 'scripts', name), 'utf8');
    assert.doesNotMatch(text, /set -[a-z]*x/);
    assert.doesNotMatch(text, /curl[^\n]*\s(-v|--verbose)\b/);
  }
});

test('the sonarqube pipeline step still runs the strict wrapper without a fallback', () => {
  const pipeline = fs.readFileSync(path.join(root, '.woodpecker.yml'), 'utf8');
  const block = pipeline.split('  - name: sonarqube\n')[1].split('\n  - name: ')[0];
  assert.ok(block.includes('./scripts/local-ci-checks.sh --strict sonarqube'));
  assert.doesNotMatch(block, /failure:/);
  assert.doesNotMatch(block, /--strict sonarqube[^\n]*\|\|/);
});
