/**
 * Interactive REPL — talks directly to the agent (no HTTP).
 */

import * as readline from "node:readline";
import { Orchestrator } from "../orchestrator/index.js";
import type { StreamEvent } from "../agent/index.js";

export function startRepl() {
  const workspacePath = process.env.OPENKROW_WORKSPACE ?? process.cwd();

  const orchestrator = Orchestrator.create({ workspacePath });

  console.log(`OpenKrow interactive mode`);
  console.log(`Workspace: ${workspacePath}`);
  console.log(`Type /help for commands, or start chatting.\n`);

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
          await handleCommand(input, orchestrator);
        } else {
          await streamChat(input, orchestrator);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`\x1b[31m${msg}\x1b[0m`);
      }

      prompt();
    });
  };

  prompt();
}

async function streamChat(message: string, orchestrator: Orchestrator): Promise<void> {
  let fullText = "";

  try {
    for await (const event of orchestrator.streamChat(message)) {
      handleEvent(event);
      if (event.type === "text_delta") fullText += event.delta;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`\n\x1b[31m[error] ${msg}\x1b[0m`);
  }

  if (fullText) console.log();
}

function handleEvent(event: StreamEvent): void {
  switch (event.type) {
    case "text_delta":
      process.stdout.write(event.delta);
      break;

    case "thinking":
      process.stdout.write(`\x1b[2m${event.thinking}\x1b[0m`);
      break;

    case "tool_call":
      console.log(
        `\n\x1b[36m[tool] ${event.name}(${JSON.stringify(event.arguments)})\x1b[0m`,
      );
      break;

    case "tool_result": {
      const ok = event.success ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      const out = event.output.slice(0, 200);
      console.log(`${ok} \x1b[2m${out}\x1b[0m`);
      break;
    }

    case "error":
      console.error(`\n\x1b[31m[error] ${event.error}\x1b[0m`);
      break;

    case "message":
    case "done":
      break;
  }
}

async function handleCommand(input: string, orchestrator: Orchestrator): Promise<void> {
  const [cmd, ...rest] = input.trim().split(/\s+/);

  switch (cmd) {
    case "/model": {
      if (rest.length >= 2) {
        const [provider, model] = rest;
        orchestrator.configManager.setActiveModel({
          provider: provider as any,
          model: model!,
        });
        console.log(`Model set to ${provider}/${model}`);
      } else {
        const active = orchestrator.configManager.getActiveModel();
        console.log(`${active.provider}/${active.model}`);
      }
      return;
    }

    case "/models": {
      const models = orchestrator.configManager.listModels();
      for (const m of models) {
        console.log(`  ${m.provider}/${m.id}`);
      }
      return;
    }

    case "/key": {
      if (rest.length >= 2) {
        const [provider, apiKey] = rest;
        orchestrator.configManager.setApiKey(provider!, apiKey!);
        console.log(`API key stored for ${provider}`);
      } else {
        console.log("Usage: /key <provider> <apiKey>");
      }
      return;
    }

    case "/keys": {
      const keys = orchestrator.configManager.listApiKeys();
      for (const k of keys) {
        console.log(`  ${k.provider}: ${k.masked}`);
      }
      return;
    }

    case "/history": {
      const messages = orchestrator.getHistory(20);
      for (const m of messages) {
        const preview = (m.content ?? "").slice(0, 80);
        console.log(`  [${m.role}] ${preview}`);
      }
      return;
    }

    case "/cancel":
      orchestrator.cancelRequest();
      console.log("Cancelled.");
      return;

    case "/help":
      console.log(`
Commands:
  /model               - Show current model
  /model <prov> <mod>  - Set model
  /models              - List available models
  /key <prov> <key>    - Store an API key
  /keys                - List stored API keys
  /history             - Show recent messages
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
