# OpenKrow — Desktop Agent System Design (Tauri + Bun)

> **Version:** 0.2.0-draft
> **Last updated:** 2026-04-20
> **Status:** Design phase

## Overview

OpenKrow is a desktop coding agent that combines a Tauri shell, a Bun-compiled agent server, and a React frontend into a single distributable application. The agent can edit files, execute shell commands, load specialized skills, and interact with LLM providers — all running locally on the user's machine.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        OpenKrow Desktop App                      │
│                                                                  │
│  ┌─────────────┐                          ┌────────────────────┐ │
│  │  React UI   │───── HTTP (REST) ───────▶│  Bun Agent Server  │ │
│  │  (webview)  │◀──── SSE (streaming) ────│  (localhost:port)  │ │
│  └──────┬──────┘                          └────────────────────┘ │
│         │                                          ▲             │
│         │ invoke (lifecycle only)                   │             │
│         ▼                                          │             │
│  ┌─────────────┐       spawn / kill               │             │
│  │  Tauri Rust │──────────────────────────────────┘             │
│  └─────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer              | Role                                                     | Talks To                                           |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------- |
| **React Frontend** | UI, state management, user interaction                   | Bun Agent (HTTP/SSE), Tauri (invoke for lifecycle) |
| **Tauri (Rust)**   | Spawn/kill agent process, provide connection info        | Frontend (events), Bun Agent (process management)  |
| **Bun Agent**      | LLM calls, tool execution, DB writes, context management | LLM APIs (HTTP), filesystem, SQLite                |

### Communication Protocol

- **Frontend ↔ Agent:** HTTP REST + Server-Sent Events (SSE) over localhost
- **Frontend → Tauri:** Tauri `invoke` commands (only for lifecycle: get agent URL, shutdown)
- **Tauri → Agent:** Process spawn/kill via OS process management
- **Auth:** Bearer token (random UUID generated per session by Tauri)

### Why HTTP over stdin/stdout

| Factor           | stdin/stdout             | HTTP (localhost)    |
| ---------------- | ------------------------ | ------------------- |
| Multiple windows | Impossible (1 pipe)      | Easy                |
| Debugging        | Hard                     | `curl` / devtools   |
| Error recovery   | Process dies = pipe gone | Can reconnect       |
| Future reuse     | Desktop only             | CLI + web UI later  |
| Latency overhead | ~0.1ms                   | ~1-2ms (irrelevant) |

---

## Data Architecture

### Storage Layout

```
~/.openkrow/
├── config.json                 # Global settings (API keys, model, theme)
├── data.db                     # SQLite — sessions, messages, projects
├── skills/                     # Global user-installed skills
│   └── {skill-name}/
│       └── SKILL.md
└── projects/{hash}/
    └── index.db                # Per-project file index / embeddings

Project root:
└── .agent/
    ├── instructions.md         # Project-specific system prompt
    └── skills/                 # Project-specific skills
        └── {skill-name}/
            └── SKILL.md
```

### Database Schema (SQLite)

```sql
-- WAL mode enabled for concurrent reads while writing
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE session (
  id              TEXT PRIMARY KEY,
  project_path    TEXT NOT NULL,
  title           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE message (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,           -- user | assistant | tool
  content         TEXT NOT NULL,
  tool_calls      TEXT,                    -- JSON array of tool calls
  token_usage     INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE project (
  path            TEXT PRIMARY KEY,
  name            TEXT,
  instructions    TEXT,
  last_opened     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE file_index (
  path            TEXT NOT NULL,
  project_path    TEXT NOT NULL,
  hash            TEXT NOT NULL,
  summary         TEXT,
  embedding       BLOB,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (project_path, path)
);
```

### Data Ownership

| Data                                | Writer               | Reader                        | Format       |
| ----------------------------------- | -------------------- | ----------------------------- | ------------ |
| Sessions, messages, tool results    | Bun Agent            | Bun Agent + Tauri (read-only) | SQLite       |
| App config (API keys, theme, model) | Tauri (via frontend) | Bun Agent (file watch)        | JSON file    |
| Project metadata, file index        | Bun Agent            | Bun Agent                     | SQLite       |
| Conversation context (active)       | In-memory (Bun)      | Bun Agent                     | Runtime only |

---

## Layer 1: Frontend (React + TypeScript)

### Directory Structure

```
src/
├── main.tsx
├── App.tsx
├── stores/
│   ├── session.ts              # Session state (zustand)
│   ├── messages.ts             # Message list + streaming
│   ├── settings.ts             # Config state
│   └── projects.ts             # Project list
├── components/
│   ├── Chat/
│   │   ├── ChatView.tsx        # Main chat container
│   │   ├── MessageList.tsx     # Rendered messages
│   │   ├── MessageBubble.tsx   # Single message (markdown, code blocks)
│   │   ├── ToolCallBlock.tsx   # Rendered tool results (file diff, terminal output)
│   │   ├── InputBar.tsx        # User input + attachments
│   │   └── StreamingText.tsx   # Live token stream
│   ├── Sidebar/
│   │   ├── SessionList.tsx     # Past sessions
│   │   ├── ProjectPicker.tsx   # Open project
│   │   └── SkillManager.tsx    # Enable/disable skills
│   ├── Settings/
│   │   ├── SettingsModal.tsx
│   │   ├── ModelSelector.tsx
│   │   └── ApiKeyInput.tsx
│   └── shared/
│       ├── CodeBlock.tsx       # Syntax highlighted code
│       ├── DiffView.tsx        # File diff display
│       └── Terminal.tsx        # Bash output display
├── lib/
│   ├── agent-client.ts         # HTTP/SSE client for agent server
│   ├── tauri.ts                # Typed invoke wrappers
│   ├── protocol.ts             # Shared event/message types
│   └── markdown.ts             # Markdown renderer config
└── styles/
```

### Shared Protocol Types

```typescript
// src/lib/protocol.ts

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ name: string; args: unknown; result?: unknown }>;
  token_usage?: number;
  created_at: number;
}

export type AgentEvent =
  | { type: "token"; content: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_result"; result: unknown }
  | { type: "done"; message_id: string }
  | { type: "error"; message: string }
  | { type: "status"; status: "thinking" | "tool_executing" | "idle" };
```

### Message Store (Zustand)

```typescript
// src/stores/messages.ts

import { create } from "zustand";
import { sendMessage as sendToAgent, cancelAgent } from "../lib/agent-client";
import type { Message } from "../lib/protocol";

interface MessageStore {
  messages: Message[];
  streaming: string;
  toolCalls: Array<{ name: string; args: unknown; result?: unknown }>;
  isLoading: boolean;
  send: (sessionId: string, content: string) => Promise<void>;
  cancel: (sessionId: string) => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
}

export const useMessages = create<MessageStore>((set, get) => ({
  messages: [],
  streaming: "",
  toolCalls: [],
  isLoading: false,

  send: async (sessionId, content) => {
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: crypto.randomUUID(),
          role: "user",
          content,
          created_at: Date.now(),
        },
      ],
      isLoading: true,
      streaming: "",
      toolCalls: [],
    }));

    await sendToAgent(sessionId, content, {
      onToken: (token) => {
        set((s) => ({ streaming: s.streaming + token }));
      },
      onToolStart: (name, args) => {
        set((s) => ({
          toolCalls: [...s.toolCalls, { name, args }],
        }));
      },
      onToolResult: (result) => {
        set((s) => ({
          toolCalls: s.toolCalls.map((tc, i) =>
            i === s.toolCalls.length - 1 ? { ...tc, result } : tc,
          ),
        }));
      },
      onDone: () => {
        set((s) => ({
          messages: [
            ...s.messages,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: s.streaming,
              tool_calls: s.toolCalls.length ? s.toolCalls : undefined,
              created_at: Date.now(),
            },
          ],
          streaming: "",
          toolCalls: [],
          isLoading: false,
        }));
      },
      onError: () => {
        set({ isLoading: false });
      },
    });
  },

  cancel: async (sessionId) => {
    await cancelAgent(sessionId);
    set({ isLoading: false });
  },

  loadSession: async (sessionId) => {
    const { getConnection } = await import("../lib/agent-client");
    const { url, token } = await getConnection();
    const res = await fetch(`${url}/sessions/${sessionId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const messages = await res.json();
    set({ messages, streaming: "", isLoading: false });
  },
}));
```

### Agent Client (HTTP + SSE)

```typescript
// src/lib/agent-client.ts

import { invoke } from "@tauri-apps/api/core";

let connection: { url: string; token: string } | null = null;

export async function getConnection() {
  if (!connection) {
    connection = await invoke<{ url: string; token: string }>("get_agent_url");
  }
  return connection;
}

export async function sendMessage(
  sessionId: string,
  content: string,
  callbacks: {
    onToken: (t: string) => void;
    onToolStart: (name: string, args: unknown) => void;
    onToolResult: (result: unknown) => void;
    onDone: () => void;
    onError: (err: string) => void;
  },
) {
  const { url, token } = await getConnection();

  const res = await fetch(`${url}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split("\n");
    buf = lines.pop()!;

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6);
        switch (currentEvent) {
          case "token":
            callbacks.onToken(data);
            break;
          case "tool_start": {
            const parsed = JSON.parse(data);
            callbacks.onToolStart(parsed.name, parsed.args);
            break;
          }
          case "tool_result":
            callbacks.onToolResult(JSON.parse(data));
            break;
          case "done":
            callbacks.onDone();
            break;
          case "error":
            callbacks.onError(data);
            break;
        }
      }
    }
  }
}

export async function createSession(projectPath: string) {
  const { url, token } = await getConnection();
  const res = await fetch(`${url}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ project_path: projectPath }),
  });
  return res.json();
}

export async function cancelAgent(sessionId: string) {
  const { url, token } = await getConnection();
  await fetch(`${url}/sessions/${sessionId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

---

## Layer 2: Tauri (Rust)

### Directory Structure

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── resources/
│   └── agent-bin               # Bun-compiled agent binary
├── src/
│   ├── main.rs                 # Entry point
│   ├── agent.rs                # Bun process lifecycle
│   ├── commands.rs             # Tauri commands
│   └── config.rs               # Config read/write
```

### main.rs

```rust
mod agent;
mod commands;
mod config;

use agent::AgentServer;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .manage(AgentServer::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_agent_url,
            commands::save_config,
            commands::get_config,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<AgentServer>();
                state.spawn(&handle).await.expect("failed to start agent");
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<AgentServer>();
                state.kill();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

### agent.rs

```rust
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::AppHandle;

pub struct AgentServer {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    pub token: String,
}

impl AgentServer {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            port: Mutex::new(None),
            token: uuid::Uuid::new_v4().to_string(),
        }
    }

    pub async fn spawn(&self, app: &AppHandle) -> Result<u16, String> {
        let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
        let agent_bin = resource_dir.join("agent-bin");
        let data_dir = dirs::home_dir().unwrap().join(".openkrow");

        std::fs::create_dir_all(&data_dir).ok();

        let mut child = Command::new(&agent_bin)
            .env("AUTH_TOKEN", &self.token)
            .env("PORT", "0")
            .env("DATA_DIR", data_dir.to_str().unwrap())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;

        // Agent prints {"port": N} on first line of stdout
        let stdout = child.stdout.take().unwrap();
        let mut reader = BufReader::new(stdout);
        let mut first_line = String::new();
        reader.read_line(&mut first_line).map_err(|e| e.to_string())?;

        let info: serde_json::Value =
            serde_json::from_str(&first_line).map_err(|e| e.to_string())?;
        let port = info["port"].as_u64().unwrap() as u16;

        // Log stderr in background
        let stderr = child.stderr.take().unwrap();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                eprintln!("[agent] {}", line);
            }
        });

        *self.child.lock().unwrap() = Some(child);
        *self.port.lock().unwrap() = Some(port);

        Ok(port)
    }

    pub fn port(&self) -> Option<u16> {
        *self.port.lock().unwrap()
    }

    pub fn kill(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}
```

### commands.rs

```rust
use tauri::State;
use crate::agent::AgentServer;
use crate::config;

#[derive(serde::Serialize)]
pub struct AgentConnection {
    url: String,
    token: String,
}

#[tauri::command]
pub fn get_agent_url(state: State<'_, AgentServer>) -> Result<AgentConnection, String> {
    let port = state.port().ok_or("agent not started")?;
    Ok(AgentConnection {
        url: format!("http://127.0.0.1:{}", port),
        token: state.token.clone(),
    })
}

#[tauri::command]
pub fn save_config(config: serde_json::Value) -> Result<(), String> {
    config::save(&config)
}

#[tauri::command]
pub fn get_config() -> Result<serde_json::Value, String> {
    config::load()
}
```

### config.rs

```rust
use std::fs;
use std::path::PathBuf;

fn config_path() -> PathBuf {
    dirs::home_dir().unwrap().join(".openkrow/config.json")
}

pub fn load() -> Result<serde_json::Value, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(serde_json::json!({
            "provider": "anthropic",
            "model": "claude-sonnet-4-20250514",
            "api_keys": {},
            "max_context_tokens": 128000,
            "theme": "dark"
        }));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

pub fn save(config: &serde_json::Value) -> Result<(), String> {
    let path = config_path();
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(path, serde_json::to_string_pretty(config).unwrap())
        .map_err(|e| e.to_string())
}
```

### tauri.conf.json

```json
{
  "productName": "OpenKrow",
  "identifier": "com.openkrow.app",
  "build": {
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "nsis", "deb"],
    "resources": {
      "resources/agent-bin": "agent-bin"
    },
    "icon": ["icons/icon.png"]
  },
  "app": {
    "windows": [
      {
        "title": "OpenKrow",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ]
  }
}
```

---

## Layer 3: Bun Agent Server

### Directory Structure

```
agent/
├── index.ts                        # Entry point — HTTP server
├── src/
│   ├── loop.ts                     # Agent loop (LLM ↔ tools)
│   ├── llm/
│   │   ├── client.ts               # LLM API client (streaming)
│   │   ├── context.ts              # Context window management
│   │   └── providers/
│   │       ├── anthropic.ts        # Anthropic Claude
│   │       ├── openai.ts           # OpenAI GPT
│   │       └── types.ts            # Shared LLM types
│   ├── tools/
│   │   ├── index.ts                # Tool registry + definitions
│   │   ├── read.ts                 # Read file
│   │   ├── edit.ts                 # Edit file (string replace)
│   │   ├── write.ts                # Write new file
│   │   ├── bash.ts                 # Shell command execution
│   │   ├── glob.ts                 # File pattern search
│   │   ├── grep.ts                 # Content search
│   │   ├── skill.ts                # Load skill instructions
│   │   └── web.ts                  # Fetch URL content
│   ├── db/
│   │   ├── index.ts                # Database connection + schema
│   │   ├── sessions.ts             # Session CRUD
│   │   ├── messages.ts             # Message persistence
│   │   └── file-index.ts           # File indexing
│   ├── skills/
│   │   ├── loader.ts               # Skill discovery + loading
│   │   └── builtin/                # Bundled skills
│   │       ├── typescript/SKILL.md
│   │       ├── react/SKILL.md
│   │       └── rust/SKILL.md
│   ├── prompts/
│   │   ├── system.ts               # System prompt builder
│   │   └── templates/
│   │       └── base.md             # Base system prompt
│   └── config.ts                   # Config loader + file watcher
└── tsconfig.json
```

### index.ts (HTTP Server Entry Point)

```typescript
// agent/index.ts

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { runAgent, cancelSession } from "./src/loop";
import { createSession, listSessions } from "./src/db/sessions";
import { listMessages } from "./src/db/messages";

const app = new Hono();
const AUTH_TOKEN = process.env.AUTH_TOKEN!;

// Auth middleware
app.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (token !== AUTH_TOKEN) return c.json({ error: "unauthorized" }, 401);
  await next();
});

// Health check
app.get("/health", (c) => c.json({ ok: true }));

// Sessions
app.get("/sessions", async (c) => {
  const projectPath = c.req.query("project_path");
  return c.json(listSessions(projectPath));
});

app.post("/sessions", async (c) => {
  const body = await c.req.json();
  const session = createSession(body.project_path);
  return c.json(session);
});

// Messages
app.get("/sessions/:id/messages", (c) => {
  return c.json(listMessages(c.req.param("id")));
});

app.post("/sessions/:id/messages", (c) => {
  const sessionId = c.req.param("id");

  return streamSSE(c, async (stream) => {
    const body = await c.req.json();

    await runAgent(sessionId, body.content, {
      onToken: (content) => stream.writeSSE({ event: "token", data: content }),
      onToolStart: (name, args) =>
        stream.writeSSE({
          event: "tool_start",
          data: JSON.stringify({ name, args }),
        }),
      onToolResult: (result) =>
        stream.writeSSE({
          event: "tool_result",
          data: JSON.stringify(result),
        }),
      onDone: (messageId) =>
        stream.writeSSE({ event: "done", data: messageId }),
      onError: (message) => stream.writeSSE({ event: "error", data: message }),
      signal: c.req.raw.signal,
    });
  });
});

// Cancel
app.post("/sessions/:id/cancel", (c) => {
  cancelSession(c.req.param("id"));
  return c.json({ ok: true });
});

// Start server, print port for Tauri to read
const port = parseInt(process.env.PORT || "0");
const server = Bun.serve({ port, fetch: app.fetch });
console.log(JSON.stringify({ port: server.port }));
```

### src/loop.ts (Agent Loop)

```typescript
import { callLLM } from "./llm/client";
import { trimContext } from "./llm/context";
import { executeTool, toolDefinitions } from "./tools";
import { saveMessage } from "./db/messages";
import { loadConfig } from "./config";
import { buildSystemPrompt } from "./prompts/system";
import { getSession } from "./db/sessions";
import type { Message } from "./llm/providers/types";

interface AgentCallbacks {
  onToken: (content: string) => void;
  onToolStart: (name: string, args: unknown) => void;
  onToolResult: (result: unknown) => void;
  onDone: (messageId: string) => void;
  onError: (message: string) => void;
  signal: AbortSignal;
}

// Active sessions hold in-memory context
const activeSessions = new Map<
  string,
  { projectPath: string; messages: Message[] }
>();

const abortControllers = new Map<string, AbortController>();

export async function runAgent(
  sessionId: string,
  userContent: string,
  cb: AgentCallbacks,
) {
  const session = getSession(sessionId);
  if (!session) {
    cb.onError("session not found");
    return;
  }

  // Initialize or retrieve in-memory context
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, {
      projectPath: session.project_path,
      messages: [],
    });
  }
  const ctx = activeSessions.get(sessionId)!;

  // Track abort controller for cancel support
  const ac = new AbortController();
  abortControllers.set(sessionId, ac);
  const signal = ac.signal;

  // Add user message
  ctx.messages.push({ role: "user", content: userContent });
  saveMessage(sessionId, "user", userContent);

  const config = loadConfig();
  const systemPrompt = await buildSystemPrompt(ctx.projectPath);

  while (!signal.aborted) {
    const contextMessages = trimContext(
      ctx.messages,
      config.max_context_tokens,
    );

    const response = await callLLM({
      provider: config.provider,
      model: config.model,
      apiKey: config.api_keys[config.provider],
      system: systemPrompt,
      messages: contextMessages,
      tools: toolDefinitions,
      signal,
      onToken: cb.onToken,
    });

    if (signal.aborted) break;

    ctx.messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls,
    });
    saveMessage(
      sessionId,
      "assistant",
      response.content,
      response.toolCalls,
      response.usage,
    );

    // No tool calls — agent is done
    if (!response.toolCalls?.length) {
      cb.onDone(crypto.randomUUID());
      break;
    }

    // Execute each tool call
    for (const call of response.toolCalls) {
      if (signal.aborted) break;

      cb.onToolStart(call.name, call.args);
      const result = await executeTool(call.name, call.args, ctx.projectPath);
      cb.onToolResult(result);

      ctx.messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
      saveMessage(sessionId, "tool", JSON.stringify(result));
    }
  }

  abortControllers.delete(sessionId);
}

export function cancelSession(sessionId: string) {
  abortControllers.get(sessionId)?.abort();
}
```

### src/tools/index.ts (Tool Registry)

```typescript
import { readFileTool } from "./read";
import { editFileTool } from "./edit";
import { writeFileTool } from "./write";
import { bashTool } from "./bash";
import { globTool } from "./glob";
import { grepTool } from "./grep";
import { skillTool } from "./skill";
import { webTool } from "./web";

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    projectPath: string,
  ) => Promise<unknown>;
}

const tools: ToolDef[] = [
  readFileTool,
  editFileTool,
  writeFileTool,
  bashTool,
  globTool,
  grepTool,
  skillTool,
  webTool,
];

export const toolDefinitions = tools.map(({ execute, ...def }) => def);

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  projectPath: string,
) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return { error: `unknown tool: ${name}` };

  try {
    return await tool.execute(args, projectPath);
  } catch (e) {
    return { error: String(e) };
  }
}
```

### src/tools/edit.ts

```typescript
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

export const editFileTool = {
  name: "edit_file",
  description:
    "Edit a file by replacing an exact string match with new content. The old_string must appear exactly once.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to project root",
      },
      old_string: { type: "string", description: "Exact string to find" },
      new_string: { type: "string", description: "Replacement string" },
    },
    required: ["path", "old_string", "new_string"],
  },
  execute: async (args: Record<string, unknown>, projectPath: string) => {
    const filePath = resolve(projectPath, args.path as string);
    if (!filePath.startsWith(projectPath))
      return { error: "path outside project" };

    const content = readFileSync(filePath, "utf-8");
    const oldStr = args.old_string as string;
    const occurrences = content.split(oldStr).length - 1;

    if (occurrences === 0) return { error: "old_string not found in file" };
    if (occurrences > 1)
      return {
        error: `found ${occurrences} matches — provide more context`,
      };

    writeFileSync(filePath, content.replace(oldStr, args.new_string as string));
    return { success: true, path: args.path };
  },
};
```

### src/tools/bash.ts

```typescript
import { resolve } from "path";

export const bashTool = {
  name: "bash",
  description:
    "Execute a shell command and return stdout, stderr, and exit code",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The command to execute" },
      workdir: {
        type: "string",
        description: "Working directory relative to project root",
      },
      timeout: {
        type: "number",
        description: "Timeout in ms (default 120000)",
      },
    },
    required: ["command"],
  },
  execute: async (args: Record<string, unknown>, projectPath: string) => {
    const cwd = args.workdir
      ? resolve(projectPath, args.workdir as string)
      : projectPath;
    const timeout = (args.timeout as number) || 120_000;

    const proc = Bun.spawn(["sh", "-c", args.command as string], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: process.env.HOME },
    });

    const timer = setTimeout(() => proc.kill(), timeout);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timer);
    const exitCode = await proc.exited;

    const maxLen = 50_000;
    return {
      stdout:
        stdout.length > maxLen
          ? stdout.slice(0, maxLen) + "\n[truncated]"
          : stdout,
      stderr:
        stderr.length > maxLen
          ? stderr.slice(0, maxLen) + "\n[truncated]"
          : stderr,
      exit_code: exitCode,
    };
  },
};
```

### src/tools/skill.ts

```typescript
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

export function discoverSkills(projectPath: string): SkillMeta[] {
  const skills: SkillMeta[] = [];
  const dirs = [
    { prefix: "", dir: join(import.meta.dir, "../skills/builtin") },
    { prefix: "", dir: join(homedir(), ".openkrow/skills") },
    { prefix: "project:", dir: join(projectPath, ".agent/skills") },
  ];

  for (const { prefix, dir } of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const skillFile = join(dir, name, "SKILL.md");
      if (!existsSync(skillFile)) continue;
      const content = readFileSync(skillFile, "utf-8");
      const desc = content.split("\n")[0]?.replace(/^#\s*/, "") || name;
      skills.push({
        name: `${prefix}${name}`,
        description: desc,
        path: skillFile,
      });
    }
  }
  return skills;
}

export const skillTool = {
  name: "load_skill",
  description:
    "Load specialized instructions for a specific domain or framework",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Skill name to load" },
    },
    required: ["name"],
  },
  execute: async (args: Record<string, unknown>, projectPath: string) => {
    const skills = discoverSkills(projectPath);
    const skill = skills.find((s) => s.name === args.name);
    if (!skill) {
      return {
        error: `skill "${args.name}" not found`,
        available: skills.map((s) => ({
          name: s.name,
          description: s.description,
        })),
      };
    }
    return { name: skill.name, content: readFileSync(skill.path, "utf-8") };
  },
};
```

### src/prompts/system.ts

```typescript
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { discoverSkills } from "../tools/skill";

export async function buildSystemPrompt(projectPath: string): Promise<string> {
  let prompt = readFileSync(
    join(import.meta.dir, "templates/base.md"),
    "utf-8",
  );

  // Project-specific instructions
  const projectInstructions = join(projectPath, ".agent/instructions.md");
  if (existsSync(projectInstructions)) {
    prompt += "\n\n## Project Instructions\n\n";
    prompt += readFileSync(projectInstructions, "utf-8");
  }

  // Available skills
  const skills = discoverSkills(projectPath);
  if (skills.length) {
    prompt += "\n\n## Available Skills\n\n";
    prompt +=
      "Use the `load_skill` tool to load detailed instructions when needed:\n\n";
    prompt += skills.map((s) => `- **${s.name}**: ${s.description}`).join("\n");
  }

  return prompt;
}
```

### src/llm/context.ts

```typescript
import type { Message } from "./providers/types";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimContext(messages: Message[], maxTokens: number): Message[] {
  const budget = maxTokens - 8192;
  let used = 0;
  const result: Message[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(JSON.stringify(messages[i]));
    if (used + cost > budget) break;
    used += cost;
    result.unshift(messages[i]);
  }

  return result;
}
```

### src/db/index.ts

```typescript
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";

const DATA_DIR = process.env.DATA_DIR || join(homedir(), ".openkrow");
const DB_PATH = join(DATA_DIR, "data.db");

const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`CREATE TABLE IF NOT EXISTS session (
  id              TEXT PRIMARY KEY,
  project_path    TEXT NOT NULL,
  title           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
)`);

db.run(`CREATE TABLE IF NOT EXISTS message (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  tool_calls      TEXT,
  token_usage     INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
)`);

db.run(`CREATE TABLE IF NOT EXISTS project (
  path            TEXT PRIMARY KEY,
  name            TEXT,
  instructions    TEXT,
  last_opened     INTEGER NOT NULL DEFAULT (unixepoch())
)`);

db.run(`CREATE TABLE IF NOT EXISTS file_index (
  path            TEXT NOT NULL,
  project_path    TEXT NOT NULL,
  hash            TEXT NOT NULL,
  summary         TEXT,
  embedding       BLOB,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (project_path, path)
)`);

export { db };
```

### src/config.ts

```typescript
import { watch } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(
  process.env.DATA_DIR || join(homedir(), ".openkrow"),
  "config.json",
);

const defaultConfig = {
  provider: "anthropic" as string,
  model: "claude-sonnet-4-20250514" as string,
  api_keys: {} as Record<string, string>,
  max_context_tokens: 128000,
  theme: "dark" as string,
};

let currentConfig = { ...defaultConfig };

export function loadConfig() {
  try {
    const file = Bun.file(CONFIG_PATH);
    if (file.size) {
      const loaded = JSON.parse(file.toString());
      currentConfig = { ...defaultConfig, ...loaded };
    }
  } catch {}
  return currentConfig;
}

// Initial load
loadConfig();

// Watch for config changes from Tauri/frontend
watch(CONFIG_PATH, () => loadConfig());
```

---

## Build & Distribution

### Build Pipeline

```typescript
// scripts/build.ts

import { $ } from "bun";

const target = process.argv[2] || "darwin-arm64";

// 1. Build agent binary
await $`bun build --compile --production --target=bun-${target} agent/index.ts --outfile src-tauri/resources/agent-bin`;
await $`chmod +x src-tauri/resources/agent-bin`;

// 2. Build frontend
await $`bun run --cwd src vite build`;

// 3. Build Tauri app
await $`cargo tauri build`;
```

### Cross-Platform Targets

```typescript
// scripts/build-all.ts

import { $ } from "bun";

const targets = [
  { bun: "bun-darwin-arm64", tauri: "aarch64-apple-darwin" },
  { bun: "bun-darwin-x64", tauri: "x86_64-apple-darwin" },
  { bun: "bun-linux-x64", tauri: "x86_64-unknown-linux-gnu" },
  { bun: "bun-windows-x64", tauri: "x86_64-pc-windows-msvc" },
];

for (const target of targets) {
  console.log(`Building for ${target.tauri}...`);
  await $`bun build --compile --production --target=${target.bun} agent/index.ts --outfile src-tauri/resources/agent-bin`;
  await $`cargo tauri build --target ${target.tauri}`;
}
```

### Final App Bundle

```
OpenKrow.app                    (~60MB total)
└── Contents/
    ├── MacOS/
    │   └── openkrow            # Tauri binary    ~10MB
    ├── Resources/
    │   └── agent-bin           # Bun agent       ~50MB
    └── _CodeSignature/         # macOS signing
```

---

## Performance Characteristics

| Operation                         | Latency             | Bottleneck           |
| --------------------------------- | ------------------- | -------------------- |
| App startup to agent ready        | ~200ms              | Webview rendering    |
| User sends message to first token | ~300-800ms          | LLM API network      |
| Token streaming pipeline          | <0.2ms per token    | LLM generation speed |
| Tool execution (file read)        | ~0.3ms              | Negligible           |
| Tool execution (bash)             | ~5ms + command time | Command itself       |
| HTTP localhost overhead           | ~1-2ms per request  | Negligible           |
| Context trimming                  | ~1-5ms              | Message count        |

---

## Security

- Agent server binds to `127.0.0.1` only (not accessible from network)
- Bearer token auth on all endpoints (random UUID per app launch)
- File operations restricted to project directory (path traversal check)
- Bash execution scoped to project working directory
- API keys stored in `~/.openkrow/config.json` (user-readable only)
- No secrets embedded in the binary
