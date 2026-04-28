<p align="center">
  <h1 align="center">OpenKrow</h1>
  <p align="center">The open-source AI agent that does real work on your computer.</p>
</p>

<p align="center">
  <a href="https://github.com/openkrow/openkrow/actions"><img src="https://github.com/openkrow/openkrow/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-f472b6" alt="Bun"></a>
</p>

---

OpenKrow is an AI agent that helps you get real work done. It reads your files, writes documents, runs scripts, searches the web, and manages your tasks -- all through natural language.

It is built for **office workers, students, and researchers** who spend their days working with documents, spreadsheets, presentations, and data. Instead of learning complex tools, you just tell OpenKrow what you need.

## What Can It Do?

**Documents and Files**
- Create, read, and edit Word documents (`.docx`), PowerPoint presentations (`.pptx`), Excel spreadsheets (`.xlsx`), and PDFs
- Generate reports, memos, letters, and templates from descriptions
- Extract data from spreadsheets, clean it, apply formulas, and create charts
- Merge, split, rotate, watermark, and OCR PDF files

**Daily Office Tasks**
- Draft emails and documents in your style
- Summarize long documents and meeting notes
- Convert between file formats
- Organize and rename files in bulk
- Search the web for information and compile findings

**Research and Learning**
- Gather information from multiple sources
- Summarize academic papers and articles
- Create study materials and flashcards
- Answer questions about your project or codebase

**Development**
- Read, write, and edit code
- Run shell commands and scripts
- Debug errors and suggest fixes
- Navigate and understand large codebases

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0

### Install and Run

```bash
git clone https://github.com/openkrow/openkrow.git
cd openkrow
bun install
bun run build
```

Set an API key for your preferred provider:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
# or
export GOOGLE_API_KEY=...
```

Start the agent:

```bash
OPENKROW_WORKSPACE=/path/to/your/project \
bun run apps/openkrow/dist/index.js
```

### Talk to It

```bash
# Simple question
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Create a Word document with a project status report for Q4"}'

# Streaming response
curl -N -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Read the sales data in data.xlsx and create a summary chart", "stream": true}'
```

## How It Works

OpenKrow is an **agentic AI** -- it doesn't just answer questions, it takes action. When you give it a task, it:

1. **Understands** what you need
2. **Plans** the steps to get it done
3. **Executes** using its built-in tools (file operations, shell commands, web search)
4. **Iterates** until the task is complete, handling errors along the way

The agent keeps running until the job is done. It can read files to understand context, write new files, run scripts to process data, search the web for missing information, and chain all of these together to complete complex multi-step tasks.

### Built-in Tools

| Tool | What it does |
|------|-------------|
| **Read** | Read any file with line numbers, pagination, and image support |
| **Write** | Create or overwrite files |
| **Edit** | Make precise edits to existing files |
| **Bash** | Run shell commands (install packages, process data, convert formats) |
| **Todo** | Track multi-step tasks and show progress |
| **Web Fetch** | Download and read web pages |
| **Web Search** | Search the web for information |
| **Skill** | Load specialized instructions for complex domains |
| **Question** | Ask you for clarification when needed |

### Skills -- Specialized Knowledge

Skills give the agent deep expertise in specific domains. OpenKrow ships with built-in skills for common office file formats:

| Skill | Capabilities |
|-------|-------------|
| **PDF** | Read, create, merge, split, rotate, watermark, fill forms, encrypt/decrypt, OCR |
| **Word (.docx)** | Create, read, edit documents. Reports, memos, letters, templates |
| **Excel (.xlsx)** | Read, create, edit spreadsheets. Formulas, formatting, charts, data cleaning |
| **PowerPoint (.pptx)** | Create, read, edit presentations. Templates, layouts, slide management |

Skills are loaded on demand -- the agent fetches the specialized instructions only when it needs them for your task.

## Supported AI Models

OpenKrow works with 20+ models across 8 providers. Use whichever you prefer:

| Provider | Models |
|----------|--------|
| **Anthropic** | Claude Opus 4, Claude Sonnet 4, Claude 3.5 Haiku |
| **OpenAI** | GPT-4o, GPT-4o Mini, o3 Mini |
| **Google** | Gemini 2.5 Flash, Gemini 2.5 Pro, Gemini 2.0 Flash |
| **GitHub Copilot** | Claude Sonnet 4, GPT-4o, o3 Mini, Gemini 2.0 Flash (free with Copilot) |
| **xAI** | Grok 3, Grok 3 Mini |
| **Groq** | Llama 3.3 70B |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 |

API keys are resolved automatically: stored key > OAuth credentials > environment variable.

## Workspace

Every project gets its own **workspace** -- a directory where the agent keeps all its context:

```
your-project/
  .krow/
    data.db           # Conversation history (stays with your project)
  context.md          # Tell the agent about your project (always loaded)
  templates/          # Reusable document templates
  jobs/               # Saved task sessions
  scripts/            # Scripts the agent has written
```

Edit `context.md` to give the agent persistent knowledge about your project -- conventions, team members, file locations, anything it should always know.

Conversations are stored **inside your workspace**, not in a central database. Move the folder, and the history moves with it.

## API

OpenKrow exposes a simple HTTP API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/chat` | Send a message (set `"stream": true` for SSE) |
| `POST` | `/chat/cancel` | Cancel an active request |
| `GET` | `/conversations` | List recent conversations |
| `GET` | `/conversations/:id/messages` | Get conversation history |
| `GET` | `/models` | List available AI models |
| `GET` | `/config/model` | Get current model |
| `POST` | `/config/model` | Switch model |
| `POST` | `/auth/keys` | Store a provider API key |
| `GET` | `/auth/keys` | List stored keys (masked) |

Secure the API with a Bearer token: set `OPENKROW_SERVER_API_KEY` environment variable.

## Architecture

OpenKrow is a monorepo with focused packages:

| Package | Purpose |
|---------|---------|
| `@openkrow/llm` | Multi-provider LLM client (streaming, tool calling, 20+ models) |
| `@openkrow/agent` | Agent runtime (query loop, 9 tools, 5-phase context compaction) |
| `@openkrow/database` | SQLite layer (global settings + per-workspace conversations) |
| `@openkrow/config` | Configuration management (models, API keys, OAuth) |
| `@openkrow/workspace` | Workspace file management (context.md, jobs, templates) |
| `@openkrow/skill` | Skill system (install, load, prompt injection) |
| `@openkrow/tui` | Terminal UI components |
| `@openkrow/web-ui` | Web UI components |
| `apps/openkrow` | HTTP server that wires everything together |

> See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical deep-dive.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](ARCHITECTURE.md) | Technical deep-dive into every package |
| [Getting Started](docs/getting-started.md) | Setup, first run, and basic usage |
| [API Reference](docs/api-reference.md) | Complete HTTP API documentation |
| [Tools](docs/tools.md) | Built-in tools reference |
| [Skills](docs/skills.md) | Skill system and custom skills |
| [Workspace](docs/workspace.md) | Workspace structure and context.md |
| [Configuration](docs/configuration.md) | Models, API keys, and settings |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Security](SECURITY.md) | Security policy |
| [Changelog](CHANGELOG.md) | Release history |

## Development

```bash
bun install          # Install dependencies
bun run build        # Build all packages
bun run test         # Run all tests
bun run typecheck    # Type check
bun run dev          # Watch mode
```

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) -- Copyright (c) 2025 Bui Duc Huy
