// resolve(): query encoding, result extraction and status mapping.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from '../lib/api.js';
import { useFetch, installFetch, json, text } from './helpers/fetch.js';

const SEARCH = 'https://context7.com/api/v1/search';

test('builds the exact search URL with a fixed limit', async t => {
  const calls = useFetch(t, () => json({ results: [] }));
  await resolve('react');
  assert.equal(calls[0].url, `${SEARCH}?query=react&limit=10`);
});

test('percent-encodes the query instead of letting it extend the URL', async t => {
  const calls = useFetch(t, () => json({ results: [] }));
  for (const query of ['state management', 'a&limit=1', 'a#b', 'a=b?c', 'c++', 'ünïcode']) {
    await resolve(query);
    const url = new URL(calls.at(-1).url);
    assert.equal(url.pathname, '/api/v1/search', `${query}: path must not move`);
    assert.equal(url.searchParams.get('query'), query, `${query}: must survive intact`);
    assert.equal(url.searchParams.get('limit'), '10', `${query}: limit must not be overridden`);
    assert.equal([...url.searchParams.keys()].length, 2, `${query}: no extra parameters`);
  }
});

test('returns the results array', async t => {
  const results = [{ id: '/vercel/next.js', description: 'Next.js' }];
  useFetch(t, () => json({ results }));
  assert.deepEqual(await resolve('next'), results);
});

test('a response without results yields an empty array', async t => {
  useFetch(t, () => json({}));
  assert.deepEqual(await resolve('nope'), []);
});

test('an explicitly empty result set yields an empty array', async t => {
  useFetch(t, () => json({ results: [] }));
  assert.deepEqual(await resolve('nope'), []);
});

// DEFECT (lib/api.js:42): `data.results || []` trusts the shape. A non-array `results`
// is handed to the caller unchanged; only bin/c7.js:75 catches it. Pinned so the
// unguarded return value is visible.
test('DEFECT: a non-array results field is passed through unvalidated', async t => {
  useFetch(t, () => json({ results: 'boom' }));
  assert.equal(await resolve('x'), 'boom');
});

test('a non-JSON search response fails instead of returning docs', async t => {
  useFetch(t, () => text('<html>login</html>', 'text/html'));
  await assert.rejects(() => resolve('react'), /Unexpected token|not valid JSON/);
});

for (const [status, hint] of [[401, /CONTEXT7_API_KEY/], [403, /API key rejected/], [429, /rate limited/], [404, /unknown library ID/]]) {
  test(`maps search HTTP ${status}`, async t => {
    useFetch(t, () => json({}, status));
    await assert.rejects(() => resolve('react'), err => {
      assert.match(err.message, new RegExp(`^Search failed: ${status} —`));
      assert.match(err.message, hint);
      return true;
    });
  });
}

test('an unmapped search status fails with its code alone', async t => {
  useFetch(t, () => json({}, 503));
  await assert.rejects(() => resolve('react'), err => {
    assert.equal(err.message, 'Search failed: 503');
    return true;
  });
});

test('a search fetch rejection surfaces err.cause', async t => {
  const network = new Error('fetch failed');
  network.cause = new Error('ECONNREFUSED');
  t.after(installFetch(async () => {
    throw network;
  }));
  await assert.rejects(() => resolve('react'), err => {
    assert.equal(err.cause.message, 'ECONNREFUSED');
    return true;
  });
});

test('the search request carries an AbortSignal and the API key', async t => {
  const calls = useFetch(t, () => json({ results: [] }));
  await resolve('react', 'k');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer k');
});

test('the search request uses the 15 s timeout', async t => {
  const requested = [];
  const original = AbortSignal.timeout;
  AbortSignal.timeout = ms => {
    requested.push(ms);
    return original.call(AbortSignal, ms);
  };
  t.after(() => {
    AbortSignal.timeout = original;
  });
  useFetch(t, () => json({ results: [] }));
  await resolve('react');
  assert.deepEqual(requested, [15000]);
});
