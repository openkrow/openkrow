/**
 * Environment variable API key resolution
 */

import type { KnownProvider, EnvApiKeyMap } from "./types.js";

const ENV_API_KEY_MAP: EnvApiKeyMap[] = [
  { provider: "openai", envVars: ["OPENAI_API_KEY"] },
  { provider: "anthropic", envVars: ["ANTHROPIC_API_KEY"] },
  { provider: "google", envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"] },
  { provider: "xai", envVars: ["XAI_API_KEY"] },
  { provider: "groq", envVars: ["GROQ_API_KEY"] },
  { provider: "deepseek", envVars: ["DEEPSEEK_API_KEY"] },
  { provider: "openrouter", envVars: ["OPENROUTER_API_KEY"] },
  { provider: "github-copilot", envVars: ["GITHUB_COPILOT_TOKEN"] },
];

/**
 * Resolve an API key for a provider from environment variables
 */
export function resolveApiKey(provider: KnownProvider): string | undefined {
  const mapping = ENV_API_KEY_MAP.find((m) => m.provider === provider);
  if (!mapping) return undefined;

  for (const envVar of mapping.envVars) {
    const value = process.env[envVar];
    if (value) return value;
  }

  return undefined;
}
