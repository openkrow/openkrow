import { Agent } from "@openkrow/agent";
import type { LLMConfig } from "@openkrow/llm";
import type { OpenKrowConfig } from "./config/loader.js";
import { loadConfig } from "./config/loader.js";
import { registerBuiltinTools } from "./tools.js";

const SYSTEM_PROMPT = `You are OpenKrow, an expert AI assistant running on the user's desktop.

You help with everyday tasks: creating documents, presentations, spreadsheets,
drafting emails, managing schedules, summarizing content, and organizing information.

Principles:
- Be concise and direct.
- Act on requests directly — do the work, don't just describe it.
- Ask for clarification when the request is ambiguous.
- Never execute destructive operations without explicit user confirmation.`;

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
      description: "Open-source desktop AI assistant",
      customPrompt: config.systemPrompt ?? SYSTEM_PROMPT,
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
