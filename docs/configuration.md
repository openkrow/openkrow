# Configuration

OpenKrow uses a layered configuration system: database settings (persistent) with environment variable fallbacks.

## ConfigManager

The `ConfigManager` class (`@openkrow/config` package) is backed by the global database's settings table. It manages:

- Active model selection
- Per-model parameter overrides (temperature, max tokens, etc.)
- API keys for LLM providers
- OAuth credentials

## LLM Provider Setup

### API Keys

Three-tier resolution (highest priority first):

1. **Explicit** — passed per-request via `RunOptions.llm.apiKey`
2. **Database** — stored via `POST /auth/keys` or `ConfigManager.setApiKey()`
3. **Environment variable** — e.g., `ANTHROPIC_API_KEY`

### Supported Providers

| Provider | Env Variable | Models |
| -------- | ------------ | ------ |
| Anthropic | `ANTHROPIC_API_KEY` | Claude Opus 4, Sonnet 4, Haiku 3.5 |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, GPT-4o-mini, o1, o3-mini |
| Google | `GOOGLE_API_KEY` | Gemini 2.0 Flash, Gemini 2.5 Pro |
| xAI | `XAI_API_KEY` | Grok 3, Grok 3 Mini |
| Groq | `GROQ_API_KEY` | Llama 3.3 70B |
| DeepSeek | `DEEPSEEK_API_KEY` | DeepSeek Chat, Reasoner |
| OpenRouter | `OPENROUTER_API_KEY` | Multiple models via proxy |
| GitHub Copilot | OAuth device flow | Claude via Copilot |

### Model Selection

**Default:** Anthropic Claude Sonnet 4

**Change via API:**

```bash
# Get current model
curl http://localhost:3000/config/model \
  -H "Authorization: Bearer YOUR_KEY"

# Set model
curl -X POST http://localhost:3000/config/model \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"provider": "openai", "model": "gpt-4o"}'
```

**Per-request override:**

```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"message": "Hello", "provider": "google", "model": "gemini-2.0-flash"}'
```

## Server Configuration

The server accepts two parameters at startup:

| Parameter | Env Variable | Description |
| --------- | ------------ | ----------- |
| Workspace path | `OPENKROW_WORKSPACE` | Directory for workspace files (default: cwd) |
| Server API key | `OPENKROW_API_KEY` | Bearer token for auth (optional, no auth if unset) |

Server network settings are configured in code via `ServerConfig`:

```typescript
{
  port: 3000,        // default
  host: "localhost", // default
  cors: true,        // default
  apiPrefix: "/api"  // default
}
```

## Database Architecture

- **Global DB** (`~/.openkrow/database/openkrow.db`) — settings only (model config, API keys)
- **Workspace DB** (`<workspace>/.krow/data.db`) — conversations and messages

Both use SQLite via Bun's built-in `bun:sqlite` driver.
