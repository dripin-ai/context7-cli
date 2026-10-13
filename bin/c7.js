#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { resolve, getDocs } from '../lib/api.js';

const HELP = `
  context7 — Up-to-date library docs from your terminal

  Usage:
    c7 resolve <query>                Find Context7 library IDs
    c7 docs <library> [topic]         Get docs (resolves library automatically)
    c7 docs <context7-id> [topic]     Get docs by exact Context7 ID
    c7 <library> [topic]              Shorthand for "c7 docs"

  Options:
    --tokens <n>       Max tokens to return, positive integer (default: 5000)
    --api-key <key>    Context7 API key (or set CONTEXT7_API_KEY)
    --json             Output raw JSON (resolve only — rejected elsewhere)
    --version, -v      Show version (on its own)
    --help, -h         Show this help (on its own)
    --                 End of options; what follows is a library or topic

  Examples:
    c7 resolve nextjs
    c7 resolve "state management"
    c7 docs react "server components"
    c7 docs nextjs "app router middleware" --tokens 10000
    c7 docs /vercel/next.js "image optimization"

  Pipe-friendly:
    c7 docs react hooks | pbcopy
    c7 docs express middleware >> prompt.txt
`.trim();

const COMMANDS = ['resolve', 'docs'];

function usage(message) {
  console.error(`Error: ${message}`);
  console.error('Run "c7 --help" for usage.');
  process.exit(1);
}

/** Levenshtein distance between two single words. */
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

/** A word is a near-miss of a subcommand if it is 1-2 edits away and almost as long. */
function nearMissCommand(word) {
  return COMMANDS.find(
    c => Math.abs(c.length - word.length) <= 1 && distance(word.toLowerCase(), c) <= 2,
  );
}

function parseTokens(raw) {
  if (raw === undefined) return 5000;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    usage(`--tokens expects a positive integer, got "${raw}"`);
  }
  return Number(raw);
}

async function cmdResolve(query, opts) {
  const results = await resolve(query, opts.apiKey);
  const empty = !Array.isArray(results) || results.length === 0;

  if (opts.json) {
    console.log(JSON.stringify(empty ? [] : results, null, 2));
  } else if (!empty) {
    const maxId = Math.max(...results.map(r => (r.id || '').length));
    for (const r of results) {
      console.log(`  ${(r.id || '').padEnd(maxId + 2)}${r.description || r.title || ''}`);
    }
  }

  if (empty) {
    console.error(`No libraries found for "${query}"`);
    process.exit(1);
  }
}

async function cmdDocs(libraryOrId, topic, opts) {
  if (opts.json) usage('--json applies to "c7 resolve" only');

  let libraryId = libraryOrId;
  if (!libraryOrId.startsWith('/')) {
    const results = await resolve(libraryOrId, opts.apiKey);
    if (!Array.isArray(results) || results.length === 0) {
      console.error(`No libraries found for "${libraryOrId}"`);
      process.exit(1);
    }
    libraryId = results[0].id;
    if (process.stderr.isTTY) console.error(`→ ${libraryId}`);
  }

  const docs = await getDocs(libraryId, topic, opts.apiKey, opts.tokens);
  if (!docs) {
    console.error('No docs found');
    process.exit(1);
  }
  console.log(docs);
}

function version() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return pkg.version;
  } catch (err) {
    console.error(`Error: cannot read package.json: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        tokens: { type: 'string' },
        'api-key': { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
    });
  } catch (err) {
    usage(err.message);
  }

  const { values, positionals } = parsed;

  if (values.version || values.help) {
    const flag = values.version ? '--version' : '--help';
    if (positionals.length > 0) usage(`${flag} takes no arguments`);
    console.log(values.version ? version() : HELP);
    process.exit(0);
  }

  if (positionals.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const opts = {
    apiKey: values['api-key'] || process.env.CONTEXT7_API_KEY,
    json: values.json === true,
    tokens: parseTokens(values.tokens),
  };

  const [cmd, ...rest] = positionals;

  try {
    switch (cmd) {
      case 'resolve':
      case 'r':
        if (!rest.length) usage('usage: c7 resolve <query>');
        await cmdResolve(rest.join(' '), opts);
        break;

      case 'docs':
      case 'd':
        if (!rest.length) usage('usage: c7 docs <library> [topic]');
        await cmdDocs(rest[0], rest.slice(1).join(' ') || undefined, opts);
        break;

      default: {
        // Shorthand: c7 <library> [topic] — but a typo'd subcommand is an error, not a library.
        const meant = nearMissCommand(cmd);
        if (meant) {
          usage(
            `unknown command "${cmd}" — did you mean "c7 ${meant}"? ` +
              `If "${cmd}" really is a library, run "c7 docs ${cmd}".`,
          );
        }
        await cmdDocs(cmd, rest.join(' ') || undefined, opts);
        break;
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.cause?.message) console.error(`Cause: ${err.cause.message}`);
    process.exit(1);
  }
}

main();
