/**
 * Model Registry — Known models with their capabilities and pricing.
 */

import type { Model, KnownProvider } from "./types.js";

const models: Model[] = [
  // ---- Anthropic ----
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    api: "anthropic-messages",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 32000,
    supportsTools: true,
    supportsThinking: true,
    inputCostPerMillion: 15,
    outputCostPerMillion: 75,
  },
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    api: "anthropic-messages",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 16000,
    supportsTools: true,
    supportsThinking: true,
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    api: "anthropic-messages",
    provider: "anthropic",
    contextWindow: 200000,
    maxTokens: 8192,
    supportsTools: true,
    supportsThinking: false,
    inputCostPerMillion: 0.8,
    outputCostPerMillion: 4,
  },

  // ---- OpenAI ----
  {
    id: "gpt-4o",
    name: "GPT-4o",
    api: "openai-completions",
    provider: "openai",
    contextWindow: 128000,
    maxTokens: 16384,
    supportsTools: true,
    supportsThinking: false,
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 10,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    api: "openai-completions",
    provider: "openai",
    contextWindow: 128000,
    maxTokens: 16384,
    supportsTools: true,
    supportsThinking: false,
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
  },
  {
    id: "o3-mini",
    name: "o3 Mini",
    api: "openai-completions",
    provider: "openai",
    contextWindow: 200000,
    maxTokens: 100000,
    supportsTools: true,
    supportsThinking: true,
    inputCostPerMillion: 1.1,
    outputCostPerMillion: 4.4,
  },

  // ---- Google ----
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    api: "google-generative-ai",
    provider: "google",
    contextWindow: 1048576,
    maxTokens: 65536,
    supportsTools: true,
    supportsThinking: true,
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.6,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    api: "google-generative-ai",
    provider: "google",
    contextWindow: 1048576,
    maxTokens: 65536,
    supportsTools: true,
    supportsThinking: true,
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 10,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    api: "google-generative-ai",
    provider: "google",
    contextWindow: 1048576,
    maxTokens: 8192,
    supportsTools: true,
    supportsThinking: false,
    inputCostPerMillion: 0.1,
    outputCostPerMillion: 0.4,
  },

  // ---- xAI ----
  {
    id: "grok-3",
    name: "Grok 3",
    api: "openai-completions",
    provider: "xai",
    baseUrl: "https://api.x.ai/v1",
    contextWindow: 131072,
    maxTokens: 16384,
    supportsTools: true,
    supportsThinking: false,
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
  },
  {
    id: "grok-3-mini",
    name: "Grok 3 Mini",
    api: "openai-completions",
    provider: "xai",
    baseUrl: "https://api.x.ai/v1",
    contextWindow: 131072,
    maxTokens: 16384,
    supportsTools: true,
    supportsThinking: true,
    inputCostPerMillion: 0.3,
    outputCostPerMillion: 0.5,
  },

  // ---- Groq ----
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    api: "openai-completions",
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    contextWindow: 128000,
    maxTokens: 32768,
    supportsTools: true,
    supportsThinking: false,
    inputCostPerMillion: 0.59,
    outputCostPerMillion: 0.79,
  },

  // ---- GitHub Copilot ----
  // Accessed via OpenAI-compatible Copilot proxy. baseUrl is set dynamically
  // from the Copilot token's proxy-ep field (see oauth/github-copilot.ts).
  // Cost is $0 — included in GitHub Copilot subscription.
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4 (Copilot)",
    api: "openai-completions",
    provider: "github-copilot",
    contextWindow: 200000,
    maxTokens: 16000,
    supportsTools: true,
    supportsThinking: false,
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet (Copilot)",
    api: "openai-completions",
    provider: "github-copilot",
    contextWindow: 200000,
    maxTokens: 8192,
    supportsTools: true,
    supportsThinking: false,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o (Copilot)",
    api: "openai-completions",
    provider: "github-copilot",
    contextWindow: 128000,
    maxTokens: 16384,
    supportsTools: true,
    supportsThinking: false,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini (Copilot)",
    api: "openai-completions",
    provider: "github-copilot",
    contextWindow: 128000,
    maxTokens: 16384,
    supportsTools: true,
    supportsThinking: false,
  },
  {
    id: "o3-mini",
    name: "o3 Mini (Copilot)",
    api: "openai-completions",
    provider: "github-copilot",
    contextWindow: 200000,
    maxTokens: 100000,
    supportsTools: true,
    supportsThinking: true,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash (Copilot)",
    api: "openai-completions",
    provider: "github-copilot",
    contextWindow: 1048576,
    maxTokens: 8192,
    supportsTools: true,
    supportsThinking: false,
  },

  // ---- DeepSeek ----
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    api: "openai-completions",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    contextWindow: 128000,
    maxTokens: 8192,
    supportsTools: true,
    supportsThinking: false,
    inputCostPerMillion: 0.27,
    outputCostPerMillion: 1.1,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    api: "openai-completions",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    contextWindow: 128000,
    maxTokens: 8192,
    supportsTools: false,
    supportsThinking: true,
    inputCostPerMillion: 0.55,
    outputCostPerMillion: 2.19,
  },
];

/**
 * Get a model by provider and model ID
 */
export function getModel(provider: KnownProvider, modelId: string): Model | undefined {
  return models.find((m) => m.provider === provider && m.id === modelId);
}

/**
 * Get a model by just the model ID (searches all providers)
 */
export function getModelById(modelId: string): Model | undefined {
  return models.find((m) => m.id === modelId);
}

/**
 * Get all models for a given provider
 */
export function getModels(provider: KnownProvider): Model[] {
  return models.filter((m) => m.provider === provider);
}

/**
 * Get all known providers
 */
export function getProviders(): KnownProvider[] {
  return [...new Set(models.map((m) => m.provider))];
}

/**
 * Get all known models
 */
export function getAllModels(): Model[] {
  return [...models];
}

/**
 * Calculate cost from usage and model pricing
 */
export function calculateCost(
  model: Model,
  usage: { inputTokens: number; outputTokens: number }
): number {
  const inputCost =
    (usage.inputTokens / 1_000_000) * (model.inputCostPerMillion ?? 0);
  const outputCost =
    (usage.outputTokens / 1_000_000) * (model.outputCostPerMillion ?? 0);
  return inputCost + outputCost;
}
