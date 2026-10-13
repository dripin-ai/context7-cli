import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { encodeLibraryId } from '../lib/api.js';

const CLI = new URL('../bin/c7.js', import.meta.url).pathname;
const run = args => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('--version prints the package version', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(run(['--version']).trim(), version);
});

test('--help prints usage', () => {
  assert.match(run(['--help']), /c7 resolve <query>/);
});

test('encodeLibraryId accepts plain and versioned IDs', () => {
  assert.equal(encodeLibraryId('/vercel/next.js'), '/vercel/next.js');
  assert.equal(encodeLibraryId('/vercel/next.js/v14.3.0-canary.87'), '/vercel/next.js/v14.3.0-canary.87');
});

test('encodeLibraryId rejects path traversal and encodes stray syntax', () => {
  assert.throws(() => encodeLibraryId('/a/../../v1/search?query=react'), /Invalid Context7 library ID/);
  assert.equal(encodeLibraryId('/astral-sh/ruff#x'), '/astral-sh/ruff%23x');
});
