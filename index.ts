#!/usr/bin/env bun
/**
 * OpenKrow CLI entry point
 *
 * Usage:
 *   krow                  — Interactive REPL (default)
 *   krow server           — Start the HTTP API server
 *     --port <n>          — Port (default: 3000)
 *     --host <h>          — Host (default: localhost)
 *     --api-key <key>     — Require Bearer token for all requests
 */

import { startRepl } from "./cli/repl.js";
import { startServer } from "./server/index.js";

const args = process.argv.slice(2);
const command = args[0];

if (command === "server") {
  const port = getFlag(args, "--port", "3000")!;
  const host = getFlag(args, "--host", "localhost")!;
  const apiKey = getFlag(args, "--api-key");

  startServer({
    config: { port: parseInt(port, 10), host },
    workspacePath: process.env.OPENKROW_WORKSPACE ?? process.cwd(),
    serverApiKey: apiKey ?? process.env.OPENKROW_SERVER_API_KEY,
  });
} else if (command === "help" || command === "--help" || command === "-h") {
  printUsage();
} else if (!command) {
  startRepl();
} else {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

function getFlag(args: string[], flag: string, defaultValue?: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return defaultValue;
  return args[idx + 1] ?? defaultValue;
}

function printUsage() {
  console.log(`
OpenKrow — AI assistant for everyday tasks

Usage:
  krow                  Interactive REPL (default)
  krow server           Start the HTTP API server
  krow help             Show this help

Server options:
  --port <n>            Port (default: 3000)
  --host <h>            Host (default: localhost)
  --api-key <key>       Require Bearer token for requests

Environment variables:
  OPENKROW_WORKSPACE    Workspace directory (default: cwd)
  OPENKROW_SERVER_API_KEY  API key for server auth
`);
}
