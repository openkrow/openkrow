/**
 * OAuth Provider Registry
 *
 * Central registry for OAuth-based providers (GitHub Copilot, Anthropic, etc.).
 * Handles provider registration, token refresh, and API key resolution.
 */

import type { OAuthCredentials, OAuthProviderInterface } from "./types.js";
import { githubCopilotOAuthProvider } from "./github-copilot.js";
import { anthropicOAuthProvider } from "./anthropic.js";

const oauthProviders = new Map<string, OAuthProviderInterface>();

/**
 * Register an OAuth provider
 */
export function registerOAuthProvider(provider: OAuthProviderInterface): void {
  oauthProviders.set(provider.id, provider);
}

/**
 * Get an OAuth provider by ID
 */
export function getOAuthProvider(id: string): OAuthProviderInterface | undefined {
  return oauthProviders.get(id);
}

/**
 * Get all registered OAuth provider IDs
 */
export function getOAuthProviderIds(): string[] {
  return [...oauthProviders.keys()];
}

/**
 * Check if credentials are expired (or will expire within bufferMs)
 */
export function isExpired(credentials: OAuthCredentials, bufferMs = 0): boolean {
  return Date.now() + bufferMs >= credentials.expires;
}

/**
 * Get a valid API key for an OAuth provider, refreshing if needed.
 *
 * @param providerId - The OAuth provider ID (e.g. "github-copilot")
 * @param credentials - Current stored credentials
 * @returns Updated credentials (with refreshed access token if needed) and the API key string
 */
export async function getOAuthApiKey(
  providerId: string,
  credentials: OAuthCredentials,
): Promise<{ credentials: OAuthCredentials; apiKey: string }> {
  const provider = oauthProviders.get(providerId);
  if (!provider) {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }

  let current = credentials;

  // Refresh if expired or expiring within 60 seconds
  if (isExpired(current, 60_000)) {
    current = await provider.refreshToken(current);
  }

  return {
    credentials: current,
    apiKey: provider.getApiKey(current),
  };
}

// --- Register built-in OAuth providers ---
registerOAuthProvider(githubCopilotOAuthProvider);
registerOAuthProvider(anthropicOAuthProvider);

// --- Re-exports ---
export type { OAuthCredentials, OAuthAuthInfo, OAuthPrompt, OAuthLoginCallbacks, OAuthProviderInterface } from "./types.js";
export { loginGitHubCopilot, refreshGitHubCopilotToken, buildCopilotHeaders, getGitHubCopilotBaseUrl } from "./github-copilot.js";
export { loginAnthropic, refreshAnthropicToken } from "./anthropic.js";
