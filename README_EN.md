# context-kit

[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[中文](README.md) | **English**

> **Do the simplest thing that works.**

A minimal, framework-agnostic TypeScript toolkit for **Context Engineering**. Not another agent framework — just pure functions and a `Context` class.

---

## Motivation

> "Most AI Agent failures are not failures of model capability, but failures of Context Engineering."

Context is a **finite resource with diminishing marginal returns**. As context windows fill up, model performance degrades. context-kit provides the building blocks to manage context effectively.

| Pillar | Purpose | Module |
|--------|---------|--------|
| **Select** | JIT retrieval — pull information on-demand | `select` |
| **Write** | Persist information outside the context window | `memory` |
| **Compress** | Reduce context size while preserving signal | `Context.compressByRule`, `Context.compressByModel` |
| **Isolate** | Distribute context across sub-agents | Framework-level |

---

## Installation

```bash
# Clone and install
git clone <repo>
cd context-kit-nodejs
npm install

# Build
npm run build

# Run tests
npm test
```

---

## Examples

All examples live in `examples/basic/` and run directly via `npm run` without a build step.

| File | Command | Description |
|------|---------|-------------|
| `00_minimal.ts` | `npm run example:minimal` | Core Context usage: create, token counting, add message, format export |
| `01_select_tools.ts` | `npm run example:select` | Select tools: `listDir` → `find` → `grep` → `readFile` progressive retrieval |
| `02_memory.ts` | `npm run example:memory` | Memory persistence: `create`, `view`, `strReplace`, `insert`, `rename` |
| `03_compress_rules.ts` | `npm run example:compress-rules` | Rule compression: clear old tool results & thinking blocks, with before/after comparison |
| `04_compress_model.ts` | `npm run example:compress-model` | Model compression: LLM summarization of older turns, supports mock mode |

### Running Examples

```bash
cd context-kit-nodejs

# No configuration needed
npm run example:minimal
npm run example:select
npm run example:memory
npm run example:compress-rules

# Model compression: set API keys first (falls back to mock mode if not set)
cp .env.example .env
# Edit .env and fill in OPENAI_API_KEY or ANTHROPIC_API_KEY
npm run example:compress-model
```

Environment variables for `04_compress_model.ts`:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key, checked first, uses `gpt-4o-mini` |
| `OPENAI_BASE_URL` | Compatible endpoint (e.g. local proxy, Azure), optional |
| `ANTHROPIC_API_KEY` | Anthropic API key, fallback, uses `claude-3-haiku-20240307` |
| `ANTHROPIC_BASE_URL` | Compatible Anthropic endpoint, optional |

---

## Quick Example

```typescript
import { Context, memory, select } from "context-kit";

// 1. Create context from messages
const messages = [
  { role: "system", content: "You are helpful." },
  { role: "user",   content: "Hello" },
  { role: "assistant", content: "Hi there!" },
];
const ctx = Context.fromOpenAI(messages);
console.log(`Messages: ${ctx.length}, Tokens: ~${ctx.estimateTokens()}`);

// 2. Compress by clearing old tool results
const compressed = ctx.compressByRule({ keepToolUses: 3 });

// 3. Export to different formats
const openaiMsgs         = compressed.toOpenAI();
const [anthropicMsgs, system] = compressed.toAnthropic();
const [googleContents, sysInst] = compressed.toGoogle();
```

---

## Core Concepts

### Context — The Core Class

The `Context` class manages conversation history with compression and format conversion:

```typescript
import { Context } from "context-kit";

// Create from various formats
const ctx = Context.fromOpenAI(messages);
const ctx = Context.fromAnthropic(messages, "You are helpful.");
const ctx = Context.fromGoogle(contents, "You are helpful.");
const ctx = Context.fromDict(dicts);

// Compression
const compact  = ctx.compressByRule({ keepToolUses: 3 });
const summary  = await ctx.compressByModel(llm, { keepRecent: 3 });

// Export
const openaiMsgs         = ctx.toOpenAI();
const [anthropic, system] = ctx.toAnthropic();
const [google, sysInst]   = ctx.toGoogle();

// Token info
ctx.estimateTokens();
ctx.getTokenBreakdown();
ctx.displayTokenBreakdown(128000);

// Immutable add message
const ctx2 = ctx.addMessage("user", "Follow-up question");
```

### compressByRule — Tool & Thinking Clearing

Clears old tool results (and optionally thinking blocks) to reduce context size:

```typescript
// Keep only the 3 most recent tool results
ctx.compressByRule({ keepToolUses: 3 });

// Exclude specific tools from clearing
ctx.compressByRule({ keepToolUses: 3, excludeTools: ["readFile"] });

// Clear thinking blocks too
ctx.compressByRule({
  keepToolUses: 3,
  clearThinking: true,
  keepThinkingTurns: 1,
});

// Archive cleared content to memory with retrieval hint
ctx.compressByRule({
  keepToolUses: 3,
  memoryPath: "./agent_data",
});
// Cleared messages get: "[Tool result cleared. Use memory_read('/memories/tool_001_grep.md') to retrieve.]"
```

### compressByModel — LLM Summarization

Uses an LLM to summarize older conversation turns:

```typescript
import { fromOpenAI } from "context-kit/llm";

const llm = fromOpenAI(openaiClient, "gpt-4o-mini");
const ctx2 = await ctx.compressByModel(llm, {
  instruction: "Preserve: key decisions, unresolved issues. Discard: exploratory attempts.",
  keepRecent: 3,
});
```

### Select — JIT Context Retrieval

Progressive Disclosure: start with an overview, narrow down, then load on demand:

```typescript
import { listDir, grep, readFile } from "context-kit";

// Step 1: Understand the map (low token cost)
const entries = listDir("./src", { maxDepth: 2 });

// Step 2: Narrow down
const matches = grep(/def \w+/, "./src", { filePattern: "*.ts" });

// Step 3: Load on demand
const content = readFile("./src/auth.ts", { startLine: 40, endLine: 60 });
```

#### explore — combined convenience

```typescript
import { explore } from "context-kit";

const result = explore("./src", {
  query: "export function",
  filePattern: "*.ts",
  maxDepth: 2,
});
// result.entries — directory listing
// result.matches — grep results
```

### Memory — Context Persistence

Persist information outside the context window (follows Claude Memory Tool interface):

```typescript
import { initMemory, view, create, strReplace, insert, deleteEntry, rename, clearAll } from "context-kit";

initMemory("./agent_data");

// CRUD
create("/memories/notes.md", "# Analysis\n\nKey findings...");
const text  = view("/memories/notes.md");
strReplace("/memories/notes.md", "old text", "new text");
insert("/memories/notes.md", 3, "- New bullet point");
deleteEntry("/memories/old_notes.md");
rename("/memories/draft.md", "/memories/final.md");
clearAll();
```

### LLM Adapters

Unified interface for different LLM providers:

```typescript
import { fromOpenAI, fromAnthropic } from "context-kit";

// OpenAI
const llm = fromOpenAI(openaiClient, "gpt-4o-mini");

// Anthropic
const llm = fromAnthropic(anthropicClient, "claude-3-haiku-20240307");

// Or any async function (prompt: string) => Promise<string>
const mockLlm = async (prompt: string) => "Mock response";
```

### Tools — Agent Integration

Export tool definitions for agent frameworks:

```typescript
import { getMemoryTools, getSelectTools, getAllTools } from "context-kit";

// Returns [memoryRead, memoryWrite, memoryUpdate, memoryDelete]
const memTools = getMemoryTools("./agent_data");

// Returns [fileList, fileSearch, fileRead]
const selTools = getSelectTools("./src");

// Both combined
const allTools = getAllTools("./agent_data", "./src");
```

Each tool function accepts plain parameters and returns a `string`, ready to plug into any framework's tool-calling interface.

---

## API Reference

### `Context`

| Method | Description |
|--------|-------------|
| `Context.fromOpenAI(msgs)` | Create from OpenAI message array |
| `Context.fromAnthropic(msgs, system?)` | Create from Anthropic format |
| `Context.fromGoogle(contents, system?)` | Create from Google/Gemini format |
| `Context.fromDict(dicts)` | Create from plain object array |
| `ctx.toOpenAI()` | Export to OpenAI format |
| `ctx.toAnthropic()` | Export to Anthropic format (returns `[msgs, system]`) |
| `ctx.toGoogle()` | Export to Google format (returns `[contents, sysInst]`) |
| `ctx.compressByRule(opts)` | Rule-based compression |
| `ctx.compressByModel(llm, opts)` | LLM-based summarization (async) |
| `ctx.addMessage(role, content, extra?)` | Immutably add message |
| `ctx.estimateTokens()` | Estimate total tokens (~4 chars/token) |
| `ctx.getTokenBreakdown()` | Token breakdown by category |
| `ctx.displayTokenBreakdown(maxTokens)` | Print token usage to console |

### `select`

| Function | Description |
|----------|-------------|
| `listDir(path, opts?)` | List directory contents |
| `find(path, opts?)` | Find by name/type |
| `grep(pattern, path, opts?)` | Regex search in files |
| `readFile(path, opts?)` | Read file (optional line range) |
| `explore(path, opts?)` | listDir + optional grep |
| `configure(opts)` | Set global defaults |

### `memory`

| Function | Description |
|----------|-------------|
| `initMemory(path)` | Initialize storage |
| `view(path)` | Read file or list directory |
| `create(path, text)` | Create new file |
| `strReplace(path, old, new)` | Replace unique text |
| `insert(path, line, text)` | Insert at line |
| `deleteEntry(path)` | Delete file or directory |
| `rename(old, new)` | Move/rename |
| `clearAll()` | Wipe all data |

---

## Project Structure

```
context-kit-nodejs/
├── src/
│   ├── message.ts      # Message class + multi-provider format conversion
│   ├── context.ts      # Context class with compression operations
│   ├── memory.ts       # Memory CRUD (Claude Memory Tool interface)
│   ├── select.ts       # JIT file exploration (listDir/grep/readFile)
│   ├── llm.ts          # LLMCallable type + OpenAI/Anthropic adapters
│   ├── tools.ts        # Agent-ready tool wrappers
│   ├── util.ts         # Token estimation utilities
│   └── index.ts        # Public API re-exports
├── examples/
│   ├── basic/
│   │   ├── 00_minimal.ts         # Core Context usage
│   │   ├── 01_select_tools.ts    # Progressive JIT retrieval
│   │   ├── 02_memory.ts          # Memory persistence
│   │   ├── 03_compress_rules.ts  # Rule-based compression
│   │   └── 04_compress_model.ts  # LLM summarization (requires API key)
│   └── util.ts                   # Shared output helpers
├── tests/
│   ├── util.test.ts
│   ├── message.test.ts
│   ├── context.test.ts
│   ├── memory.test.ts
│   ├── select.test.ts
│   └── tools.test.ts
├── .env.example        # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Design Philosophy

| Principle | Description |
|-----------|-------------|
| **Minimal** | Pure functions, lightweight core — only Node.js built-ins required |
| **Composable** | Each module is independent, combine as needed |
| **Framework-agnostic** | Works with any agent framework |
| **Immutable** | Context operations return new instances, never mutate in place |
| **Type-safe** | Full TypeScript types throughout |

---

## License

MIT
