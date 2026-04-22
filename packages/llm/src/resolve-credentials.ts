/**
 * Credential resolution for LLM providers
 *
 * Priority order:
 *   1. Explicit apiKey in StreamOptions
 *   2. OAuth credentials in StreamOptions (auto-refreshes if expired)
 *   3. Environment variable fallback (if envFallback !== false)
 */

import type { KnownProvider, StreamOptions } from "./types.js";
import { resolveApiKey } from "./env-api-keys.js";
import { getOAuthProvider, isExpired } from "./utils/oauth/index.js";

export interface ResolvedCredentials {
  apiKey: string;
  /** Extra headers to inject (e.g. Copilot headers) */
  extraHeaders?: Record<string, string>;
}

/**
 * Resolve credentials for a provider from StreamOptions.
 *
 * @param provider - The provider identifier
 * @param options - Stream options (may contain apiKey, oauthCredentials, or neither)
 * @returns The resolved API key, or undefined if no credentials available
 */
export async function resolveCredentials(
  provider: KnownProvider,
  options?: StreamOptions,
): Promise<ResolvedCredentials | undefined> {
  // 1. Explicit API key — highest priority
  if (options?.apiKey) {
    return { apiKey: options.apiKey };
  }

  // 2. OAuth credentials — auto-refresh if expired
  if (options?.oauthCredentials) {
    const oauth = options.oauthCredentials;
    const oauthProvider = getOAuthProvider(oauth.providerId);

    let access = oauth.access;

    // Check if token needs refresh
    if (isExpired({ refresh: oauth.refresh, access: oauth.access, expires: oauth.expires }, 60_000)) {
      if (!oauthProvider) {
        // Can't refresh without a registered provider — use the token as-is
        // (it may fail at the API level)
        return { apiKey: access };
      }

      const refreshed = await oauthProvider.refreshToken({
        refresh: oauth.refresh,
        access: oauth.access,
        expires: oauth.expires,
        ...oauth.extra,
      });

      access = oauthProvider.getApiKey(refreshed);

      // Notify the caller so they can persist the updated credentials
      oauth.onRefresh?.({
        refresh: refreshed.refresh,
        access: refreshed.access,
        expires: refreshed.expires,
        extra: oauth.extra,
      });
    } else if (oauthProvider) {
      access = oauthProvider.getApiKey({
        refresh: oauth.refresh,
        access: oauth.access,
        expires: oauth.expires,
        ...oauth.extra,
      });
    }

    return { apiKey: access };
  }

  // 3. Environment variable fallback
  if (options?.envFallback !== false) {
    const envKey = resolveApiKey(provider);
    if (envKey) return { apiKey: envKey };
  }

  return undefined;
}
