import { Agent } from "@openkrow/agent";
import { WorkspaceManager } from "@openkrow/workspace";
import type { LLMConfig } from "@openkrow/llm";
import type { OpenKrowConfig } from "./config/loader.js";
import { loadConfig } from "./config/loader.js";

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
 * Assembles config, LLM client, workspace, and agent into a single interface.
 * Tools are auto-registered by the agent's ToolManager.
 */
export class OpenKrow {
  private agent: Agent;
  private config: OpenKrowConfig;
  private workspace: WorkspaceManager | null;

  private constructor(
    agent: Agent,
    config: OpenKrowConfig,
    workspace: WorkspaceManager | null
  ) {
    this.agent = agent;
    this.config = config;
    this.workspace = workspace;
  }

  /**
   * Create and initialize an OpenKrow instance.
   */
  static async create(
    overrides?: Partial<OpenKrowConfig>
  ): Promise<OpenKrow> {
    const config = await loadConfig(overrides);

    // Set up workspace if a path is configured
    let workspaceManager: WorkspaceManager | null = null;
    if (config.workspacePath) {
      workspaceManager = new WorkspaceManager();
      workspaceManager.init(config.workspacePath);
    }

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
      description: "Open-source AI assistant",
      customPrompt: config.systemPrompt ?? SYSTEM_PROMPT,
      llm: llmConfig,
      maxTurns: config.maxTurns,
      ...(workspaceManager ? { workspace: workspaceManager } : {}),
    });

    return new OpenKrow(agent, config, workspaceManager);
  }

  /** Run a single prompt and return the full response. */
  async run(prompt: string): Promise<string> {
    return this.agent.run(prompt);
  }

  /** Stream a response token-by-token. */
  stream(prompt: string): AsyncIterable<string> {
    return this.agent.stream(prompt);
  }

  /** Access the underlying Agent. */
  getAgent(): Agent {
    return this.agent;
  }

  /** Access the resolved configuration. */
  getConfig(): Readonly<OpenKrowConfig> {
    return this.config;
  }

  /** Access the workspace manager (null if no workspace configured). */
  getWorkspace(): WorkspaceManager | null {
    return this.workspace;
  }
}
