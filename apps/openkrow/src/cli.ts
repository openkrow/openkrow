#!/usr/bin/env node

/**
 * OpenKrow CLI
 *
 * The main entry point for the `openkrow` command.
 * Parses arguments and delegates to the appropriate command handler.
 */

import { Command } from "commander";
import { VERSION } from "./version.js";
import { chatCommand } from "./commands/chat.js";
import { runCommand } from "./commands/run.js";
import { configCommand } from "./commands/config.js";
import { serverCommand } from "./commands/server.js";

const program = new Command();

program
  .name("openkrow")
  .description("OpenKrow - Open-source terminal AI coding assistant")
  .version(VERSION);

program
  .command("chat", { isDefault: true })
  .description("Start an interactive coding session")
  .option("-m, --model <model>", "LLM model to use")
  .option(
    "-p, --provider <provider>",
    "LLM provider (openai | anthropic | google)"
  )
  .option("-s, --system <prompt>", "Custom system prompt")
  .option("--no-tools", "Disable tool calling")
  .option("--no-stream", "Disable streaming (wait for full response)")
  .action(chatCommand);

program
  .command("run <prompt>")
  .description("Run a single prompt non-interactively and exit")
  .option("-m, --model <model>", "LLM model to use")
  .option("-p, --provider <provider>", "LLM provider")
  .option("--no-tools", "Disable tool calling")
  .action(runCommand);

program
  .command("server")
  .description("Start the OpenKrow HTTP server for API access")
  .option("--port <port>", "Port to listen on", "3000")
  .option("--host <host>", "Host to bind to", "localhost")
  .option("-m, --model <model>", "LLM model to use")
  .option("-p, --provider <provider>", "LLM provider (openai | anthropic | google)")
  .action(serverCommand);

program
  .command("config")
  .description("Show or edit OpenKrow configuration")
  .option("--path", "Print the config file path")
  .option("--reset", "Reset configuration to defaults")
  .action(configCommand);

program.parse();
