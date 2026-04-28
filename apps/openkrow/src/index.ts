/**
 * @openkrow/app — Main entry point
 *
 * When imported as a library, exports all public APIs.
 * When run directly (`bun run index.js`), starts the HTTP server.
 */

// ---------------------------------------------------------------------------
// Library exports
// ---------------------------------------------------------------------------

export { OpenKrow } from "./openkrow.js";
export { loadConfig, saveConfig, resetConfig, getConfigPath, type OpenKrowConfig } from "./config/loader.js";
export { VERSION } from "./version.js";

// Config (re-export from @openkrow/config)
export { ConfigManager } from "@openkrow/config";
export type {
  ModelConfig,
  ModelOverrides,
  ApiKeyEntry,
  ApiKeyInfo,
  OAuthEntry,
  OAuthInfo,
} from "@openkrow/config";

// Server exports
export { OpenKrowServer, startServer } from "./server/index.js";
export type { OpenKrowServerOptions } from "./server/index.js";
export type {
  ServerConfig,
  ChatRequest,
  ChatResponse,
  ErrorResponse,
  HealthResponse,
  ApiKeySetRequest,
  ApiKeyListResponse,
  ModelConfigResponse,
  ModelConfigSetRequest,
  ModelListResponse,
} from "./server/types.js";

// Orchestrator exports
export { Orchestrator } from "./orchestrator/index.js";
export type { OrchestratorConfig } from "./orchestrator/index.js";

// ---------------------------------------------------------------------------
// Auto-start server when run directly
// ---------------------------------------------------------------------------

import { startServer } from "./server/index.js";

const isMainModule =
  typeof Bun !== "undefined" && Bun.main === import.meta.path;

if (isMainModule) {
  const port = parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "localhost";

  startServer({
    config: { port, host },
    workspacePath: process.env.OPENKROW_WORKSPACE,
    apiKey: process.env.OPENKROW_API_KEY,
    provider: (process.env.OPENKROW_PROVIDER as "openai" | "anthropic" | "google") ?? undefined,
    model: process.env.OPENKROW_MODEL,
  });
}
