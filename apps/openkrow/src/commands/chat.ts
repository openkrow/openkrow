import * as readline from "node:readline";
import { Screen, Box, Text, Spinner } from "@openkrow/tui";
import { OpenKrow } from "../openkrow.js";
import { VERSION } from "../version.js";

interface ChatOpts {
  model?: string;
  provider?: string;
  system?: string;
  tools?: boolean;
  stream?: boolean;
}

export async function chatCommand(opts: ChatOpts): Promise<void> {
  const krow = await OpenKrow.create({
    provider: opts.provider as "openai" | "anthropic" | "google" | undefined,
    model: opts.model,
    systemPrompt: opts.system,
    enableTools: opts.tools !== false,
    enableStreaming: opts.stream !== false,
  });

  const config = krow.getConfig();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Banner
  console.log("");
  console.log("  ╭──────────────────────────────────────────╮");
  console.log(`  │  OpenKrow v${VERSION}                          │`);
  console.log("  │  Open-source terminal coding assistant    │");
  console.log("  │                                           │");
  console.log(`  │  Provider: ${config.provider.padEnd(30)}│`);
  console.log(`  │  Model:    ${config.model.padEnd(30).slice(0, 30)}│`);
  console.log("  │                                           │");
  console.log("  │  /help for commands, /quit to exit        │");
  console.log("  ╰──────────────────────────────────────────╯");
  console.log("");

  const prompt = (): void => {
    rl.question("\x1b[36m❯\x1b[0m ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // Slash commands
      if (trimmed.startsWith("/")) {
        handleSlashCommand(trimmed, rl, krow);
        prompt();
        return;
      }

      try {
        process.stdout.write("\n");

        if (config.enableStreaming) {
          for await (const chunk of krow.stream(trimmed)) {
            process.stdout.write(chunk);
          }
        } else {
          const response = await krow.run(trimmed);
          process.stdout.write(response);
        }

        process.stdout.write("\n\n");
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error(`\n\x1b[31m  Error: ${msg}\x1b[0m\n`);
      }

      prompt();
    });
  };

  prompt();
}

function handleSlashCommand(
  cmd: string,
  rl: readline.Interface,
  krow: OpenKrow
): void {
  switch (cmd) {
    case "/quit":
    case "/exit":
    case "/q":
      console.log("\nGoodbye!\n");
      rl.close();
      process.exit(0);
      break;

    case "/help":
    case "/h":
      console.log(`
  Commands:
    /help, /h      Show this help message
    /quit, /q      Exit the session
    /clear         Clear conversation history
    /config        Show current configuration
    /tools         List available tools
      `);
      break;

    case "/clear":
      krow.getAgent().state.reset();
      console.log("  Conversation cleared.\n");
      break;

    case "/config": {
      const cfg = krow.getConfig();
      console.log(`
  Configuration:
    Provider:    ${cfg.provider}
    Model:       ${cfg.model}
    Max tokens:  ${cfg.maxTokens}
    Temperature: ${cfg.temperature}
    Tools:       ${cfg.enableTools ? "enabled" : "disabled"}
    Streaming:   ${cfg.enableStreaming ? "enabled" : "disabled"}
    Max turns:   ${cfg.maxTurns}
      `);
      break;
    }

    case "/tools": {
      const tools = krow.getAgent().tools.list();
      if (tools.length === 0) {
        console.log("  No tools registered.\n");
      } else {
        console.log(`\n  Registered tools (${tools.length}):`);
        for (const t of tools) {
          console.log(`    - ${t}`);
        }
        console.log("");
      }
      break;
    }

    default:
      console.log(`  Unknown command: ${cmd}. Type /help for available commands.\n`);
  }
}
