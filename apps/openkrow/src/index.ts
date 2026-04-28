/**
 * @openkrow/app — Main entry point
 *
 * When imported as a library, exports all public APIs.
 * When run directly (`bun run index.js`), starts the HTTP server.
 */

// ---------------------------------------------------------------------------
// Library exports
// ---------------------------------------------------------------------------

export { VERSION } from "./version.js";

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
    serverApiKey: process.env.OPENKROW_SERVER_API_KEY,
  });
}
