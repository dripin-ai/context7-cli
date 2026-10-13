---
name: context7-docs
description: Get documentation for a library from Context7. Use when you need up-to-date library documentation, API references, code examples, or specific topic information from Context7.
license: MIT
compatibility: Requires Node.js >=18. The @vedanth/context7 CLI can be installed globally, installed as a project dependency, or used via npx (zero install).
metadata:
  author: Kilo
  version: "1.0.1"
allowed-tools: Bash
---

# Context7 Documentation Fetch

Fetch docs for a library, optionally narrowed to a topic:

```bash
c7 docs <library-or-context7-id> [topic] [--tokens <n>] [--api-key <key>]
```

Output is markdown on stdout, so pipe it anywhere. For every flag, exit code and
error message, run `c7 --help`.
