# API Reference

OpenKrow exposes a REST API on `http://localhost:3000` by default. All endpoints (except `/health`) require a Bearer token when `serverApiKey` is configured.

## Authentication

Include the server API key in every request:

```
Authorization: Bearer YOUR_SERVER_KEY
```

## Endpoints

### Health Check

```
GET /health
```

No authentication required.

**Response:**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 12345
}
```

---

### Send Message

```
POST /chat
```

**Request body:**

| Field            | Type    | Required | Description                          |
| ---------------- | ------- | -------- | ------------------------------------ |
| `message`        | string  | yes      | The user's message                   |
| `conversationId` | string  | no       | Continue an existing conversation    |
| `stream`         | boolean | no       | Enable SSE streaming (default false) |
| `provider`       | string  | no       | Override LLM provider for this request |
| `model`          | string  | no       | Override model for this request      |

**Response (non-streaming):**

```json
{
  "response": "...",
  "conversationId": "abc123",
  "messageId": "msg456"
}
```

**Response (streaming):** Server-Sent Events with JSON payloads:

```
data: {"type": "chunk", "content": "Hello"}
data: {"type": "chunk", "content": " world"}
data: {"type": "done"}
```

On error during streaming:

```
data: {"type": "error", "error": "..."}
```

---

### Cancel Request

```
POST /chat/cancel
```

**Request body:**

```json
{
  "conversationId": "abc123"
}
```

**Response:**

```json
{
  "ok": true,
  "cancelled": true
}
```

---

### List Conversations

```
GET /conversations?limit=10
```

**Response:**

```json
{
  "conversations": [
    {
      "id": "abc123",
      "title": "...",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:01:00Z"
    }
  ]
}
```

---

### Conversation History

```
GET /conversations/:id/messages?limit=100
```

**Response:**

```json
{
  "messages": [
    {
      "id": "msg456",
      "role": "user",
      "content": "Hello",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### List API Keys

```
GET /auth/keys
```

**Response:**

```json
{
  "keys": [
    { "provider": "anthropic", "masked": "sk-ant-...XYZ" }
  ]
}
```

---

### Store API Key

```
POST /auth/keys
```

**Request body:**

```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-..."
}
```

**Response:**

```json
{ "ok": true, "provider": "anthropic" }
```

---

### Remove API Key

```
DELETE /auth/keys/:provider
```

**Response:**

```json
{ "ok": true, "provider": "anthropic" }
```

---

### List Models

```
GET /models
```

**Response:**

```json
{
  "models": [
    {
      "id": "claude-sonnet-4-20250514",
      "name": "Claude Sonnet 4",
      "provider": "anthropic",
      "contextWindow": 200000,
      "maxTokens": 8192,
      "supportsTools": true
    }
  ],
  "providers": ["anthropic", "openai", "google", "xai", "groq", "deepseek", "openrouter", "github-copilot"]
}
```

---

### Get Active Model

```
GET /config/model
```

**Response:**

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514"
}
```

---

### Set Active Model

```
POST /config/model
```

**Request body:**

```json
{
  "provider": "openai",
  "model": "gpt-4o"
}
```

**Response:**

```json
{ "ok": true, "provider": "openai", "model": "gpt-4o" }
```

---

## Error Responses

All errors return a consistent format:

```json
{
  "error": "Human-readable message",
  "code": "ERROR_CODE"
}
```

Error codes: `UNAUTHORIZED`, `INVALID_BODY`, `INVALID_MESSAGE`, `EMPTY_MESSAGE`, `METHOD_NOT_ALLOWED`, `NOT_FOUND`, `INTERNAL_ERROR`.

## API Prefix

All endpoints are also available under `/api` prefix (e.g., `/api/chat`, `/api/health`).
