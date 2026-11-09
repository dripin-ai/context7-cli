// Runs lib/api.js's request path on the engines.node floor. Run it with the floor Node:
// any API newer than the floor throws here, which is the whole point of the file.

import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { resolve, getDocs } from '../lib/api.js';

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(req.url.includes('/broken') ? '{' : JSON.stringify({ results: [{ id: '/a/b' }] }));
});
await new Promise(listening => server.listen(0, '127.0.0.1', listening));
const origin = `http://127.0.0.1:${server.address().port}/api/v1`;

// Only seam: lib/api.js hardcodes BASE. The host rewrite keeps the native fetch and the
// real Response (resp.ok, .json(), .headers.get(), .text()) — api.js's own 18.0.0 floor.
const native = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const local = String(url).replace('https://context7.com/api/v1', origin);
  // Unmatched prefix means the rewrite is stale and the native fetch would hit the live
  // API instead — measured once: it answered with real library data and the run looked
  // like a pass. Fail here rather than leave the floor job talking to context7.com.
  assert.ok(local.startsWith(origin), `must stay on the loopback server, got ${url}`);
  return native(local, init);
};

assert.deepEqual(await resolve('x'), [{ id: '/a/b' }], 'fetch + AbortSignal.timeout');
// `{ cause: err }` — the same syntax lib/api.js uses on its timeout branch.
await assert.rejects(() => getDocs('/a/broken'), err => err.cause instanceof Error);

server.close();
console.log(`lib/api.js request path OK on node ${process.version}`);
