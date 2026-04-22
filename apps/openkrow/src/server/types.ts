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
  /** Optional session ID */
  sessionId?: string;
  /** Whether to stream the response */
  stream?: boolean;
}

export interface ChatResponse {
  /** The assistant's response */
  response: string;
  /** Conversation ID for continuing the conversation */
  conversationId: string;
  /** Session ID */
  sessionId: string;
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
