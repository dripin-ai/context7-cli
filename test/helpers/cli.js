// Child-process harness for bin/c7.js.
//
// WHY this file has no top-level side effects: `node --test` collects every file under
// test/ (its default glob includes `**/test/**/*.?(c|m)js`), so a helper is *executed*
// as a test file too. It must therefore define no tests and do nothing on import.
//
// WHY a `data:` --import instead of a fixture module: the CLI calls the global `fetch`,
// and no test may touch the live Context7 API. The stub source is evaluated before
// bin/c7.js loads, which keeps the stub in the test that needs it and keeps test/ free
// of extra executable files.

import { spawnSync } from 'node:child_process';

export const CLI = new URL('../../bin/c7.js', import.meta.url).pathname;

/**
 * A stub that fails loudly instead of reaching the network. Exit code 97 marks
 * "this path was supposed to return before any request".
 */
export const NO_FETCH = `
globalThis.fetch = async (url) => {
  process.stderr.write('UNEXPECTED_FETCH ' + url + '\\n');
  process.exit(97);
};`;

/**
 * Build fetch-stub source from a declarative table. Each entry may carry:
 *   match       substring of the URL it answers (absent = catch-all)
 *   status      HTTP status (default 200)
 *   contentType response content-type (omit for a response without the header)
 *   body        response body; `true` means "echo the requested URL"
 *   expectAuth  required `Authorization` header value; a mismatch exits 95
 *   rejectWith  reject instead of responding, with this message
 *   cause       `err.cause.message` for the rejection
 * An unmatched request exits 97 so a missing stub can never become a live request.
 */
export function fetchStub(table) {
  return `
const table = ${JSON.stringify(table)};
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (!(init && init.signal instanceof AbortSignal)) {
    process.stderr.write('MISSING_SIGNAL ' + target + '\\n');
    process.exit(96);
  }
  const hit = table.find(e => e.match && target.includes(e.match)) ?? table.find(e => !e.match);
  if (!hit) {
    process.stderr.write('UNEXPECTED_FETCH ' + target + '\\n');
    process.exit(97);
  }
  if ('expectAuth' in hit) {
    const got = (init.headers && init.headers.Authorization) ?? null;
    if (got !== hit.expectAuth) {
      process.stderr.write('BAD_AUTH ' + JSON.stringify(got) + '\\n');
      process.exit(95);
    }
  }
  if (hit.rejectWith) {
    const err = new Error(hit.rejectWith);
    if (hit.cause) err.cause = new Error(hit.cause);
    throw err;
  }
  const headers = hit.contentType ? { 'content-type': hit.contentType } : {};
  const body = hit.body === true ? target : (hit.body ?? '');
  return new Response(body, { status: hit.status ?? 200, headers });
};`;
}

/** Stub answering /search with `results`, and any docs request by echoing its URL. */
export function stubSearchAndDocs(results) {
  return fetchStub([
    { match: '/search?', contentType: 'application/json', body: JSON.stringify({ results }) },
    { contentType: 'text/markdown', body: true },
  ]);
}

/** Run the CLI in a child process. Returns { code, stdout, stderr }. */
export function runCli(args, { stub = NO_FETCH, env = {} } = {}) {
  const nodeArgs = stub ? ['--import', `data:text/javascript,${encodeURIComponent(stub)}`] : [];
  const result = spawnSync(process.execPath, [...nodeArgs, CLI, ...args], {
    encoding: 'utf8',
    // A real key in the developer's environment must not change any outcome.
    env: { ...process.env, CONTEXT7_API_KEY: '', ...env },
  });
  if (result.error) throw result.error;
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Assert the run neither reached the network nor lost its abort signal. */
export function assertNoLiveRequest(run) {
  if ([95, 96, 97].includes(run.code)) {
    throw new Error(`CLI request was unstubbed, unsignalled or misauthenticated: ${run.stderr.trim()}`);
  }
}
