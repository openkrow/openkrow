/**
 * GitHub Copilot OAuth flow (Device Code)
 */

import type { Model } from "../../types.js";
import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "./types.js";

type CopilotCredentials = OAuthCredentials & {
  enterpriseUrl?: string;
};

const CLIENT_ID = "Iv1.b507a08c87ecfe98";

const COPILOT_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
} as const;

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname;
  } catch {
    return null;
  }
}

function getUrls(domain: string) {
  return {
    deviceCodeUrl: `https://${domain}/login/device/code`,
    accessTokenUrl: `https://${domain}/login/oauth/access_token`,
    copilotTokenUrl: `https://api.${domain}/copilot_internal/v2/token`,
  };
}

/**
 * Extract API base URL from a Copilot token's proxy-ep field.
 * Token format: tid=...;exp=...;proxy-ep=proxy.individual.githubcopilot.com;...
 */
export function getGitHubCopilotBaseUrl(token?: string, enterpriseDomain?: string): string {
  if (token) {
    const match = token.match(/proxy-ep=([^;]+)/);
    if (match) {
      const apiHost = match[1].replace(/^proxy\./, "api.");
      return `https://${apiHost}`;
    }
  }
  if (enterpriseDomain) return `https://copilot-api.${enterpriseDomain}`;
  return "https://api.individual.githubcopilot.com";
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return response.json();
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Login cancelled"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Login cancelled"));
    }, { once: true });
  });
}

async function startDeviceFlow(domain: string) {
  const urls = getUrls(domain);
  const data = await fetchJson(urls.deviceCodeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      ...COPILOT_HEADERS,
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: "read:user",
    }),
  }) as Record<string, unknown>;

  return {
    device_code: data.device_code as string,
    user_code: data.user_code as string,
    verification_uri: data.verification_uri as string,
    interval: data.interval as number,
    expires_in: data.expires_in as number,
  };
}

async function pollForGitHubAccessToken(
  domain: string,
  deviceCode: string,
  intervalSeconds: number,
  expiresIn: number,
  signal?: AbortSignal,
): Promise<string> {
  const urls = getUrls(domain);
  const deadline = Date.now() + expiresIn * 1000;
  let intervalMs = Math.max(1000, Math.floor(intervalSeconds * 1000));
  let intervalMultiplier = 1.2;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("Login cancelled");

    const waitMs = Math.min(Math.ceil(intervalMs * intervalMultiplier), deadline - Date.now());
    await abortableSleep(waitMs, signal);

    const raw = await fetchJson(urls.accessTokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        ...COPILOT_HEADERS,
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    }) as Record<string, unknown>;

    if (typeof raw.access_token === "string") {
      return raw.access_token;
    }

    if (typeof raw.error === "string") {
      if (raw.error === "authorization_pending") continue;
      if (raw.error === "slow_down") {
        intervalMs = typeof raw.interval === "number" ? raw.interval * 1000 : intervalMs + 5000;
        intervalMultiplier = 1.4;
        continue;
      }
      throw new Error(`Device flow failed: ${raw.error}${raw.error_description ? `: ${raw.error_description}` : ""}`);
    }
  }

  throw new Error("Device flow timed out");
}

/**
 * Exchange a GitHub access token for a Copilot API token
 */
export async function refreshGitHubCopilotToken(
  refreshToken: string,
  enterpriseDomain?: string,
): Promise<OAuthCredentials> {
  const domain = enterpriseDomain || "github.com";
  const urls = getUrls(domain);

  const raw = await fetchJson(urls.copilotTokenUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${refreshToken}`,
      ...COPILOT_HEADERS,
    },
  }) as Record<string, unknown>;

  if (typeof raw.token !== "string" || typeof raw.expires_at !== "number") {
    throw new Error("Invalid Copilot token response");
  }

  return {
    refresh: refreshToken,
    access: raw.token as string,
    expires: (raw.expires_at as number) * 1000 - 5 * 60 * 1000,
    enterpriseUrl: enterpriseDomain,
  };
}

/**
 * Enable a model in the user's GitHub Copilot policy
 */
async function enableCopilotModel(token: string, modelId: string, enterpriseDomain?: string): Promise<boolean> {
  const baseUrl = getGitHubCopilotBaseUrl(token, enterpriseDomain);
  try {
    const response = await fetch(`${baseUrl}/models/${modelId}/policy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...COPILOT_HEADERS,
        "openai-intent": "chat-policy",
      },
      body: JSON.stringify({ state: "enabled" }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Login with GitHub Copilot using device code flow
 */
export async function loginGitHubCopilot(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const input = await callbacks.onPrompt({
    message: "GitHub Enterprise URL/domain (blank for github.com)",
    placeholder: "company.ghe.com",
    allowEmpty: true,
  });

  if (callbacks.signal?.aborted) throw new Error("Login cancelled");

  const trimmed = input.trim();
  const enterpriseDomain = normalizeDomain(input);
  if (trimmed && !enterpriseDomain) throw new Error("Invalid GitHub Enterprise URL/domain");
  const domain = enterpriseDomain || "github.com";

  const device = await startDeviceFlow(domain);
  callbacks.onAuth({
    url: device.verification_uri,
    instructions: `Enter code: ${device.user_code}`,
  });

  const githubAccessToken = await pollForGitHubAccessToken(
    domain,
    device.device_code,
    device.interval,
    device.expires_in,
    callbacks.signal,
  );

  const credentials = await refreshGitHubCopilotToken(githubAccessToken, enterpriseDomain ?? undefined);

  // Enable known Copilot models
  callbacks.onProgress?.("Enabling models...");
  const modelIds = [
    "claude-sonnet-4-20250514", "claude-3.5-sonnet", "gpt-4o",
    "gpt-4o-mini", "o3-mini", "gemini-2.0-flash",
  ];
  await Promise.all(modelIds.map((id) => enableCopilotModel(credentials.access, id, enterpriseDomain ?? undefined)));

  return credentials;
}

/**
 * GitHub Copilot dynamic request headers
 */
export function buildCopilotHeaders(messages: Array<{ role: string }>): Record<string, string> {
  const last = messages[messages.length - 1];
  const initiator = last && last.role !== "user" ? "agent" : "user";

  return {
    ...COPILOT_HEADERS,
    "X-Initiator": initiator,
    "Openai-Intent": "conversation-edits",
  };
}

/**
 * OAuthProviderInterface implementation for GitHub Copilot
 */
export const githubCopilotOAuthProvider: OAuthProviderInterface = {
  id: "github-copilot",
  name: "GitHub Copilot",

  async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
    return loginGitHubCopilot(callbacks);
  },

  async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const creds = credentials as CopilotCredentials;
    return refreshGitHubCopilotToken(creds.refresh, creds.enterpriseUrl);
  },

  getApiKey(credentials: OAuthCredentials): string {
    return credentials.access;
  },

  modifyModels(models: Model[], credentials: OAuthCredentials): Model[] {
    const creds = credentials as CopilotCredentials;
    const domain = creds.enterpriseUrl ? (normalizeDomain(creds.enterpriseUrl) ?? undefined) : undefined;
    const baseUrl = getGitHubCopilotBaseUrl(creds.access, domain);
    return models.map((m) =>
      m.provider === "github-copilot" ? { ...m, baseUrl } : m
    );
  },
};
