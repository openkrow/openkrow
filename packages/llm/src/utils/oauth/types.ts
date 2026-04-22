/**
 * OAuth type definitions
 */

import type { KnownProvider, Model } from "../../types.js";

export interface OAuthCredentials {
  /** Refresh token (long-lived, used to get new access tokens) */
  refresh: string;
  /** Access token (short-lived, used for API calls) */
  access: string;
  /** Expiry timestamp in milliseconds */
  expires: number;
  /** Provider-specific extra fields */
  [key: string]: unknown;
}

export interface OAuthAuthInfo {
  /** URL to open in browser */
  url: string;
  /** Instructions for the user (e.g. "Enter code: XXXX-XXXX") */
  instructions?: string;
}

export interface OAuthPrompt {
  message: string;
  placeholder?: string;
  allowEmpty?: boolean;
}

export interface OAuthLoginCallbacks {
  /** Called when the user needs to visit a URL */
  onAuth: (info: OAuthAuthInfo) => void;
  /** Called when the user needs to provide input */
  onPrompt: (prompt: OAuthPrompt) => Promise<string>;
  /** Called with progress messages */
  onProgress?: (message: string) => void;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

export interface OAuthProviderInterface {
  /** Provider identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;

  /** Run the login flow, return credentials to persist */
  login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;

  /** Refresh expired credentials, return updated credentials to persist */
  refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;

  /** Convert credentials to API key string for the provider */
  getApiKey(credentials: OAuthCredentials): string;

  /** Optional: modify models for this provider (e.g., update baseUrl) */
  modifyModels?(models: Model[], credentials: OAuthCredentials): Model[];
}
