# Architecture

This document describes the internal architecture of OpenKrow -- how every package works, how they connect, and the design decisions behind them.

## Overview

OpenKrow is a TypeScript monorepo built with Bun and Turborepo. The agent runs as an HTTP server that accepts natural language requests and executes multi-step tasks using tools, skills, and LLM-powered reasoning.

```
                          +-------------------+
                          |  apps/openkrow    |
                          |  (HTTP Server)    |
                          +--------+----------+
                                   |
                    +--------------+--------------+
                    |              |              |
              +-----+----+  +-----+----+  +------+------+
              |  agent   |  |  config  |  | workspace   |
              +-----+----+  +-----+----+  +------+------+
                    |              |
         +----+----+----+    +----+----+
         |    |    |    |    |         |
       +--+ +--+ +--+ +--+ +--+     +--+
       |ll| |db| |sk| |ws| |db|     |ll|
       |m | |  | |il| |  | |  |     |m |
       +--+ +--+ |l | +--+ +--+     +--+
                  +--+
```

## Design Principles

1. **No global state.** Database connections are passed as instances, not singletons.
2. **Plain TypeScript.** No Effect library, no decorators, no DI framework. Simple async/await.
3. **Workspace-first.** Conversations live inside the workspace directory, not in a central database. Move the folder, and the history moves with it.
4. **API-only.** The app is a pure HTTP server. TUI and Web UI are separate packages.
5. **Package isolation.** Each package has a clean public API. No reaching into another package's internals.

## The Agent (`@openkrow/agent`)

The agent is the core of OpenKrow. When a user sends a message, the agent:

1. Assembles the conversation context (system prompt + history + tool definitions)
2. Calls the LLM
3. Checks if the LLM requested tool calls
4. If yes: executes the tools, adds results to context, and goes back to step 1
5. If no: returns the response

This is the **query loop** -- a `while(true)` that runs until the LLM produces a response with no tool calls.

```
User message
    |
    v
+-> Context Assembly (5-phase compaction)
|       |
|       v
|   LLM Call (stream or complete)
|       |
|       v
|   Has tool_use blocks in response?
|       |
|   +---+---+
|   |       |
|   | yes   | no
|   v       v
|   Execute  Return
|   tools    response
|   (parallel)
|       |
+-------+
```

There is no default turn limit. The agent runs until the job is done. An optional `maxTurns` safety net prevents runaway loops.

### Context Compaction

Long conversations can exceed the model's context window. The agent applies up to 5 compaction phases, each only running if the context is still over budget:

| Phase | Name | What it does |
|-------|------|-------------|
| 1 | Tool Result Budget | Trims oversized tool results (keeps head + tail, marks trimmed middle) |
| 2 | Snip Compact | Drops oldest message blocks entirely |
| 3 | Microcompact | Replaces stale tool outputs (>10 messages old) with metadata placeholders |
| 4 | Context Collapse | Merges consecutive tool result blocks into summaries |
| 5 | Auto-Compaction | Uses the LLM itself to summarize the oldest half of messages |

Original messages are never mutated. All compaction produces new arrays.

### Tools

Each tool has two files:
- `<name>.ts` -- Implementation using the `createTool()` factory
- `<name>.txt` -- Natural language description (loaded at build time, included in LLM context)

The `ToolManager` auto-registers tools based on available dependencies:
- File tools (read, write, edit, bash) -- always available, sandboxed to workspace
- Network tools (webfetch, websearch) -- always available
- Skill tool -- available when a `SkillManager` is provided
- Question tool -- available when a `QuestionHandler` callback is provided

Tool results use `ok(output)` / `fail(error)` helpers for consistent structure.

### Streaming

The agent supports two modes:
- `run(input)` -- Returns the complete response as a string
- `stream(input)` -- Returns an `AsyncGenerator<string>` that yields text deltas in real-time

Both use the same query loop internally. The streaming mode uses pull-based delivery via async generators, which propagates backpressure naturally.

## LLM Client (`@openkrow/llm`)

A unified interface to 20+ models across 8 providers.

**API protocol abstraction:** Each model declares which API protocol it uses (`anthropic-messages`, `openai-completions`, or `google-generative-ai`). The stream function dispatches to the correct provider implementation.

**Credential resolution order:**
1. Explicit `apiKey` passed in options
2. OAuth credentials (GitHub Copilot device flow, Anthropic OAuth)
3. Environment variable fallback (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)

**Streaming:** Uses an `EventStream` class implementing `AsyncIterable<StreamEvent>`. Consumers iterate with `for await`, then call `result()` to get the fully assembled `AssistantMessage`.

## Database (`@openkrow/database`)

OpenKrow uses a **split-database** design:

| Database | Location | Tables |
|----------|----------|--------|
| **Global** | `~/.openkrow/database/openkrow.db` | `settings`, `migrations` |
| **Workspace** | `<workspace>/.krow/data.db` | `conversations`, `messages`, `migrations` |

This means:
- Settings (API keys, model config) are global and shared across all workspaces
- Conversations and messages belong to the workspace and travel with it
- Each database has its own migration chain

**No singletons.** `openDatabase()` returns a fresh `Database` handle. Repositories take the handle via constructor. Two factory functions create the typed clients:

```typescript
const global = createGlobalClient()           // settings
const workspace = createWorkspaceClient(path) // conversations + messages
```

## Configuration (`@openkrow/config`)

`ConfigManager` wraps the global database's settings repository:

- **Active model** -- which provider + model to use
- **API keys** -- per-provider, stored with masking support for display
- **OAuth credentials** -- GitHub Copilot, Anthropic OAuth flows
- **Model overrides** -- per-model baseUrl, maxTokens, temperature
- **General settings** -- system prompt, workspace path, max turns

All values stored as JSON in the `settings` table.

## Workspace (`@openkrow/workspace`)

A workspace is a user-provided directory:

```
<workspace>/
  .krow/
    data.db           # Conversations + messages (SQLite)
  context.md          # Persistent context for the agent
  templates/          # Reusable document templates
  jobs/               # Saved task sessions (JSON)
  scripts/            # Scripts written by the agent
```

`WorkspaceManager` creates the structure on `init()`, reads `context.md` on every LLM call (via `refreshContext()`), and provides CRUD for jobs, templates, and scripts.

The `context.md` content is appended to the system prompt, giving the agent persistent project knowledge without manual context passing.

## Skills (`@openkrow/skill`)

Skills are domain-specific instruction sets that extend the agent's capabilities. Each skill is a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: pdf
description: Read, create, and manipulate PDF files
tools: [bash, write, read]
---

# PDF Skill

When working with PDFs, use the `pymupdf` library...
```

`SkillManager` handles install/uninstall/enable/disable and generates a prompt snippet listing available skills. The agent's skill tool fetches content on demand.

4 built-in skills: **PDF**, **Word**, **Excel**, **PowerPoint** (sourced from [anthropics/skills](https://github.com/anthropics/skills)).

## The App (`apps/openkrow`)

The app wires everything together into an HTTP server.

### Orchestrator

The `Orchestrator` is the central coordinator:

```
Orchestrator
  +-- globalDb (GlobalDatabaseClient)       -- settings
  +-- workspaceDb (WorkspaceDatabaseClient)  -- conversations, messages
  +-- configManager (ConfigManager)          -- reads from globalDb
  +-- workspace (WorkspaceManager)           -- file system operations
  +-- agents (Map<conversationId, Agent>)    -- one agent per conversation
  +-- activeRequests (Map<id, AbortController>) -- cancellation
```

**LLM config resolution:** per-request overrides > ConfigManager active model > constructor fallback.

**Request flow:**
1. HTTP request arrives
2. Auth gate checks Bearer token (if configured)
3. Handler gets or creates a conversation
4. Orchestrator creates or reuses an Agent for that conversation
5. Agent runs the query loop
6. Response returned as JSON or SSE stream

### Authentication

Bearer token authentication:
- Set `OPENKROW_SERVER_API_KEY` environment variable
- All requests except `/health` must include `Authorization: Bearer <key>`
- Token is in-memory only, never persisted

## Build System

- **Turborepo** for task orchestration and caching
- **Bun** as package manager and runtime
- **TypeScript** with `NodeNext` module resolution and `.js` import extensions
- **CI** on GitHub Actions with `oven-sh/setup-bun`

## Testing

| Package | Runner | Tests |
|---------|--------|-------|
| Agent | `node --test` | 26 |
| Config | `bun test` | 54 |
| Skill | `bun test` | 48 |
| LLM | Vitest | 80 |

Total: **200+ tests** across the monorepo.

## Package Dependency Graph

```
@openkrow/app
  +-- @openkrow/agent
  |     +-- @openkrow/llm
  |     +-- @openkrow/database
  |     +-- @openkrow/skill
  |     +-- @openkrow/workspace
  |     +-- eventemitter3
  +-- @openkrow/config
  |     +-- @openkrow/database
  |     +-- @openkrow/llm
  +-- @openkrow/workspace
  +-- @openkrow/database

@openkrow/tui        (standalone)
@openkrow/web-ui     (standalone)
```
