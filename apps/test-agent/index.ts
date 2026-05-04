/**
 * Interactive terminal client for testing the OpenKrow agent API.
 *
 * Usage:
 *   AGENT_ENDPOINT=http://localhost:3000 SERVER_API_KEY=secret bun run index.ts
 */

import * as readline from "node:readline";

const ENDPOINT = process.env.AGENT_ENDPOINT || "http://localhost:3000";
const API_KEY = process.env.SERVER_API_KEY || "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) h["Authorization"] = `Bearer ${API_KEY}`;
  return h;
}

async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${ENDPOINT}${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// SSE streaming chat
// ---------------------------------------------------------------------------

async function streamChat(message: string): Promise<void> {
  const body = JSON.stringify({
    message,
    stream: true,
  });

  const res = await fetch(`${ENDPOINT}/chat`, {
    method: "POST",
    headers: headers(),
    body,
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    console.error(`\x1b[31mError: ${res.status} ${text}\x1b[0m`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }

      switch (event.type) {
        case "text_delta":
          process.stdout.write(event.delta as string);
          fullText += event.delta as string;
          break;

        case "thinking":
          process.stdout.write(`\x1b[2m${event.thinking as string}\x1b[0m`);
          break;

        case "tool_call":
          console.log(
            `\n\x1b[36m[tool] ${event.name as string}(${JSON.stringify(event.arguments)})\x1b[0m`,
          );
          break;

        case "tool_result": {
          const ok = event.success ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
          const out = (event.output as string).slice(0, 200);
          console.log(`${ok} \x1b[2m${out}\x1b[0m`);
          break;
        }

        case "error": {
          const errMsg = typeof event.error === "string"
            ? event.error
            : event.error instanceof Error
              ? event.error.message
              : JSON.stringify(event.error) === "{}" ? "Unknown error" : JSON.stringify(event.error);
          console.error(`\n\x1b[31m[error] ${errMsg}\x1b[0m`);
          break;
        }

        case "message":
        case "done":
          break;
      }
    }
  }

  if (fullText) console.log(); // newline after streamed text
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

async function handleCommand(input: string): Promise<void> {
  const [cmd, ...rest] = input.trim().split(/\s+/);

  switch (cmd) {
    case "/health": {
      const h = await api("/health");
      console.log(JSON.stringify(h, null, 2));
      return;
    }

    case "/models": {
      const m = await api("/models");
      console.log(JSON.stringify(m, null, 2));
      return;
    }

    case "/model": {
      if (rest.length >= 2) {
        const [provider, model] = rest;
        await api("/config/model", {
          method: "POST",
          body: JSON.stringify({ provider, model }),
        });
        console.log(`Model set to ${provider}/${model}`);
      } else {
        const m = await api("/config/model");
        console.log(JSON.stringify(m, null, 2));
      }
      return;
    }

    case "/keys": {
      const k = await api("/auth/keys");
      console.log(JSON.stringify(k, null, 2));
      return;
    }

    case "/key": {
      if (rest.length >= 2) {
        const [provider, apiKey] = rest;
        await api("/auth/keys", {
          method: "POST",
          body: JSON.stringify({ provider, apiKey }),
        });
        console.log(`API key stored for ${provider}`);
      } else {
        console.log("Usage: /key <provider> <apiKey>");
      }
      return;
    }

    case "/history": {
      const h = await api("/history");
      console.log(JSON.stringify(h, null, 2));
      return;
    }

    case "/cancel": {
      const c = await api("/chat/cancel", { method: "POST" });
      console.log(JSON.stringify(c, null, 2));
      return;
    }

    case "/help":
      console.log(`
Commands:
  /health              - Check server health
  /models              - List available models
  /model               - Show current model
  /model <prov> <mod>  - Set model
  /keys                - List stored API keys
  /key <prov> <key>    - Store an API key
  /history             - Show message history
  /cancel              - Cancel active request
  /help                - Show this help
  /quit                - Exit
`);
      return;

    case "/quit":
    case "/exit":
      process.exit(0);

    default:
      console.log(`Unknown command: ${cmd}. Type /help for available commands.`);
  }
}

// ---------------------------------------------------------------------------
// Main REPL
// ---------------------------------------------------------------------------

async function main() {
  // Check connectivity
  try {
    await api("/health");
    console.log(`Connected to ${ENDPOINT}`);
  } catch (e) {
    console.error(`Cannot reach ${ENDPOINT}: ${e}`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`\x1b[1myou>\x1b[0m `, async (input) => {
      input = input.trim();
      if (!input) return prompt();

      try {
        if (input.startsWith("/")) {
          await handleCommand(input);
        } else {
          await streamChat(input);
        }
      } catch (e) {
        console.error(`\x1b[31m${e}\x1b[0m`);
      }

      prompt();
    });
  };

  console.log('Type /help for commands, or start chatting.\n');
  prompt();
}

main().catch(console.error);
