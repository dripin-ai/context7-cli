// Command dispatch and the near-miss rule (bin/c7.js:58-63): a first positional that is
// within 2 edits of `resolve`/`docs` and within 1 character of its length is treated as a
// typo'd subcommand, not as a library.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli, assertNoLiveRequest, stubSearchAndDocs } from './helpers/cli.js';

const found = id => stubSearchAndDocs([{ id, description: 'stub' }]);
const anyFound = found('/stub/lib');

const TYPOS = [
  ['reslove', 'resolve'],
  ['resolv', 'resolve'],
  ['resole', 'resolve'],
  ['resovle', 'resolve'],
  ['dcos', 'docs'],
  ['docss', 'docs'],
  ['doc', 'docs'],
  ['dos', 'docs'],
];

for (const [typo, meant] of TYPOS) {
  test(`"${typo}" is rejected as a typo for "${meant}"`, () => {
    const run = runCli([typo, 'react']);
    assertNoLiveRequest(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, new RegExp(`unknown command "${typo}"`));
    assert.match(run.stderr, new RegExp(`did you mean "c7 ${meant}"\\?`));
    // The escape hatch must be named in the same breath, or the rule is a dead end.
    assert.match(run.stderr, new RegExp(`run "c7 docs ${typo}"`));
    assert.equal(run.stdout, '');
  });
}

// THE TRADE-OFF, stated out loud: the near-miss rule cannot tell a typo from a real
// library whose name happens to sit 1-2 edits from `docs`. These are real packages and
// the shorthand refuses all of them. Accepted deliberately; the escape hatch below is
// the whole mitigation. If the rule is ever narrowed, these tests must flip.
const CASUALTIES = ['docz', 'dojo', 'dock', 'dios'];

for (const library of CASUALTIES) {
  test(`TRADE-OFF: the real library "${library}" is refused by the shorthand`, () => {
    const run = runCli([library], { stub: anyFound });
    assertNoLiveRequest(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, new RegExp(`unknown command "${library}"`));
    assert.match(run.stderr, new RegExp(`If "${library}" really is a library`));
  });

  test(`TRADE-OFF: "c7 docs ${library}" is the working escape hatch`, () => {
    const run = runCli(['docs', library], { stub: found(`/x/${library}`) });
    assertNoLiveRequest(run);
    assert.equal(run.code, 0);
    assert.match(run.stdout, new RegExp(`/api/v1/x/${library}\\?tokens=5000`));
  });
}

// Everything far enough from both subcommands keeps the documented shorthand.
const SHORTHAND = ['react', 'next', 'vue', 'zod', 'd3', 'express', 'fastapi', 'deno', 'dotenv', 'dask'];

for (const library of SHORTHAND) {
  test(`"c7 ${library}" still dispatches to docs`, () => {
    const run = runCli([library], { stub: found(`/x/${library}`) });
    assertNoLiveRequest(run);
    assert.equal(run.code, 0);
    assert.match(run.stdout, new RegExp(`/api/v1/x/${library}\\?tokens=5000$`, 'm'));
  });
}

test('the shorthand passes a topic through', () => {
  const run = runCli(['react', 'hooks'], { stub: found('/x/react') });
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\/api\/v1\/x\/react\?tokens=5000&topic=hooks$/m);
});

test('the shorthand accepts a Context7 ID directly, skipping resolve', () => {
  // Only the docs entry is stubbed: a resolve call would hit the catch-all and exit 97.
  const run = runCli(['/vercel/next.js', 'routing'], {
    stub: stubSearchAndDocs([{ id: '/never/used' }]),
  });
  assertNoLiveRequest(run);
  assert.equal(run.code, 0);
  assert.match(run.stdout, /\/api\/v1\/vercel\/next\.js\?tokens=5000&topic=routing$/m);
  assert.ok(!run.stdout.includes('/search?'), 'an explicit ID must not be resolved first');
});

test('the exact subcommands are never near-missed', () => {
  for (const [args, pattern] of [
    [['resolve', 'react'], /^ {2}\/x\/react {2}stub$/m],
    [['docs', 'react'], /\/api\/v1\/x\/react\?/],
  ]) {
    const run = runCli(args, { stub: found('/x/react') });
    assertNoLiveRequest(run);
    assert.equal(run.code, 0, args.join(' '));
    assert.match(run.stdout, pattern);
  }
});

// The `r`/`d` aliases are upstream behaviour and stay.
const ALIASES = [
  ['r', /^ {2}\/x\/react {2}stub$/m, /usage: c7 resolve/],
  ['d', /\/api\/v1\/x\/react\?/, /usage: c7 docs/],
];

for (const [alias, output, usage] of ALIASES) {
  test(`the "${alias}" alias dispatches, and needs an argument`, () => {
    const ok = runCli([alias, 'react'], { stub: found('/x/react') });
    assertNoLiveRequest(ok);
    assert.equal(ok.code, 0);
    assert.match(ok.stdout, output);

    const bare = runCli([alias]);
    assertNoLiveRequest(bare);
    assert.equal(bare.code, 1);
    assert.match(bare.stderr, usage);
  });
}

test('the near-miss check is case-insensitive', () => {
  const run = runCli(['RESLOVE', 'react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /did you mean "c7 resolve"\?/);
});

// Dispatch (bin/c7.js:165) is case-sensitive, the near-miss check is not: an upper-case
// subcommand is therefore not silently turned into a library lookup — it errors with the
// hint. That is the desirable half of the inconsistency; pinned so it stays that way.
test('an upper-case subcommand errors instead of becoming a library lookup', () => {
  const run = runCli(['DOCS', 'react']);
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /unknown command "DOCS" — did you mean "c7 docs"\?/);
});

test('a resolve miss stops the docs shorthand with exit 1', () => {
  const run = runCli(['nosuchlib'], { stub: stubSearchAndDocs([]) });
  assertNoLiveRequest(run);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /No libraries found for "nosuchlib"/);
});

// A best match without an `id` is reported as what it is, instead of as an invalid-ID
// error about "undefined" — a value the user never typed.
for (const result of [{ description: 'no id here' }, { id: '' }, { id: 42 }]) {
  test(`a result without a usable id names the query, not "undefined": ${JSON.stringify(result)}`, () => {
    const run = runCli(['react'], { stub: stubSearchAndDocs([result]) });
    assertNoLiveRequest(run);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /The best match for "react" carries no library ID/);
    assert.ok(!run.stderr.includes('undefined'), 'never report a value the user never typed');
  });
}
