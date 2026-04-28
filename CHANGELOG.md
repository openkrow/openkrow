# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Agent tools**: 9 built-in tools — read, write, edit, bash, todo, webfetch, websearch, skill, question
- **Tool factory**: `createTool()` helper with `ok()`/`fail()` result helpers and workspace sandboxing via `resolveAndGuard()`
- **ToolManager**: Auto-registers all built-in tools (replaced manual `ToolRegistry`)
- **Workspace package** (`@openkrow/workspace`): WorkspaceManager with init/load, context.md, jobs CRUD, templates, scripts
- **Config package** (`@openkrow/config`): ConfigManager backed by database settings — model selection, API keys, OAuth credentials
- **Skill package** (`@openkrow/skill`): SkillManager with install/uninstall/enable/disable, 4 built-in skills (pdf, docx, xlsx, pptx), SKILL.md frontmatter parser
- **Split database**: Global DB (`~/.openkrow/database/openkrow.db`) for settings; Workspace DB (`<workspace>/.krow/data.db`) for conversations and messages
- **API server**: Bun HTTP server with endpoints for chat, streaming, conversations, API key management, model configuration
- **Auth gate**: Bearer token authentication on all endpoints (except /health)
- **Request cancellation**: `POST /chat/cancel` with AbortController per conversationId
- **Per-request LLM config**: `RunOptions` with provider/model overrides, AbortSignal, maxTurns
- **Agent query loop**: `while(true)` with `needsFollowUp` derived from tool_use blocks in response content
- **System prompt assembly**: Workspace context.md + skill descriptions injected into prompt
- **Comprehensive documentation**: README, ARCHITECTURE, CONTRIBUTING, SECURITY, API reference, and guides

### Changed

- Renamed `ToolRegistry` to `ToolManager`
- Switched CI from npm to Bun
- Database uses `openDatabase()` factory instead of singleton; `BaseRepository` takes DB via constructor
- Removed `workspace_path` from conversations table (implicit from workspace DB location)

### Removed

- Sessions and users concept — no `users` table, `sessions` table, `SessionManager`, or related repositories
- Cross-package re-exports from agent and app packages
- Default turn limits (`DEFAULT_MAX_TURNS`, `DEFAULT_MAX_TOOL_CALLS_PER_TURN`) from agent — runs until done
- Dead CLI code and config loader from app
