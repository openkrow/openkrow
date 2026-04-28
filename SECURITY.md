# Security Policy

## Security Model

### API Authentication

OpenKrow uses Bearer token authentication for its HTTP API:

- Set `OPENKROW_SERVER_API_KEY` as an environment variable
- All requests (except `/health`) must include `Authorization: Bearer <key>`
- The token is held in memory only -- never written to disk or database
- If no key is set, the API is open (suitable for local development)

### API Key Storage

Provider API keys (Anthropic, OpenAI, etc.) are stored in the global SQLite database at `~/.openkrow/database/openkrow.db`. The database file should be protected by OS-level file permissions.

Keys are stored as plaintext in the database. This is intentional for a local-first desktop tool -- the threat model assumes the user's filesystem is trusted. If you need encrypted key storage, consider using environment variables instead.

### Workspace Sandboxing

File-accessing tools (read, write, edit, bash) are **sandboxed** to the workspace path:

- All file paths are resolved and checked against the workspace root
- Path traversal attacks (e.g., `../../etc/passwd`) are blocked by `resolveAndGuard()`
- The bash tool runs commands with the workspace as the working directory

### Data Isolation

Each workspace has its own SQLite database at `<workspace>/.krow/data.db`. Conversations and messages from one workspace cannot be accessed by another.

### Dependencies

We minimize dependencies and audit them regularly. Key runtime dependencies:

- `bun:sqlite` -- SQLite driver (built into Bun runtime)
- `eventemitter3` -- Event emitter for agent events
- `chalk`, `strip-ansi`, `wrap-ansi` -- Terminal formatting (TUI package only)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Disclosure Policy

- We will confirm receipt of vulnerability reports within 48 hours
- We aim to release fixes within 7 days for critical vulnerabilities
- We will credit reporters in the changelog (unless anonymity is requested)
