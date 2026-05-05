/**
 * @openkrow/config — Centralized configuration management
 *
 * Provides a single ConfigManager class that reads/writes all configuration
 * (model selection, API keys, OAuth credentials, app settings) to the
 * database settings table.
 */

export { ConfigManager } from "./config-manager.js";

export {
  SETTING_KEYS,
  ConfigValidationError,
  type ModelConfig,
  type ModelOverrides,
  type ApiKeyEntry,
  type ApiKeyInfo,
  type OAuthEntry,
  type OAuthInfo,
} from "./types.js";
