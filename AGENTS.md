# AGENTS.md

## Overview

Krow is a desktop AI chat app built with **Electrobun** (Bun-native desktop framework, not Electron). It wraps an **opencode** server via `@opencode-ai/sdk/v2` and renders a React 19 webview.

## Architecture

Three processes communicate via Electrobun's typed RPC:

- **Bun process** (`bun/`): Spawns opencode server, manages sessions, forwards SSE events
  - `index.ts` — entry point, auto-starts workspace on `~/Desktop`, manages app menu and settings window lifecycle
  - `workspace.ts` — opencode server lifecycle, session CRUD, question reply/reject, provider auth, MCP management
  - `stream.ts` — SSE event bridge (opencode → webview via RPC messages)
  - `rpc.ts` — main window RPC handler definitions, idempotent `initWorkspace`
  - `settings-rpc.ts` — settings window RPC handler (provider + MCP operations)
  - `agent.ts` — custom "krow" agent config, prompt loaded from `prompts/krow.txt`
- **Main webview** (`mainview/`): React 19 + Tailwind v4 chat UI
  - `rpc.ts` — webview-side RPC + event emitter
  - `App.tsx` — main state machine: loading → ready, session/question management
  - `components/ChatInput.tsx` — chat input with embedded model selector
  - `components/MessageList.tsx` — message rendering with markdown/tools
  - `components/QuestionPrompt.tsx` — question tool UI
  - `components/SessionHistory.tsx` — session history dropdown
  - `components/Settings.tsx` — legacy settings modal (unused, kept for reference)
- **Settings webview** (`settingsview/`): Separate native window for settings
  - `App.tsx` — settings UI with Providers and MCP Servers tabs
  - `rpc.ts` — settings-side RPC using `SettingsRPCSchema`
- **Shared** (`shared/types.ts`): RPC schema types (`KrowRPCSchema`, `SettingsRPCSchema`)

## Settings window

Settings is a **separate native window** (not a modal), opened via:
- **Cmd+,** keyboard shortcut (app menu accelerator)
- Settings gear icon in the main window header (sends `openSettings` RPC)

Key implementation details:
- `openSettingsWindow()` in `bun/index.ts` creates a new `BrowserWindow` with its own RPC handler
- `viewsRoot` is captured at startup (before `process.chdir()`) to ensure `views://` URLs resolve correctly
- The settings window is destroyed on close; a new one is created each time
- Window close is tracked via `Electrobun.events.on("close")` matching the window ID
- Cleanup (`workspace.stop()`) only runs when the **main window** closes (by ID check), not settings

### Provider auth flow
- Providers have `authMethods` (type `"api"` or `"oauth"`) with optional dynamic `prompts`
- `prompts` can have conditional visibility via `when: { key, op, value }` clauses
- If an API method has no prompts, a fallback API key input is shown
- OAuth flow: `startProviderOAuth` → opens browser → user pastes code → `completeProviderOAuth`
- UI uses **optimistic updates** — provider `connected` state updates immediately without re-fetching from server

### Settings ↔ Main window sync
- After any mutation (auth set/remove, MCP add/remove), settings RPC calls `rpc.send.settingsChanged({})` to the main window
- Main window listens for `settingsChanged` and increments a `refreshKey` to re-fetch the model list in `ChatInput`

## Key constraints

- Uses `@opencode-ai/sdk/v2` (v2 inline parameter style, NOT v1 `{ body, path, query }` style)
- `process.chdir()` to workspace path breaks `views://` URL resolution if called before webview loads — workspace start is deferred to `initWorkspace` RPC (called by webview on mount)
- New windows created after `process.chdir()` must pass `viewsRoot` explicitly
- `initWorkspace` is idempotent (cached promise) to prevent multiple opencode instances
- Port `0` for opencode server (OS-assigned) to avoid port conflicts
- Tailwind CSS is compiled separately (`bun run css`), output committed as `mainview/styles.css`
- Settings view shares `mainview/styles.css` via `views://mainview/styles.css` cross-view reference
- Always read files before writing — the user may have made edits outside the agent

## App menu & keyboard shortcuts

| Menu | Items | Shortcut |
|------|-------|----------|
| Krow | About, Settings, Hide, Hide Others, Show All, Quit | Cmd+, / Cmd+Q |
| Edit | Undo, Redo, Cut, Copy, Paste, Select All | Cmd+Z/X/C/V/A |
| View | Toggle Full Screen | Ctrl+Cmd+F |
| Window | Minimize, Zoom, Close | Cmd+M / Cmd+W |

Custom menu actions are handled via `ApplicationMenu.on("application-menu-clicked")`.

## Commands

```sh
bun run dev          # dev mode with CSS watch + electrobun watch
bun run start        # build CSS once + electrobun dev
bun run build        # production build
npx tsc --noEmit     # typecheck (one pre-existing error in electrobun dep re: @types/three is expected)
```

## SDK usage (v2)

```ts
// Correct v2 style:
client.session.list({ directory: "..." })
client.session.create({})
client.session.messages({ sessionID: "..." })
client.session.promptAsync({ sessionID, agent, parts, model })
client.question.reply({ requestID, answers })
client.question.reject({ requestID })
client.provider.list()
client.provider.auth()
client.auth.set({ providerID, auth })
client.auth.remove({ providerID })
client.provider.oauth.authorize({ providerID, method, inputs })
client.provider.oauth.callback({ providerID, method, code })
client.mcp.status()
client.mcp.add({ name, config })
client.mcp.connect({ name })
client.mcp.disconnect({ name })
client.config.update({ ... })  // for MCP removal (no dedicated remove endpoint)

// WRONG v1 style (do not use):
client.session.list({ query: { directory: "..." } })
client.session.create({ body: {} })
client.session.messages({ path: { id: "..." } })
```
