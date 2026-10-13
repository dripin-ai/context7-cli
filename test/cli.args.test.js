// bin/c7.js argument parsing. Every run is stubbed: a case that must fail before any
// request gets NO_FETCH (exit 97 if it still calls out), the rest get a recorded stub.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, assertNoLiveRequest, stubSearchAndDocs, fetchStub } from './helpers/cli.js';

const RESULT = [{ id: '/reactjs/react.dev', description: 'React docs' }];
const found = stubSearchAndDocs(RESULT);

const INVALID_TOKENS = ['abc', '0', '1e9', '10000abc', '5.5', '0x10', ' 7', '', '+7', '1_000'];

for (const value of INVALID_TOKENS) {
  test(`--tokens ${JSON.stringify(value)} is a usage error`, () => {
    const run = runCli([`--tokens=${value}`, 'react']);
    assertNoLiveRequest(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /--tokens expects a positive integer/);
    assert.match(run.stderr, /Run "c7 --help" for usage\./);
    assert.equal(run.stdout, '');
  });
}

test('--tokens -5 is a usage error', () => {
  const run = runCli(['--tokens=-5', 'react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /--tokens expects a positive integer, got "-5"/);
});

test('--tokens with a separate dash value is rejected by the parser', () => {
  // `--tokens -5` is ambiguous for parseArgs; the message points at `--tokens=-5`.
  const run = runCli(['--tokens', '-5', 'react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /--tokens/);
});

test('--tokens without a value is a usage error', () => {
  const run = runCli(['docs', 'react', '--tokens']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /argument missing|ambiguous/);
});

// DEFECT (bin/c7.js:151 vs :159): the no-positionals shortcut prints help and exits 0
// before --tokens is validated, so an invalid value is silently accepted when it stands
// alone. Pinned as-is; `c7 --tokens abc` should be exit 1 like every case above.
test('DEFECT: an invalid --tokens without a positional exits 0 with help', () => {
  for (const value of ['abc', '0', '-5']) {
    const run = runCli([`--tokens=${value}`]);
    assertNoLiveRequest(run);
    assert.equal(run.code, 0, `--tokens=${value} alone`);
    assert.match(run.stdout, /c7 resolve <query>/);
    assert.equal(run.stderr, '');
  }
});

test('a valid --tokens reaches the docs request', () => {
  const run = runCli(['react', 'hooks', '--tokens', '400'], { stub: found });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  // The stub echoes the URL it was asked for, so stdout is the request itself.
  assert.match(run.stdout, /\/api\/v1\/reactjs\/react\.dev\?tokens=400&topic=hooks/);
});

test('the default token budget is 5000', () => {
  const run = runCli(['docs', 'react'], { stub: found });
  assert.match(run.stdout, /\?tokens=5000$/m);
});

test('--tokens 1 is accepted as the lower bound', () => {
  const run = runCli(['docs', 'react', '--tokens', '1'], { stub: found });
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\?tokens=1&?/);
});

test('an unknown option is a usage error', () => {
  const run = runCli(['--verbose', 'react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Unknown option '--verbose'/);
  assert.match(run.stderr, /Run "c7 --help" for usage\./);
});

test('an unknown short option is a usage error', () => {
  const run = runCli(['-x', 'react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Unknown option '-x'/);
});

for (const args of [['docs', 'react', '-v'], ['resolve', 'react', '--version'], ['react', '-v']]) {
  test(`--version is rejected next to a command: ${args.join(' ')}`, () => {
    const run = runCli(args);
    assertNoLiveRequest(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /--version takes no arguments/);
  });
}

test('--help is rejected next to a command', () => {
  const run = runCli(['docs', 'react', '--help']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /--help takes no arguments/);
});

test('-h alone prints the help text', () => {
  const run = runCli(['-h']);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /c7 docs <library> \[topic\]/);
});

test('no arguments print help without touching the network', () => {
  const run = runCli([]);
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /context7 — Up-to-date library docs/);
});

test('-- ends the options and keeps the shorthand working', () => {
  const run = runCli(['--', 'react', 'hooks'], { stub: found });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\?tokens=5000&topic=hooks/);
});

test('a library name starting with a dash is an option error without --', () => {
  const run = runCli(['docs', '-react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Unknown option '-r'/);
});

test('-- makes a dash-leading library name usable', () => {
  const run = runCli(['docs', '--', '-react'], {
    stub: stubSearchAndDocs([{ id: '/dash/-react' }]),
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\/api\/v1\/dash\/-react\?/);
});

test('-- before a Context7 ID keeps the ID path intact', () => {
  const run = runCli(['docs', '--', '/vercel/next.js'], {
    stub: fetchStub([{ contentType: 'text/markdown', body: true }]),
  });
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\/api\/v1\/vercel\/next\.js\?tokens=5000/);
});

test('an invalid Context7 ID fails before any request', () => {
  const run = runCli(['docs', '/a/../../v1/search?query=react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /Invalid Context7 library ID/);
  assert.match(run.stderr, /expected \/org\/project or \/org\/project\/version/);
});

test('a topic made of several words is joined into one topic', () => {
  const run = runCli(['docs', 'react', 'server', 'components'], { stub: found });
  assert.match(run.stdout, /topic=server\+components$/m);
});

test('resolve without a query is a usage error', () => {
  const run = runCli(['resolve']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /usage: c7 resolve <query>/);
});

test('docs without a library is a usage error', () => {
  const run = runCli(['docs']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /usage: c7 docs <library> \[topic\]/);
});

// DEFECT (bin/c7.js:168): an empty string counts as a query, so `c7 resolve ""` spends
// a request on `query=`. The guard tests `rest.length`, not whether anything was typed.
test('DEFECT: an empty query is sent to the API instead of being refused', () => {
  const run = runCli(['resolve', ''], {
    stub: fetchStub([{ match: 'query=&', contentType: 'application/json', body: '{"results":[]}' }]),
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /No libraries found for ""/);
});

const EMPTY_SEARCH = auth => fetchStub([
  { match: '/search?', contentType: 'application/json', body: '{"results":[]}', expectAuth: auth },
]);

test('the API key comes from the environment when no flag is given', () => {
  const run = runCli(['resolve', 'react'], {
    stub: EMPTY_SEARCH('Bearer env-key'),
    env: { CONTEXT7_API_KEY: 'env-key' },
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
});

test('--api-key wins over the environment', () => {
  const run = runCli(['resolve', 'react', '--api-key', 'flag-key'], {
    stub: EMPTY_SEARCH('Bearer flag-key'),
    env: { CONTEXT7_API_KEY: 'env-key' },
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
});

test('no key at all sends no Authorization header', () => {
  const run = runCli(['resolve', 'react'], { stub: EMPTY_SEARCH(null) });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
});

test('--api-key without a value is a usage error', () => {
  const run = runCli(['resolve', 'react', '--api-key']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /argument missing|ambiguous/);
});
