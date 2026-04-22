/**
 * Server command - Start the OpenKrow HTTP server
 */

import { startServer } from "../server/index.js";

interface ServerOptions {
  port?: string;
  host?: string;
  model?: string;
  provider?: string;
}

export async function serverCommand(options: ServerOptions): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : 3000;
  const host = options.host ?? "localhost";

  console.log("Starting OpenKrow server...\n");

  try {
    const server = startServer({
      config: {
        port,
        host,
      },
      provider: (options.provider as "openai" | "anthropic" | "google") ?? "anthropic",
      model: options.model,
      workspacePath: process.cwd(),
    });

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      server.stop();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\nShutting down...");
      server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}
