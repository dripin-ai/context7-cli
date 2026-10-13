---
name: context7-resolve
description: Find Context7 library IDs for a given library name. Use when you need to resolve library names to their Context7 identifiers for documentation retrieval.
license: MIT
compatibility: Requires Node.js >=18. The @vedanth/context7 CLI can be installed globally, installed as a project dependency, or used via npx (zero install).
metadata:
  author: Kilo
  version: "1.0.1"
allowed-tools: Bash
---

# Context7 Library Resolution

Turn a search query into Context7 library IDs such as `/vercel/next.js`:

```bash
c7 resolve <query> [--json] [--api-key <key>]
```

Exit code 1 and no match means nothing was found. `c7 docs <library>` already
resolves on its own, so resolve first only when you want to pick the ID yourself.
For every flag and error message, run `c7 --help`.
