/**
 * Server configuration and types
 */

export interface ServerConfig {
  /** Port to listen on (default: 3000) */
  port: number;
  /** Host to bind to (default: localhost) */
  host: string;
  /** Enable CORS (default: true) */
  cors: boolean;
  /** API prefix (default: /api) */
  apiPrefix: string;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 3000,
  host: "localhost",
  cors: true,
  apiPrefix: "/api",
};

export interface ChatRequest {
  /** The user's message */
  message: string;
  /** Optional conversation ID to continue a conversation */
  conversationId?: string;
  /** Whether to stream the response */
  stream?: boolean;
  /** Optional provider override for this request */
  provider?: string;
  /** Optional model override for this request */
  model?: string;
}

export interface ChatResponse {
  /** The assistant's response */
  response: string;
  /** Conversation ID for continuing the conversation */
  conversationId: string;
  /** Message ID */
  messageId: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export interface HealthResponse {
  status: "ok" | "error";
  version: string;
  uptime: number;
}

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

export interface ApiKeySetRequest {
  /** Provider name (e.g. "anthropic", "openai", "google") */
  provider: string;
  /** The API key value */
  apiKey: string;
}

export interface ApiKeyListResponse {
  /** Provider names that have stored keys (values are masked) */
  keys: Array<{ provider: string; masked: string }>;
}

// ---------------------------------------------------------------------------
// Model config types
// ---------------------------------------------------------------------------

export interface ModelConfigResponse {
  provider: string;
  model: string;
}

export interface ModelConfigSetRequest {
  provider: string;
  model: string;
}

export interface ModelListResponse {
  models: Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    maxTokens: number;
    reasoning: boolean;
  }>;
  providers: string[];
}
