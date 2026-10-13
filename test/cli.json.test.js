// The --json contract: machine-readable on `resolve`, refused everywhere else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, assertNoLiveRequest, fetchStub, stubSearchAndDocs } from './helpers/cli.js';

const RESULTS = [
  { id: '/reactjs/react.dev', title: 'React', description: 'React docs', totalSnippets: 42 },
  { id: '/facebook/react', title: 'react', description: null },
];

const search = (payload, status = 200) =>
  fetchStub([
    { match: '/search?', status, contentType: 'application/json', body: JSON.stringify(payload) },
  ]);

test('--json output parses and equals the results the API returned', () => {
  const run = runCli(['resolve', 'react', '--json'], { stub: search({ results: RESULTS }) });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.equal(run.stderr, '');
  assert.deepEqual(JSON.parse(run.stdout), RESULTS);
});

test('--json is pretty-printed with two spaces and nothing else on stdout', () => {
  const run = runCli(['resolve', 'react', '--json'], { stub: search({ results: RESULTS }) });
  assert.equal(run.stdout, `${JSON.stringify(RESULTS, null, 2)}\n`);
});

test('--json on an empty result set prints [] and exits 1', () => {
  const run = runCli(['resolve', 'nosuchlib', '--json'], { stub: search({ results: [] }) });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.deepEqual(JSON.parse(run.stdout), []);
  assert.match(run.stderr, /No libraries found for "nosuchlib"/);
});

test('the text path on an empty result set prints nothing and exits 1', () => {
  const run = runCli(['resolve', 'nosuchlib'], { stub: search({ results: [] }) });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /No libraries found for "nosuchlib"/);
});

test('a missing results field is treated as empty in both paths', () => {
  for (const args of [['resolve', 'x'], ['resolve', 'x', '--json']]) {
    const run = runCli(args, { stub: search({}) });
    assert.equal(run.code, 1, args.join(' '));
  }
});

test('a non-array results field is treated as empty, not printed', () => {
  const run = runCli(['resolve', 'x', '--json'], { stub: search({ results: 'boom' }) });
  assert.equal(run.code, 1);
  assert.deepEqual(JSON.parse(run.stdout), []);
  assert.ok(!run.stdout.includes('boom'), 'a malformed payload must not be echoed');
});

test('the text path aligns IDs and falls back from description to title', () => {
  const run = runCli(['resolve', 'react'], { stub: search({ results: RESULTS }) });
  assert.equal(run.code, 0);
  assert.equal(
    run.stdout,
    '  /reactjs/react.dev  React docs\n' + '  /facebook/react     react\n',
  );
});

test('a result with neither description nor title prints the ID alone', () => {
  const run = runCli(['resolve', 'x'], { stub: search({ results: [{ id: '/a/b' }] }) });
  assert.equal(run.stdout, '  /a/b  \n');
});

test('--json is refused on docs before any request', () => {
  for (const args of [['docs', 'react', '--json'], ['react', '--json'], ['docs', '/a/b', '--json']]) {
    const run = runCli(args);
    assertNoLiveRequest(run);
    assert.equal(run.code, 1, args.join(' '));
    assert.match(run.stderr, /--json applies to "c7 resolve" only/);
    assert.equal(run.stdout, '');
  }
});

test('an empty docs body is not documentation', () => {
  const run = runCli(['docs', '/a/b'], {
    stub: fetchStub([{ contentType: 'text/markdown', body: '' }]),
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /No docs found/);
  assert.equal(run.stdout, '');
});

test('a docs body is printed verbatim on stdout', () => {
  const run = runCli(['docs', '/a/b'], {
    stub: fetchStub([{ contentType: 'text/markdown', body: '# Title\n\nbody text' }]),
  });
  assert.equal(run.code, 0);
  assert.equal(run.stdout, '# Title\n\nbody text\n');
  assert.equal(run.stderr, '');
});

test('an HTML docs response fails with the content-type named', () => {
  const run = runCli(['docs', '/a/b'], {
    stub: fetchStub([{ contentType: 'text/html', body: '<html>login</html>' }]),
  });
  assert.equal(run.code, 1);
  assert.match(run.stderr, /unexpected content-type "text\/html"/);
  assert.equal(run.stdout, '');
});

test('an HTTP error names the key variable and exits 1', () => {
  const run = runCli(['docs', '/a/b'], {
    stub: fetchStub([{ status: 401, contentType: 'application/json', body: '{}' }]),
  });
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Error: Docs fetch failed: 401 — .*CONTEXT7_API_KEY/);
});

test('a network failure prints both the error and its cause', () => {
  const run = runCli(['docs', '/a/b'], {
    stub: fetchStub([{ rejectWith: 'fetch failed', cause: 'getaddrinfo ENOTFOUND context7.com' }]),
  });
  assert.equal(run.code, 1);
  assert.match(run.stderr, /^Error: fetch failed$/m);
  assert.match(run.stderr, /^Cause: getaddrinfo ENOTFOUND context7\.com$/m);
});

test('the resolution hint goes to stderr, never into the piped docs', () => {
  // stderr is not a TTY in a spawned child, so bin/c7.js:103 stays silent — stdout must
  // carry documentation only, so that `c7 docs react | pbcopy` is safe.
  const run = runCli(['react'], { stub: stubSearchAndDocs([{ id: '/x/react' }]) });
  assert.equal(run.code, 0);
  assert.equal(run.stderr, '');
  assert.ok(!run.stdout.includes('→'), 'the hint must not reach stdout');
});
