// getDocs: response handling, HTTP status mapping and request cancellation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocs } from '../lib/api.js';
import { useFetch, installFetch, json, text } from './helpers/fetch.js';

const ID = '/vercel/next.js';

test('returns a markdown body as-is', async t => {
  const body = '# Hooks\n\nUse `useState`.\n';
  useFetch(t, () => text(body, 'text/markdown'));
  assert.equal(await getDocs(ID), body);
});

test('returns a text/plain body as-is, charset and casing included', async t => {
  useFetch(t, () => text('plain docs', 'text/plain; charset=utf-8'));
  assert.equal(await getDocs(ID), 'plain docs');
});

test('joins snippets with the documented separator', async t => {
  useFetch(t, () =>
    json({
      snippets: [
        { title: 'useState', content: 'const [a, b] = useState()' },
        { filePath: 'docs/effects.md', content: 'useEffect runs after paint' },
        { content: 'no header at all' },
      ],
    }),
  );
  assert.equal(
    await getDocs(ID),
    [
      '## useState\nconst [a, b] = useState()',
      '## docs/effects.md\nuseEffect runs after paint',
      'no header at all',
    ].join('\n\n---\n\n'),
  );
});

test('prefers title over filePath as the snippet header', async t => {
  useFetch(t, () => json({ snippets: [{ title: 'T', filePath: 'p.md', content: 'c' }] }));
  assert.equal(await getDocs(ID), '## T\nc');
});

test('a snippet without content degrades to its header alone', async t => {
  useFetch(t, () => json({ snippets: [{ title: 'T' }] }));
  assert.equal(await getDocs(ID), '## T');
});

test('returns the content field of a JSON response', async t => {
  useFetch(t, () => json({ content: '# from content field' }));
  assert.equal(await getDocs(ID), '# from content field');
});

test('a 200 text/html page is an error, not documentation', async t => {
  const page = '<!doctype html><title>Login</title>';
  useFetch(t, () => text(page, 'text/html'));
  await assert.rejects(() => getDocs(ID), err => {
    assert.match(err.message, /unexpected content-type "text\/html"/);
    assert.ok(!err.message.includes('doctype'), 'the HTML body must not be echoed as docs');
    return true;
  });
});

test('a response without a content-type is an error', async t => {
  // A string body makes undici add `text/plain` on its own, so the header-less case
  // needs a byte body — the point is the missing header, not an empty payload.
  useFetch(t, () => new Response(new TextEncoder().encode('<html>'), { status: 200 }));
  await assert.rejects(() => getDocs(ID), /unexpected content-type "\(none\)"/);
});

test('truncated JSON is an error that names the cause', async t => {
  useFetch(t, () => json('{"snippets":[{"content":"half'));
  await assert.rejects(() => getDocs(ID), err => {
    assert.match(err.message, /malformed JSON \(29 bytes\)/);
    assert.ok(err.cause instanceof SyntaxError, 'the JSON parse error must survive as err.cause');
    return true;
  });
});

test('an empty JSON body is an error, not empty documentation', async t => {
  useFetch(t, () => json(''));
  await assert.rejects(() => getDocs(ID), /malformed JSON \(0 bytes\)/);
});

test('an empty markdown body yields no documentation', async t => {
  useFetch(t, () => text('', 'text/markdown'));
  // The API layer returns the empty string; bin/c7.js:107 turns it into exit 1.
  // Pinned on both levels — see "empty body" in test/cli.docs.test.js.
  assert.equal(await getDocs(ID), '');
});

// DEFECT (lib/api.js:72): an empty result set is not an error. `{"snippets":[]}` and
// `{}` fall through to JSON.stringify, so the CLI prints the raw envelope as if it were
// documentation and exits 0. Pinned as-is so the punch-list item is visible in the suite;
// change these two assertions together with the fix.
test('DEFECT: empty snippets are stringified instead of rejected', async t => {
  useFetch(t, () => json({ snippets: [] }));
  assert.equal(await getDocs(ID), '{\n  "snippets": []\n}');
});

test('DEFECT: an empty JSON object is stringified instead of rejected', async t => {
  useFetch(t, () => json({}));
  assert.equal(await getDocs(ID), '{}');
});

const STATUS = [
  [401, /CONTEXT7_API_KEY/, /--api-key/],
  [403, /CONTEXT7_API_KEY/, /--api-key/],
  [404, /unknown library ID/, /c7 resolve/],
  [429, /rate limited/, /retry/],
];

for (const [status, hint, extra] of STATUS) {
  test(`maps HTTP ${status} to an actionable message`, async t => {
    useFetch(t, () => text('ignored body', 'text/html', status));
    await assert.rejects(() => getDocs(ID), err => {
      assert.match(err.message, new RegExp(`^Docs fetch failed: ${status} —`));
      assert.match(err.message, hint);
      assert.match(err.message, extra);
      return true;
    });
  });
}

test('an unmapped status still fails with its code', async t => {
  useFetch(t, () => text('', 'text/plain', 500));
  await assert.rejects(() => getDocs(ID), err => {
    assert.equal(err.message, 'Docs fetch failed: 500');
    return true;
  });
});

test('a failing status is never parsed as documentation', async t => {
  useFetch(t, () => json({ snippets: [{ content: 'leaked' }] }, 403));
  await assert.rejects(() => getDocs(ID), /Docs fetch failed: 403/);
});

test('a fetch rejection surfaces err.cause', async t => {
  const network = new Error('fetch failed');
  network.cause = new Error('getaddrinfo ENOTFOUND context7.com');
  t.after(installFetch(async () => {
    throw network;
  }));
  await assert.rejects(() => getDocs(ID), err => {
    assert.equal(err, network);
    assert.equal(err.cause.message, 'getaddrinfo ENOTFOUND context7.com');
    return true;
  });
});

test('every request carries a fresh, unaborted AbortSignal', async t => {
  const calls = useFetch(t, () => text('# docs'));
  await getDocs(ID);
  await getDocs(ID);
  for (const call of calls) {
    assert.ok(call.init.signal instanceof AbortSignal, 'no signal passed to fetch');
    assert.equal(call.init.signal.aborted, false);
  }
  assert.notEqual(calls[0].init.signal, calls[1].init.signal, 'signals must not be shared');
});

test('the request is cancelled after the configured timeout', async t => {
  // `AbortSignal.timeout` is the only seam: lib/api.js:2 keeps TIMEOUT_MS private and
  // does not accept an injected signal. Patching the factory makes the abort
  // deterministic — Node's `mock.timers` cannot drive AbortSignal.timeout, because it
  // runs on an internal timer the mock does not patch (measured on node v26.5.0).
  const requested = [];
  const original = AbortSignal.timeout;
  AbortSignal.timeout = ms => {
    requested.push(ms);
    const controller = new AbortController();
    // Fire immediately: the point under test is the wiring, not the wall-clock delay.
    controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    return controller.signal;
  };
  t.after(() => {
    AbortSignal.timeout = original;
  });

  t.after(installFetch(async (url, init) => {
    init.signal.throwIfAborted();
    return text('# never reached');
  }));

  await assert.rejects(() => getDocs(ID), err => {
    assert.equal(err.name, 'TimeoutError');
    assert.match(err.message, /aborted due to timeout/);
    return true;
  });
  assert.deepEqual(requested, [15000], 'the docs request must use the 15 s timeout');
});
