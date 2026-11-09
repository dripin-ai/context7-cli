// The exit-code contract. Every way bin/c7.js can end the process has a row here, and
// each row names the line that sets the code. If a code moves, this file goes red.
//
// The CLI defines exactly two codes — 0 and 1 — and the last test in this file holds
// that line against the source itself, so an exit code added on a path no row covers
// cannot slip in silently. A third code means the README table and this file must grow
// with it; it is not a free change.
//
// Offline like the rest of test/: every run carries a stubbed fetch, and the rows that
// must not reach the network run under the default NO_FETCH stub plus assertNoLiveRequest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCli, assertNoLiveRequest, fetchStub, stubSearchAndDocs, CLI } from './helpers/cli.js';

const markdown = body => fetchStub([{ contentType: 'text/markdown', body }]);
const asJson = body => fetchStub([{ contentType: 'application/json', body }]);
const searchHits = results =>
  fetchStub([{ match: '/search?', contentType: 'application/json', body: JSON.stringify({ results }) }]);

// Each row: what you type, what answers the network (omitted = nothing may be requested),
// the code it must produce, the line that produces it, and a fragment of the message.
const CONTRACT = [
  // ── 0: the command did what was asked ───────────────────────────────────────────
  { argv: ['--help'], code: 0, at: 'bin/c7.js:160', stdout: /c7 resolve <query>/ },
  { argv: ['--version'], code: 0, at: 'bin/c7.js:160', stdout: /^\d+\.\d+\.\d+\n$/ },
  { argv: [], code: 0, at: 'bin/c7.js:169', stdout: /c7 resolve <query>/ },
  {
    argv: ['resolve', 'react'],
    stub: searchHits([{ id: '/reactjs/react.dev', description: 'React' }]),
    code: 0,
    at: 'bin/c7.js:85 (no explicit exit — main() returns)',
    stdout: /\/reactjs\/react\.dev/,
  },
  {
    argv: ['resolve', 'react', '--json'],
    stub: searchHits([{ id: '/reactjs/react.dev' }]),
    code: 0,
    at: 'bin/c7.js:81 (no explicit exit — main() returns)',
    stdout: /"id": "\/reactjs\/react\.dev"/,
  },
  {
    argv: ['docs', '/reactjs/react.dev'],
    stub: markdown('# useState'),
    code: 0,
    at: 'bin/c7.js:121 (no explicit exit — main() returns)',
    stdout: /# useState/,
  },
  {
    argv: ['react', 'hooks'],
    stub: stubSearchAndDocs([{ id: '/reactjs/react.dev' }]),
    code: 0,
    at: 'bin/c7.js:121 (no explicit exit — main() returns)',
    stdout: /\/api\/v1\/reactjs\/react\.dev/,
  },

  // ── 1, via usage() at bin/c7.js:41: the command line itself was wrong ───────────
  { argv: ['--nope'], code: 1, at: 'bin/c7.js:149 → :41', stderr: /Unknown option/ },
  { argv: ['--tokens', 'abc'], code: 1, at: 'bin/c7.js:68 → :41', stderr: /--tokens expects a positive integer/ },
  { argv: ['--tokens', '0'], code: 1, at: 'bin/c7.js:68 → :41', stderr: /--tokens expects a positive integer/ },
  { argv: ['--help', 'react'], code: 1, at: 'bin/c7.js:158 → :41', stderr: /--help takes no arguments/ },
  { argv: ['--version', 'react'], code: 1, at: 'bin/c7.js:158 → :41', stderr: /--version takes no arguments/ },
  { argv: ['resolve'], code: 1, at: 'bin/c7.js:184 → :41', stderr: /usage: c7 resolve <query>/ },
  { argv: ['resolve', '   '], code: 1, at: 'bin/c7.js:75 → :41', stderr: /usage: c7 resolve <query>/ },
  { argv: ['docs'], code: 1, at: 'bin/c7.js:190 → :41', stderr: /usage: c7 docs <library> \[topic\]/ },
  { argv: ['docs', '   '], code: 1, at: 'bin/c7.js:97 → :41', stderr: /usage: c7 docs <library> \[topic\]/ },
  { argv: ['docs', 'react', '--json'], code: 1, at: 'bin/c7.js:96 → :41', stderr: /--json applies to "c7 resolve" only/ },
  { argv: ['reslove', 'react'], code: 1, at: 'bin/c7.js:198 → :41', stderr: /did you mean "c7 resolve"\?/ },

  // ── 1: the request was fine, the answer was not usable ─────────────────────────
  {
    argv: ['resolve', 'nope'],
    stub: searchHits([]),
    code: 1,
    at: 'bin/c7.js:91',
    stderr: /No libraries found for "nope"/,
  },
  {
    argv: ['nope'],
    stub: searchHits([]),
    code: 1,
    at: 'bin/c7.js:104',
    stderr: /No libraries found for "nope"/,
  },
  {
    argv: ['react'],
    stub: searchHits([{ title: 'React, with no id' }]),
    code: 1,
    at: 'bin/c7.js:111',
    stderr: /The best match for "react" carries no library ID/,
  },
  {
    argv: ['docs', '/reactjs/react.dev'],
    stub: markdown(''),
    code: 1,
    at: 'bin/c7.js:119',
    stderr: /No docs found/,
  },
  {
    argv: ['docs', '/reactjs/react.dev'],
    stub: asJson(JSON.stringify({ meta: 'an envelope is not documentation' })),
    code: 1,
    at: 'lib/api.js:88 → bin/c7.js:119',
    stderr: /No docs found/,
  },

  // ── 1, via the catch at bin/c7.js:210: lib/api.js threw ────────────────────────
  {
    argv: ['docs', '/a/../../v1/search'],
    code: 1,
    at: 'lib/api.js:25 → bin/c7.js:210',
    stderr: /Invalid Context7 library ID/,
  },
  {
    argv: ['docs', '/reactjs/react.dev'],
    stub: fetchStub([{ status: 401, body: '{}' }]),
    code: 1,
    at: 'lib/api.js:49 → bin/c7.js:210',
    stderr: /Docs fetch failed: 401 — missing or invalid API key/,
  },
  {
    argv: ['resolve', 'react'],
    stub: fetchStub([{ status: 429, body: '{}' }]),
    code: 1,
    at: 'lib/api.js:49 → bin/c7.js:210',
    stderr: /Search failed: 429 — rate limited/,
  },
  {
    argv: ['docs', '/reactjs/react.dev'],
    stub: asJson('{ not json'),
    code: 1,
    at: 'lib/api.js:74 → bin/c7.js:210',
    stderr: /Docs fetch returned malformed JSON/,
  },
  {
    argv: ['docs', '/reactjs/react.dev'],
    stub: fetchStub([{ contentType: 'image/png', body: 'PNG' }]),
    code: 1,
    at: 'lib/api.js:93 → bin/c7.js:210',
    stderr: /unexpected content-type "image\/png"/,
  },
  {
    argv: ['docs', '/reactjs/react.dev'],
    stub: fetchStub([{ rejectWith: 'fetch failed', cause: 'getaddrinfo ENOTFOUND context7.com' }]),
    code: 1,
    at: 'lib/api.js:47 → bin/c7.js:210',
    stderr: /Error: fetch failed/,
  },
];

for (const { argv, stub, code, at, stdout, stderr } of CONTRACT) {
  test(`exit ${code}: c7 ${argv.join(' ') || '(no arguments)'} — ${at}`, () => {
    const run = stub ? runCli(argv, { stub }) : runCli(argv);
    if (!stub) assertNoLiveRequest(run);
    assert.equal(run.code, code, `expected exit ${code} from ${at}, got ${run.code}`);
    if (stdout) assert.match(run.stdout, stdout);
    if (stderr) assert.match(run.stderr, stderr);
  });
}

// A timeout is the one error that adds a second stderr line (bin/c7.js:209). Pinned
// here because the cause line is part of what exit 1 tells the user.
test('exit 1: a timeout names the cause as well (lib/api.js:42 → bin/c7.js:210)', () => {
  const run = runCli(['docs', '/reactjs/react.dev'], {
    stub: `globalThis.fetch = async () => {
      const err = new Error('aborted');
      err.name = 'TimeoutError';
      throw err;
    };`,
  });
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Docs fetch failed: context7\.com did not respond within 15s/);
  assert.match(run.stderr, /^Cause: /m);
});

// DELIBERATE EQUALITY, pinned not resolved (see the comment at lib/api.js:85-88): a JSON
// envelope carrying neither `snippets` nor `content` is "no documentation", and it leaves
// by the same door as an empty markdown body. Same code, same message, byte for byte.
// Printing the envelope instead would pass it off as docs at exit 0.
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

// The last row of the map, bin/c7.js:130 (--version with an unreadable package.json),
// cannot be driven from this repo's own tree — it needs a tree without a package.json.
// It is pinned where that tree is already built: test/cli.version.test.js:43.

// The contract is "0 and 1, nothing else". Held against the source so a code added on a
// path with no row above still fails here.
test('bin/c7.js sets no exit code other than 0 and 1', () => {
  const source = readFileSync(CLI, 'utf8');
  const codes = [...source.matchAll(/process\.exit\(([^)]*)\)/g)].map(m => m[1].trim());
  assert.notEqual(codes.length, 0, 'no process.exit() found — the regex, not the CLI, changed');
  assert.deepEqual([...new Set(codes)].sort(), ['0', '1']);
});
