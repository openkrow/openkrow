import { Agent } from "@openkrow/agent-core";
import { createClient, type LLMConfig } from "@openkrow/ai";
import type { OpenKrowConfig } from "./config/loader.js";
import { loadConfig } from "./config/loader.js";
import { registerBuiltinTools } from "./tools.js";

const SYSTEM_PROMPT = `You are OpenKrow, an expert AI coding assistant running in the user's terminal.

You have access to tools for reading files, writing files, executing shell commands,
searching codebases, and listing directory contents.

Principles:
- Be concise and direct. Terminal space is limited.
- Explain your reasoning before taking actions.
- When editing code, describe the change, then apply it.
- Ask for clarification when the request is ambiguous.
- Respect the existing codebase style and conventions.
- Never execute destructive commands without explicit user confirmation.
- When showing code, use the minimal diff needed -- don't reprint entire files.`;

/**
 * OpenKrow - the main orchestrator class.
 *
 * Ties together config loading, LLM client creation, agent setup,
 * and tool registration into a single cohesive interface.
 */
export class OpenKrow {
  private agent: Agent;
  private config: OpenKrowConfig;

  private constructor(agent: Agent, config: OpenKrowConfig) {
    this.agent = agent;
    this.config = config;
  }

  /**
   * Create and initialize an OpenKrow instance.
   * Loads config from disk/env, sets up the LLM client, and registers tools.
   */
  static async create(
    overrides?: Partial<OpenKrowConfig>
  ): Promise<OpenKrow> {
    const config = await loadConfig(overrides);

    const llmConfig: LLMConfig = {
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    };

    const agent = new Agent({
      name: "openkrow",
      description: "Open-source terminal AI coding assistant",
      systemPrompt: config.systemPrompt ?? SYSTEM_PROMPT,
      llm: llmConfig,
      maxTurns: config.maxTurns,
    });

    if (config.enableTools) {
      registerBuiltinTools(agent);
    }

    return new OpenKrow(agent, config);
  }

  /**
   * Run a single prompt and return the full response.
   */
  async run(prompt: string): Promise<string> {
    return this.agent.run(prompt);
  }

  /**
   * Stream a response token-by-token.
   */
  stream(prompt: string): AsyncIterable<string> {
    return this.agent.stream(prompt);
  }

  /**
   * Access the underlying Agent for advanced usage (events, state, etc.)
   */
  getAgent(): Agent {
    return this.agent;
  }

  /**
   * Access the resolved configuration.
   */
  getConfig(): Readonly<OpenKrowConfig> {
    return this.config;
  }
}
