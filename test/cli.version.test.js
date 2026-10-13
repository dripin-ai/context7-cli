// --version must read the real package.json so it cannot drift, and must fail loudly
// when that file is gone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCli, assertNoLiveRequest } from './helpers/cli.js';

const ROOT = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8'));

test('--version prints the version from package.json, not a literal', () => {
  const run = runCli(['--version']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.equal(run.stdout, `${pkg.version}\n`);
  assert.equal(run.stderr, '');
  assert.match(pkg.version, /^\d+\.\d+\.\d+/, 'package.json must carry a semver version');
});

test('-v prints the same version', () => {
  assert.equal(runCli(['-v']).stdout, `${pkg.version}\n`);
});

test('--version fails with a clear message when package.json is missing', t => {
  // A copy of bin/ and lib/ without a root package.json. The per-directory
  // {"type":"module"} files only keep the ESM loader happy; the version lookup in
  // bin/c7.js:116 resolves to the missing root file, which is the path under test.
  const dir = mkdtempSync(join(tmpdir(), 'c7-no-pkg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const sub of ['bin', 'lib']) {
    cpSync(new URL(sub, ROOT), join(dir, sub), { recursive: true });
    writeFileSync(join(dir, sub, 'package.json'), '{"type":"module"}\n');
  }

  const run = spawnSync(process.execPath, [join(dir, 'bin', 'c7.js'), '--version'], {
    encoding: 'utf8',
    env: { ...process.env, CONTEXT7_API_KEY: '' },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Error: cannot read package\.json: /);
  assert.equal(run.stdout, '');
});

test('--help needs no package.json either', t => {
  const dir = mkdtempSync(join(tmpdir(), 'c7-no-pkg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const sub of ['bin', 'lib']) {
    cpSync(new URL(sub, ROOT), join(dir, sub), { recursive: true });
    writeFileSync(join(dir, sub, 'package.json'), '{"type":"module"}\n');
  }
  const run = spawnSync(process.execPath, [join(dir, 'bin', 'c7.js'), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /c7 resolve <query>/);
});

test('the published tarball ships only bin, lib, README and LICENSE', () => {
  // `files` is the only thing keeping test/ and the stub helpers out of the package.
  assert.deepEqual(pkg.files, ['bin/', 'lib/', 'README.md', 'LICENSE']);
  assert.equal(pkg.scripts.test, 'node --test');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.dependencies, undefined, 'the CLI must stay dependency-free');
  assert.deepEqual(pkg.devDependencies, undefined, 'the harness must stay dependency-free');
});
