# Getting Started

This guide walks you through setting up and running OpenKrow.

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- An API key for at least one LLM provider (Anthropic, OpenAI, Google, etc.)

## Installation

```bash
git clone https://github.com/openkrow/openkrow.git
cd openkrow
bun install
```

## Build

```bash
bun run build
```

This compiles all packages via Turborepo in dependency order.

## Configure an LLM Provider

OpenKrow needs at least one LLM API key. You can provide it via environment variable or store it through the API after the server starts.

**Environment variable (recommended for local dev):**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Supported env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`.

**Via API (after server starts):**

```bash
curl -X POST http://localhost:3000/auth/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVER_KEY" \
  -d '{"provider": "anthropic", "apiKey": "sk-ant-..."}'
```

## Start the Server

```bash
bun run apps/openkrow/src/index.ts
```

Or with options:

```bash
OPENKROW_WORKSPACE="/path/to/workspace" \
OPENKROW_API_KEY="my-secret-key" \
bun run apps/openkrow/src/index.ts
```

The server starts on `http://localhost:3000` by default.

## Initialize a Workspace

Before using OpenKrow, initialize a workspace directory:

```bash
mkdir ~/my-workspace
```

When the server starts with a workspace path, it automatically creates the workspace structure (context.md, templates/, jobs/, scripts/) on first use.

## Send Your First Message

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVER_KEY" \
  -d '{"message": "Create a summary of the files in my workspace"}'
```

Response:

```json
{
  "response": "I'll look through your workspace files...",
  "conversationId": "abc123",
  "messageId": "msg456"
}
```

Use the `conversationId` to continue the conversation:

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVER_KEY" \
  -d '{"message": "Now export that as a PDF", "conversationId": "abc123"}'
```

## Streaming

Set `"stream": true` to receive Server-Sent Events:

```bash
curl -N -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SERVER_KEY" \
  -d '{"message": "Write a report about Q4 sales", "stream": true}'
```

## Next Steps

- [API Reference](./api-reference.md) — full endpoint documentation
- [Tools](./tools.md) — what the agent can do
- [Skills](./skills.md) — document processing capabilities
- [Workspace](./workspace.md) — workspace structure and management
- [Configuration](./configuration.md) — model and provider settings
