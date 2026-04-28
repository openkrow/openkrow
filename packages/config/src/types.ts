/**
 * @openkrow/config — Type definitions
 */

import type { KnownProvider } from "@openkrow/llm";

// ---------------------------------------------------------------------------
// Model configuration
// ---------------------------------------------------------------------------

/** The active model selection persisted in the database. */
export interface ModelConfig {
  /** LLM provider */
  provider: KnownProvider;
  /** Model identifier (e.g. "claude-sonnet-4-20250514") */
  model: string;
}

/** Per-model overrides (temperature, maxTokens, etc.). */
export interface ModelOverrides {
  /** Temperature (0-2) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Custom base URL */
  baseUrl?: string;
  /** Maximum agent turns per prompt */
  maxTurns?: number;
}

// ---------------------------------------------------------------------------
// API key configuration
// ---------------------------------------------------------------------------

/** A stored API key for a provider. */
export interface ApiKeyEntry {
  provider: string;
  /** The raw API key value */
  apiKey: string;
  /** When the key was stored (ISO string) */
  storedAt: string;
}

/** API key with masked value (for listing without exposing secrets). */
export interface ApiKeyInfo {
  provider: string;
  masked: string;
  storedAt: string;
}

// ---------------------------------------------------------------------------
// OAuth configuration
// ---------------------------------------------------------------------------

/** Stored OAuth credentials for a provider. */
export interface OAuthEntry {
  /** OAuth provider ID (e.g. "github-copilot", "anthropic") */
  providerId: string;
  /** Refresh token */
  refresh: string;
  /** Access token */
  access: string;
  /** Expiry timestamp in milliseconds */
  expires: number;
  /** Provider-specific extra fields */
  extra?: Record<string, unknown>;
  /** When the credentials were first stored (ISO string) */
  storedAt: string;
}

/** OAuth info with masked tokens (for listing). */
export interface OAuthInfo {
  providerId: string;
  expires: number;
  expired: boolean;
  storedAt: string;
}

// ---------------------------------------------------------------------------
// General settings
// ---------------------------------------------------------------------------

/** Well-known setting keys used by ConfigManager. */
export const SETTING_KEYS = {
  /** Active model selection */
  MODEL_PROVIDER: "config:model.provider",
  MODEL_ID: "config:model.id",

  /** Per-model overrides prefix: config:model_overrides:<provider>/<modelId> */
  MODEL_OVERRIDES_PREFIX: "config:model_overrides:",

  /** API key prefix: config:apikey:<provider> */
  API_KEY_PREFIX: "config:apikey:",

  /** OAuth credentials prefix: config:oauth:<providerId> */
  OAUTH_PREFIX: "config:oauth:",

  /** System prompt override */
  SYSTEM_PROMPT: "config:system_prompt",

  /** Workspace path */
  WORKSPACE_PATH: "config:workspace_path",

  /** Max agent turns */
  MAX_TURNS: "config:max_turns",
} as const;
