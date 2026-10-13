// In-process fetch stubbing for lib/api.js.
//
// WHY no top-level side effects: see the note in helpers/cli.js — `node --test`
// executes every file under test/, helpers included.

/** Replace `globalThis.fetch`; returns the restore function (pass it to `t.after`). */
export function installFetch(handler) {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = previous;
  };
}

/**
 * A fetch stub that records every call. `responder(url, init)` returns the Response;
 * the default answers with an empty markdown body.
 */
export function recordingFetch(responder) {
  const calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url: String(url), init });
    return responder
      ? responder(String(url), init)
      : new Response('', { status: 200, headers: { 'content-type': 'text/markdown' } });
  };
  return { calls, fetchStub };
}

export const json = (value, status = 200) =>
  new Response(typeof value === 'string' ? value : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const text = (body, contentType = 'text/markdown', status = 200) =>
  new Response(body, { status, headers: contentType ? { 'content-type': contentType } : {} });

/** Install a stub for one test and restore it afterwards. */
export function useFetch(t, responder) {
  const { calls, fetchStub } = recordingFetch(responder);
  t.after(installFetch(fetchStub));
  return calls;
}
