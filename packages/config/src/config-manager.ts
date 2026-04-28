/**
 * @openkrow/config — ConfigManager
 *
 * Centralized configuration backed by the database settings table.
 * Manages: active model, per-model overrides, API keys, OAuth credentials,
 * system prompt, workspace path, and general app settings.
 */

import type { ISettingsRepository } from "@openkrow/database";
import type { KnownProvider, Model } from "@mariozechner/pi-ai";
import {
  getModel,
  getModels,
  getProviders,
  getEnvApiKey,
} from "@mariozechner/pi-ai";

import {
  SETTING_KEYS,
  type ModelConfig,
  type ModelOverrides,
  type ApiKeyEntry,
  type ApiKeyInfo,
  type OAuthEntry,
  type OAuthInfo,
} from "./types.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
};

const DEFAULT_MAX_TURNS = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get all models across all providers (pi-ai doesn't have getAllModels).
 */
function getAllModels(): Model<any>[] {
  return getProviders().flatMap((p: KnownProvider) => getModels(p));
}

// ---------------------------------------------------------------------------
// ConfigManager
// ---------------------------------------------------------------------------

export class ConfigManager {
  private settings: ISettingsRepository;

  constructor(settings: ISettingsRepository) {
    this.settings = settings;
  }

  // -----------------------------------------------------------------------
  // Active model
  // -----------------------------------------------------------------------

  /** Get the currently active model selection. */
  getActiveModel(): ModelConfig {
    const provider = this.settings.get(SETTING_KEYS.MODEL_PROVIDER);
    const model = this.settings.get(SETTING_KEYS.MODEL_ID);

    return {
      provider: (provider as KnownProvider) ?? DEFAULT_MODEL_CONFIG.provider,
      model: model ?? DEFAULT_MODEL_CONFIG.model,
    };
  }

  /** Set the active model. */
  setActiveModel(config: ModelConfig): void {
    this.settings.set(SETTING_KEYS.MODEL_PROVIDER, config.provider);
    this.settings.set(SETTING_KEYS.MODEL_ID, config.model);
  }

  /** Get the full Model object for the active selection, or undefined if not found in registry. */
  getActiveModelInfo(): Model<any> | undefined {
    const { provider, model } = this.getActiveModel();
    try {
      return getModel(provider as any, model as any);
    } catch {
      return undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Per-model overrides
  // -----------------------------------------------------------------------

  private modelOverridesKey(provider: string, modelId: string): string {
    return `${SETTING_KEYS.MODEL_OVERRIDES_PREFIX}${provider}/${modelId}`;
  }

  /** Get overrides for a specific model (temperature, maxTokens, etc.). */
  getModelOverrides(provider: string, modelId: string): ModelOverrides | null {
    return this.settings.getJson<ModelOverrides>(
      this.modelOverridesKey(provider, modelId)
    );
  }

  /** Set overrides for a specific model. */
  setModelOverrides(
    provider: string,
    modelId: string,
    overrides: ModelOverrides
  ): void {
    this.settings.setJson(
      this.modelOverridesKey(provider, modelId),
      overrides
    );
  }

  /** Remove overrides for a specific model. */
  removeModelOverrides(provider: string, modelId: string): boolean {
    return this.settings.delete(this.modelOverridesKey(provider, modelId));
  }

  // -----------------------------------------------------------------------
  // Model registry queries (delegates to @mariozechner/pi-ai)
  // -----------------------------------------------------------------------

  /** List all available models. */
  listModels(): Model<any>[] {
    return getAllModels();
  }

  /** List models for a specific provider. */
  listModelsByProvider(provider: KnownProvider): Model<any>[] {
    return getModels(provider);
  }

  /** List all known providers. */
  listProviders(): KnownProvider[] {
    return getProviders();
  }

  // -----------------------------------------------------------------------
  // API keys
  // -----------------------------------------------------------------------

  private apiKeyKey(provider: string): string {
    return `${SETTING_KEYS.API_KEY_PREFIX}${provider}`;
  }

  /** Store an API key for a provider. */
  setApiKey(provider: string, apiKey: string): void {
    const entry: ApiKeyEntry = {
      provider,
      apiKey,
      storedAt: new Date().toISOString(),
    };
    this.settings.setJson(this.apiKeyKey(provider), entry);
  }

  /** Get the raw API key for a provider. Returns null if not stored. */
  getApiKey(provider: string): string | null {
    const entry = this.settings.getJson<ApiKeyEntry>(this.apiKeyKey(provider));
    return entry?.apiKey ?? null;
  }

  /** Remove the stored API key for a provider. */
  removeApiKey(provider: string): boolean {
    return this.settings.delete(this.apiKeyKey(provider));
  }

  /** List all stored API keys (masked). */
  listApiKeys(): ApiKeyInfo[] {
    const all = this.settings.getAll();
    const results: ApiKeyInfo[] = [];

    for (const s of all) {
      if (!s.key.startsWith(SETTING_KEYS.API_KEY_PREFIX)) continue;
      try {
        const entry = JSON.parse(s.value) as ApiKeyEntry;
        results.push({
          provider: entry.provider,
          masked: maskSecret(entry.apiKey),
          storedAt: entry.storedAt,
        });
      } catch {
        // Corrupt entry — skip
      }
    }

    return results;
  }

  /**
   * Resolve the API key for a provider with fallback chain:
   * 1. Stored API key in DB
   * 2. Environment variable (via pi-ai's getEnvApiKey)
   *
   * Returns null if no key found anywhere.
   */
  resolveApiKey(provider: KnownProvider): string | null {
    // 1. DB-stored key
    const stored = this.getApiKey(provider);
    if (stored) return stored;

    // 2. Env var fallback
    return getEnvApiKey(provider) ?? null;
  }

  // -----------------------------------------------------------------------
  // OAuth credentials
  // -----------------------------------------------------------------------

  private oauthKey(providerId: string): string {
    return `${SETTING_KEYS.OAUTH_PREFIX}${providerId}`;
  }

  /** Store OAuth credentials for a provider. */
  setOAuthCredentials(entry: Omit<OAuthEntry, "storedAt">): void {
    const full: OAuthEntry = {
      ...entry,
      storedAt: new Date().toISOString(),
    };
    this.settings.setJson(this.oauthKey(entry.providerId), full);
  }

  /** Get stored OAuth credentials for a provider. Returns null if not stored. */
  getOAuthCredentials(providerId: string): OAuthEntry | null {
    return this.settings.getJson<OAuthEntry>(this.oauthKey(providerId));
  }

  /** Remove stored OAuth credentials for a provider. */
  removeOAuthCredentials(providerId: string): boolean {
    return this.settings.delete(this.oauthKey(providerId));
  }

  /** List all stored OAuth credentials (masked). */
  listOAuthCredentials(): OAuthInfo[] {
    const all = this.settings.getAll();
    const results: OAuthInfo[] = [];

    for (const s of all) {
      if (!s.key.startsWith(SETTING_KEYS.OAUTH_PREFIX)) continue;
      try {
        const entry = JSON.parse(s.value) as OAuthEntry;
        results.push({
          providerId: entry.providerId,
          expires: entry.expires,
          expired: Date.now() >= entry.expires,
          storedAt: entry.storedAt,
        });
      } catch {
        // Corrupt entry — skip
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // General settings
  // -----------------------------------------------------------------------

  /** Get the custom system prompt, or null for default. */
  getSystemPrompt(): string | null {
    return this.settings.get(SETTING_KEYS.SYSTEM_PROMPT);
  }

  /** Set a custom system prompt. */
  setSystemPrompt(prompt: string): void {
    this.settings.set(SETTING_KEYS.SYSTEM_PROMPT, prompt);
  }

  /** Remove the custom system prompt (revert to default). */
  removeSystemPrompt(): boolean {
    return this.settings.delete(SETTING_KEYS.SYSTEM_PROMPT);
  }

  /** Get the configured workspace path, or null. */
  getWorkspacePath(): string | null {
    return this.settings.get(SETTING_KEYS.WORKSPACE_PATH);
  }

  /** Set the workspace path. */
  setWorkspacePath(path: string): void {
    this.settings.set(SETTING_KEYS.WORKSPACE_PATH, path);
  }

  /** Remove the workspace path. */
  removeWorkspacePath(): boolean {
    return this.settings.delete(SETTING_KEYS.WORKSPACE_PATH);
  }

  /** Get the max turns setting. */
  getMaxTurns(): number {
    const val = this.settings.get(SETTING_KEYS.MAX_TURNS);
    if (!val) return DEFAULT_MAX_TURNS;
    const n = parseInt(val, 10);
    return isNaN(n) ? DEFAULT_MAX_TURNS : n;
  }

  /** Set the max turns setting. */
  setMaxTurns(turns: number): void {
    this.settings.set(SETTING_KEYS.MAX_TURNS, String(turns));
  }

  // -----------------------------------------------------------------------
  // Arbitrary settings (escape hatch)
  // -----------------------------------------------------------------------

  /** Get any setting by key. */
  get(key: string): string | null {
    return this.settings.get(key);
  }

  /** Set any setting by key. */
  set(key: string, value: string): void {
    this.settings.set(key, value);
  }

  /** Delete any setting by key. */
  delete(key: string): boolean {
    return this.settings.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mask a secret string for display. */
function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "..." + value.slice(-4);
}
