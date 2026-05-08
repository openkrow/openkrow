# Krow

A desktop AI agent built with [Electrobun](https://electrobun.dev) and powered by [opencode](https://opencode.ai). Krow runs directly on your desktop, providing AI-assisted productivity through a clean chat interface.

## Features

- **Desktop-native** — Built with Electrobun (Bun-native desktop framework), not Electron
- **AI chat interface** — Clean, minimal chat UI with markdown rendering, code blocks, and tool execution visibility
- **Session management** — Create new sessions, browse history, and switch between conversations
- **Model selection** — Choose from available AI models directly in the chat input
- **Interactive questions** — Handles multi-choice prompts from the AI agent with a native UI
- **Custom agent** — Ships with a "Krow" agent prompt tailored for desktop office productivity tasks

## Prerequisites

- [Bun](https://bun.sh) runtime installed
- [opencode CLI](https://opencode.ai) installed (expected at `~/.opencode/bin`)

## Getting Started

```sh
# Install dependencies
bun install

# Development mode (CSS watch + hot reload)
bun run dev

# Or build CSS once + start
bun run start
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Dev mode with CSS watch + Electrobun watch |
| `bun run start` | Build CSS once + Electrobun dev |
| `bun run build` | Production build |
| `bun run build:prod` | Production build (stable env) |
| `npx tsc --noEmit` | Type check |

## Architecture

Krow is a two-process desktop app:

```
┌─────────────────────────────────────────────┐
│  Bun Process (src/bun/)                     │
│  ├── Spawns opencode server (port auto)     │
│  ├── Manages sessions & questions           │
│  └── Forwards SSE events via RPC            │
│                    ▲                        │
│                    │ Electrobun typed RPC    │
│                    ▼                        │
│  Webview (src/mainview/)                    │
│  ├── React 19 + Tailwind v4 chat UI        │
│  ├── Message streaming with parts           │
│  └── Session history & model selection      │
└─────────────────────────────────────────────┘
```

- **Bun process** — Boots the opencode server, manages session lifecycle, bridges SSE events to the webview
- **Webview** — React chat interface with markdown rendering, tool call display, and question prompts
- **Shared types** — Typed RPC schema in `src/shared/types.ts`

## Tech Stack

- [Electrobun](https://electrobun.dev) — Bun-native desktop framework
- [opencode SDK v2](https://opencode.ai) — AI agent server & client
- [React 19](https://react.dev) — UI framework
- [Tailwind CSS v4](https://tailwindcss.com) — Styling
- [TypeScript](https://typescriptlang.org) — Type safety

## License

MIT
