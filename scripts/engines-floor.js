// Runs lib/api.js's request path on the engines.node floor. Run it with the floor Node:
// any API newer than the floor throws here, which is the whole point of the file.
// The CLI half of the floor claim (util.parseArgs, bin/c7.js) is covered by the job's
// other steps; this covers fetch, AbortSignal.timeout and `new Error(…, { cause })`.

import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { resolve, getDocs } from '../lib/api.js';

const server = createServer((req, res) => {
  res.writeHead(req.url.includes('/missing') ? 404 : 200, { 'content-type': 'application/json' });
  res.end(req.url.includes('/broken') ? '{' : JSON.stringify({ results: [{ id: '/a/b' }] }));
});
await new Promise(listening => server.listen(0, '127.0.0.1', listening));
const origin = `http://127.0.0.1:${server.address().port}/api/v1`;

// lib/api.js hardcodes its base URL, so the global fetch is the only seam. Rewriting the
// host keeps the native fetch and the signal lib/api.js itself built in play — a stubbed
// fetch would prove nothing about either running on the floor.
const native = globalThis.fetch;
globalThis.fetch = (url, init) => {
  assert.ok(init.signal instanceof AbortSignal, 'lib/api.js must pass an AbortSignal');
  return native(String(url).replace('https://context7.com/api/v1', origin), init);
};

assert.deepEqual(await resolve('x'), [{ id: '/a/b' }], 'fetch + AbortSignal.timeout');
await assert.rejects(() => getDocs('/a/missing'), /404/, 'the non-ok branch');
// `{ cause: err }` — the same syntax lib/api.js uses on its timeout branch.
await assert.rejects(() => getDocs('/a/broken'), err => err.cause instanceof Error);

server.close();
console.log(`lib/api.js request path OK on node ${process.version}`);
