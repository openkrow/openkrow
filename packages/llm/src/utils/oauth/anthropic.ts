/**
 * Anthropic OAuth flow (Authorization Code + PKCE)
 *
 * Uses a local HTTP callback server to receive the authorization code.
 * This module only works in Node.js / Bun environments (requires `node:http` and `node:crypto`).
 */

import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "./types.js";
import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";

const ANTHROPIC_AUTH_URL = "https://console.anthropic.com/oauth/authorize";
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";

// Anthropic's public OAuth client ID for CLI/desktop apps
const ANTHROPIC_CLIENT_ID = "a24a2b5a-4be6-4bea-9738-e62e47b0dab3";
const CALLBACK_PORT_RANGE = { min: 18900, max: 18999 };

/**
 * Generate a cryptographically random string (URL-safe base64)
 */
function randomUrlSafe(byteLength: number): string {
  return randomBytes(byteLength)
    .toString("base64url");
}

/**
 * Create a PKCE code verifier and challenge (S256)
 */
function createPKCE(): { verifier: string; challenge: string } {
  const verifier = randomUrlSafe(32);
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

/**
 * Start a local HTTP server to receive the OAuth callback.
 * Returns the authorization code once received.
 */
function waitForCallback(
  port: number,
  state: string,
  signal?: AbortSignal,
): Promise<{ code: string; server: Server }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Login cancelled"));
      return;
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        const desc = url.searchParams.get("error_description") ?? error;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Authorization failed</h2><p>${desc}</p><p>You can close this tab.</p></body></html>`);
        reject(new Error(`Anthropic OAuth error: ${desc}`));
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");

      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<html><body><h2>Invalid callback</h2><p>Missing code or state mismatch.</p></body></html>`);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to your app.</p></body></html>`);

      resolve({ code, server });
    });

    server.listen(port, "127.0.0.1");

    signal?.addEventListener("abort", () => {
      server.close();
      reject(new Error("Login cancelled"));
    }, { once: true });
  });
}

/**
 * Try to find an available port in the range
 */
async function findAvailablePort(): Promise<number> {
  for (let port = CALLBACK_PORT_RANGE.min; port <= CALLBACK_PORT_RANGE.max; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = createServer();
        s.listen(port, "127.0.0.1", () => {
          s.close(() => resolve());
        });
        s.on("error", reject);
      });
      return port;
    } catch {
      continue;
    }
  }
  throw new Error(`No available port in range ${CALLBACK_PORT_RANGE.min}-${CALLBACK_PORT_RANGE.max}`);
}

/**
 * Exchange an authorization code for tokens
 */
async function exchangeCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<OAuthCredentials> {
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ANTHROPIC_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (typeof data.access_token !== "string") {
    throw new Error("Invalid token response from Anthropic");
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;

  return {
    access: data.access_token as string,
    refresh: (data.refresh_token as string) ?? "",
    expires: Date.now() + expiresIn * 1000 - 60_000, // 1 min buffer
  };
}

/**
 * Refresh Anthropic credentials using a refresh token
 */
export async function refreshAnthropicToken(
  refreshToken: string,
): Promise<OAuthCredentials> {
  const response = await fetch(ANTHROPIC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ANTHROPIC_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (typeof data.access_token !== "string") {
    throw new Error("Invalid refresh response from Anthropic");
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;

  return {
    access: data.access_token as string,
    refresh: (data.refresh_token as string) ?? refreshToken,
    expires: Date.now() + expiresIn * 1000 - 60_000,
  };
}

/**
 * Login with Anthropic using authorization code + PKCE flow
 */
export async function loginAnthropic(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const port = await findAvailablePort();
  const redirectUri = `http://localhost:${port}/callback`;

  const state = randomUrlSafe(16);
  const { verifier, challenge } = createPKCE();

  const authUrl = new URL(ANTHROPIC_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", ANTHROPIC_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("scope", "user:inference");
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  // Tell the caller to open the browser
  callbacks.onAuth({
    url: authUrl.toString(),
    instructions: "Open this URL in your browser to authorize with Anthropic",
  });

  callbacks.onProgress?.("Waiting for authorization...");

  // Wait for the callback
  const { code, server } = await waitForCallback(port, state, callbacks.signal);

  callbacks.onProgress?.("Exchanging authorization code...");

  try {
    return await exchangeCode(code, redirectUri, verifier);
  } finally {
    server.close();
  }
}

/**
 * OAuthProviderInterface implementation for Anthropic
 */
export const anthropicOAuthProvider: OAuthProviderInterface = {
  id: "anthropic",
  name: "Anthropic",

  async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
    return loginAnthropic(callbacks);
  },

  async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    return refreshAnthropicToken(credentials.refresh);
  },

  getApiKey(credentials: OAuthCredentials): string {
    return credentials.access;
  },
};
