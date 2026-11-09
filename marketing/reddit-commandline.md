# r/commandline Post Draft

**Subreddit:** r/commandline

---

**Title:** c7 — Fetch library docs to stdout, pipe into anything (310 lines, zero deps)

**Body:**

The OneUptime team wrote something recently that I think this sub would appreciate: "The best interface for AI agents isn't a new protocol — it's the one that's been on every Unix system since 1971."

There's been a whole wave of developers building MCP servers (a protocol Anthropic made for connecting AI tools) and it's gotten absurd. Someone literally made `mcp-grep`. An MCP wrapper around grep. LLMs already know how grep works from their training data. They don't need a special protocol to call it.

`c7` is 310 lines that query a documentation database and print results to stdout. Designed to compose with standard Unix tools, not replace them.

```bash
# Basic usage
c7 drizzle "queries"                       # Print Drizzle ORM query docs
c7 hono "middleware" --tokens 3000         # Limit output size

# Compose with pipes
c7 zod "schemas" | grep "z.object"         # Filter for object schemas
c7 drizzle "schema" | less                 # Page through docs
c7 hono "context" | pbcopy                 # Copy to clipboard
c7 zod "validation" | wc -l               # Count lines
c7 drizzle "migrations" >> prompt.txt      # Append to file

# Feed into LLMs
c7 zod "transforms" | claude "summarize"
c7 hono "routing" | ollama run deepseek-coder "explain"
```

**What it does:** Resolves a library name against Context7's database, fetches version-specific documentation with code examples, and prints it.

**Why it exists:** Context7 has an MCP server for AI editors, but I wanted the data accessible through the interface I already use. Eric Holmes summed it up well: "Ship a good API, then ship a good CLI. The agents will figure it out." LLMs are trained on millions of man pages and CLI help texts. They already know how to work with stdout. You don't need to teach them a new protocol.

**Stats:**
- 310 lines total (214 CLI + 96 API client)
- Zero dependencies — just Node.js built-in `fetch`
- Two files: `bin/c7.js` and `lib/api.js`
- Works on Node 18+

**Install:**

```bash
npx @dripin-ai/context7-cli           # Run without installing
npm install -g @dripin-ai/context7-cli # Or install globally for `c7`
```

Source: https://github.com/dripin-ai/context7-cli
npm: https://www.npmjs.com/package/@dripin-ai/context7-cli
Website: https://dripin-ai.github.io/context7-cli/
Author: https://akarispeed.xyz
