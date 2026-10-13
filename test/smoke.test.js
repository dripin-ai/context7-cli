// One happy path and one error path per public entry point. Depth lives in the
// api.*/cli.* suites; this file is the quick signal that the wiring is intact.
// Nothing here touches the network: every run carries a stubbed fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, assertNoLiveRequest, fetchStub, stubSearchAndDocs } from './helpers/cli.js';

const DOCS = '# useState\n\nconst [a, b] = useState()';

test('smoke: c7 resolve lists libraries', () => {
  const run = runCli(['resolve', 'react'], {
    stub: fetchStub([
      {
        match: '/search?',
        contentType: 'application/json',
        body: JSON.stringify({ results: [{ id: '/reactjs/react.dev', description: 'React' }] }),
      },
    ]),
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\/reactjs\/react\.dev {2}React/);
});

test('smoke: c7 resolve fails when the API rejects the key', () => {
  const run = runCli(['resolve', 'react'], {
    stub: fetchStub([{ status: 401, contentType: 'application/json', body: '{}' }]),
  });
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Search failed: 401/);
});

test('smoke: c7 docs prints documentation for a Context7 ID', () => {
  const run = runCli(['docs', '/reactjs/react.dev', 'hooks'], {
    stub: fetchStub([{ contentType: 'text/markdown', body: DOCS }]),
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.equal(run.stdout, `${DOCS}\n`);
});

test('smoke: c7 docs fails on a malformed Context7 ID', () => {
  const run = runCli(['docs', '/a/../../v1/search?query=react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Invalid Context7 library ID/);
});

test('smoke: the shorthand resolves a name and prints documentation', () => {
  const run = runCli(['react', 'hooks'], { stub: stubSearchAndDocs([{ id: '/reactjs/react.dev' }]) });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\/api\/v1\/reactjs\/react\.dev\?tokens=5000&topic=hooks/);
});

test('smoke: the shorthand refuses a typo’d subcommand', () => {
  const run = runCli(['reslove', 'react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /did you mean "c7 resolve"\?/);
});

test('smoke: --help prints usage and exits 0', () => {
  const run = runCli(['--help']);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /c7 resolve <query>/);
});
