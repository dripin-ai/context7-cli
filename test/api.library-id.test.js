// Library-ID validation and encoding — the security-critical path of this CLI.
// The invariant under test: a library ID can never steer a request out of /api/v1,
// and it can never swallow the tokens/topic parameters.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeLibraryId, getDocs } from '../lib/api.js';
import { useFetch, text } from './helpers/fetch.js';

const BASE = 'https://context7.com/api/v1';

test('accepts the two documented ID shapes unchanged', () => {
  assert.equal(encodeLibraryId('/vercel/next.js'), '/vercel/next.js');
  assert.equal(
    encodeLibraryId('/vercel/next.js/v14.3.0-canary.87'),
    '/vercel/next.js/v14.3.0-canary.87',
  );
});

// Every entry must be refused outright: no fetch may be attempted for any of them.
const REFUSED = [
  ['traversal with extra segments', '/a/../../v2/x'],
  ['single dot segment', '/a/./b'],
  ['parent segment only', '/a/..'],
  ['four segments', '/a/b/c/d'],
  ['empty project segment', '/vercel/'],
  ['protocol-relative host', '//evil.com/x'],
  ['empty org segment', '//b'],
  ['double slash inside', '/a//b'],
  ['single segment', '/react'],
  ['no leading slash', 'vercel/next.js'],
  ['trailing slash', '/a/b/'],
  ['empty string', ''],
  ['bare slash', '/'],
  ['absolute URL', 'https://evil.com/a/b'],
  ['null', null],
  ['undefined', undefined],
  ['number', 123],
  ['object', { id: '/a/b' }],
];

for (const [label, id] of REFUSED) {
  test(`encodeLibraryId refuses ${label}: ${JSON.stringify(id)}`, () => {
    assert.throws(() => encodeLibraryId(id), /Invalid Context7 library ID/);
  });
}

test('refusal happens before any request is attempted', async t => {
  const calls = useFetch(t);
  for (const [label, id] of REFUSED) {
    await assert.rejects(
      () => getDocs(id, 'hooks', undefined, 400),
      /Invalid Context7 library ID/,
      `${label} must be rejected`,
    );
  }
  assert.equal(calls.length, 0, 'no hostile ID may reach fetch');
});

test('builds the exact request URL for a plain ID', async t => {
  const calls = useFetch(t, () => text('# docs'));
  await getDocs('/vercel/next.js', 'hooks', undefined, 400);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE}/vercel/next.js?tokens=400&topic=hooks`);
});

test('builds the exact request URL for a versioned ID', async t => {
  const calls = useFetch(t, () => text('# docs'));
  await getDocs('/vercel/next.js/v14.3.0-canary.87', undefined, undefined, 5000);
  assert.equal(calls[0].url, `${BASE}/vercel/next.js/v14.3.0-canary.87?tokens=5000`);
});

test('omits the topic parameter when no topic is given', async t => {
  const calls = useFetch(t, () => text('# docs'));
  await getDocs('/vercel/next.js', undefined, undefined, 5000);
  assert.equal(new URL(calls[0].url).searchParams.has('topic'), false);
});

// URL syntax inside a segment is percent-encoded rather than refused. That is the
// weaker of the two possible answers, but it is still safe: the escaped character
// cannot start a query, a fragment or a new path segment. Pinned so a later change
// from "encode" to "refuse" is a deliberate decision and not a silent one.
const ENCODED = [
  ['/a/b?x=y', '/a/b%3Fx%3Dy'],
  ['/a/b#x', '/a/b%23x'],
  ['/astral-sh/ruff#x', '/astral-sh/ruff%23x'],
  ['/a/b&tokens=1', '/a/b%26tokens%3D1'],
  ['/a/b c', '/a/b%20c'],
  ['/a/%2e%2e', '/a/%252e%252e'],
  ['/a/b%2f..%2fc', '/a/b%252f..%252fc'],
  ['/a/..%2f..', '/a/..%252f..'],
];

for (const [input, expected] of ENCODED) {
  test(`percent-encodes stray syntax: ${input}`, () => {
    assert.equal(encodeLibraryId(input), expected);
  });
}

test('an encoded ID can neither leave /api/v1 nor drop tokens and topic', async t => {
  const calls = useFetch(t, () => text('# docs'));
  for (const [input] of ENCODED) {
    await getDocs(input, 'hooks', undefined, 400);
    const url = new URL(calls.at(-1).url);
    assert.equal(url.origin, 'https://context7.com', `${input}: origin must not change`);
    assert.ok(url.pathname.startsWith('/api/v1/'), `${input}: path escaped /api/v1 — ${url.pathname}`);
    assert.equal(url.pathname.split('/').length - 3, input.slice(1).split('/').length,
      `${input}: segment count must not grow`);
    assert.equal(url.searchParams.get('tokens'), '400', `${input}: tokens dropped`);
    assert.equal(url.searchParams.get('topic'), 'hooks', `${input}: topic dropped`);
  }
  assert.equal(calls.length, ENCODED.length);
});

test('the request carries an Authorization header only when a key is given', async t => {
  const calls = useFetch(t, () => text('# docs'));
  await getDocs('/a/b', undefined, 'secret-key');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-key');
  await getDocs('/a/b', undefined, undefined);
  assert.equal('Authorization' in calls[1].init.headers, false);
});
