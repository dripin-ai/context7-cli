// The exit-code contract: bin/c7.js ends the process only with process.exit(0|1), on the
// lines the README's `Set at` column names, and lib/api.js never ends it at all. The
// per-command rows are driven by cli.args/cli.json/cli.dispatch/smoke; what is here is
// what those cannot say.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { CLI, NO_FETCH, runCli, fetchStub } from './helpers/cli.js';

const markdown = body => fetchStub([{ contentType: 'text/markdown', body }]);
const asJson = body => fetchStub([{ contentType: 'application/json', body }]);
// A megabyte generated in the child, not shipped through the --import argument.
const BIG_DOCS = `globalThis.fetch = async () =>
  new Response('x'.repeat(1e6), { headers: { 'content-type': 'text/markdown' } });`;

// README: "A closed pipe is not an error." `head` exits first and closes the pipe, and the
// pipeline's own status is head's — so the subshell reports the CLI's code on stderr.
const pipedExit = (argv, stub, head) => {
  const stubUrl = `data:text/javascript,${encodeURIComponent(stub).replace(/'/g, '%27')}`;
  const cli = [process.execPath, '--import', stubUrl, CLI, ...argv].map(a => `'${a}'`).join(' ');
  const run = spawnSync('/bin/sh', ['-c', `(${cli}; echo $? >&2) | ${head} >/dev/null`], {
    encoding: 'utf8',
    env: { ...process.env, CONTEXT7_API_KEY: '' },
  });
  return run.stderr.trim();
};

test('exit 0: a closed pipe is not an error', () => {
  assert.equal(pipedExit(['--help'], NO_FETCH, 'head -1'), '0');
  assert.equal(pipedExit(['docs', '/a/b'], BIG_DOCS, 'head -c 10'), '0');
});

// DELIBERATE EQUALITY, pinned not resolved (see the comment on lib/api.js's `return ''`):
// a JSON envelope carrying neither `snippets` nor `content` is "no documentation", and it
// leaves by the same door as an empty markdown body. Same code, same message, byte for
// byte. Printing the envelope instead would pass it off as docs at exit 0.
test('exit 1: an empty markdown body and a contentless JSON envelope are indistinguishable', () => {
  const emptyBody = runCli(['docs', '/reactjs/react.dev'], { stub: markdown('') });
  const envelope = runCli(['docs', '/reactjs/react.dev'], {
    stub: asJson(JSON.stringify({ metadata: { totalTokens: 0 } })),
  });
  assert.equal(emptyBody.code, 1);
  assert.deepEqual([envelope.code, envelope.stdout, envelope.stderr], [
    emptyBody.code,
    emptyBody.stdout,
    emptyBody.stderr,
  ]);
});

// bin/c7.js:130 (--version with an unreadable package.json) needs a tree without a
// package.json; it is pinned where that tree is already built: test/cli.version.test.js.

// The contract is "0 and 1, nothing else", and it covers the whole shipped surface:
// bin/c7.js ends the process, lib/api.js throws and never does.
//
// WHY not just collect the argument of every `process.exit(...)`: that reads a count as a
// structural claim, and `process.exitCode = 2`, `process['exit'](2)` and
// `const e = process.exit; e(2)` all walk past it. So instead: strip the two permitted
// literal calls, then allow-list every `process` member that survives. Anything else — a
// computed exit, a bracket access, an alias, a bare destructure — is left over and fails.
const PERMITTED_EXIT = /process\.exit\([01]\)/g;

// Per shipped file: the lines its permitted exits sit on, and the `process` members it
// reads. Lines, not a count, because the README's `Set at` column names them — pinning
// them here is what keeps it honest when an insertion shifts the file.
const SHIPPED = [
  { file: 'bin/c7.js', exitLines: [41, 91, 104, 111, 119, 130, 160, 169, 210], reads: ['argv', 'env', 'stderr'] },
  { file: 'lib/api.js', exitLines: [], reads: [] },
];

for (const { file, exitLines, reads } of SHIPPED) {
  test(`${file} ends the process only via process.exit(0) and process.exit(1)`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const found = [...source.matchAll(PERMITTED_EXIT)].map(
      m => source.slice(0, m.index).split('\n').length,
    );
    assert.deepEqual(
      found,
      exitLines,
      `${file}: process.exit(0|1) no longer sits on the lines the map and the README name`,
    );
    const leftover = [
      ...source.replace(PERMITTED_EXIT, '').matchAll(/process(?:\.(\w+))?/g),
    ].map(m => m[1] ?? '(process, reached some other way)');
    assert.deepEqual(
      [...new Set(leftover)].sort(),
      reads,
      `${file} touches \`process\` outside the exit map — a path with no row above may end the process`,
    );
  });
}
