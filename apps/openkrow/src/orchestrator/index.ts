/**
 * Orchestrator - Central manager for the workspace agent
 *
 * Uses two database clients:
 * - Global: settings (API keys, model config, etc.)
 * - Workspace: messages (per-workspace DB)
 *
 * One workspace = one conversation = one agent.
 */

import {
  createGlobalClient,
  createWorkspaceClient,
  type DatabaseConfig,
  type GlobalDatabaseClient,
  type WorkspaceDatabaseClient,
} from "@openkrow/database";
import { ConfigManager } from "@openkrow/config";
import { Agent } from "@openkrow/agent";
import type { LLMConfig, StreamEvent } from "@openkrow/agent";
import { WorkspaceManager } from "@openkrow/workspace";

export interface OrchestratorConfig {
  /** Database configuration for the global DB */
  database?: DatabaseConfig;
  /** Default LLM configuration for agents (fallback if ConfigManager has no active model) */
  llm?: LLMConfig;
  /** System prompt override for agents */
  systemPrompt?: string;
  /** Maximum turns per agent run */
  maxTurns?: number;
  /** Workspace directory path */
  workspacePath?: string;
}

/**
 * Orchestrator manages the lifecycle of the workspace agent and database interactions.
 * One workspace = one agent = one continuous conversation.
 */
export class Orchestrator {
  private globalDb: GlobalDatabaseClient;
  private workspaceDb: WorkspaceDatabaseClient | null = null;
  private _config: OrchestratorConfig;
  private _configManager: ConfigManager;
  private agent: Agent | null = null;
  private activeRequest: AbortController | null = null;
  private workspace: WorkspaceManager | null = null;

  private constructor(
    globalDb: GlobalDatabaseClient,
    workspaceDb: WorkspaceDatabaseClient | null,
    config: OrchestratorConfig,
  ) {
    this.globalDb = globalDb;
    this.workspaceDb = workspaceDb;
    this._config = config;
    this._configManager = new ConfigManager(globalDb.settings);

    const wsPath = config.workspacePath ?? this._configManager.getWorkspacePath();
    if (wsPath) {
      this.workspace = new WorkspaceManager();
      this.workspace.init(wsPath);
      if (!this.workspaceDb) {
        this.workspaceDb = createWorkspaceClient(wsPath);
      }
    }
  }

  get configManager(): ConfigManager {
    return this._configManager;
  }

  /**
   * Create and initialize the orchestrator
   */
  static create(config: OrchestratorConfig): Orchestrator {
    const globalDb = createGlobalClient(config.database);
    const workspaceDb = config.workspacePath
      ? createWorkspaceClient(config.workspacePath)
      : null;
    return new Orchestrator(globalDb, workspaceDb, config);
  }

  /**
   * Resolve the LLM config for a request.
   */
  resolveLLMConfig(overrides?: { provider?: string; model?: string }): LLMConfig {
    const active = this._configManager.getActiveModel();
    const provider = (overrides?.provider ?? active.provider) as LLMConfig["provider"];
    const model = overrides?.model ?? active.model;
    const apiKey = this._configManager.resolveApiKey(provider);
    const modelOverrides = this._configManager.getModelOverrides(provider, model);

    return {
      provider,
      model,
      apiKey: apiKey ?? this._config.llm?.apiKey,
      baseUrl: modelOverrides?.baseUrl ?? this._config.llm?.baseUrl,
      maxTokens: modelOverrides?.maxTokens ?? this._config.llm?.maxTokens,
      temperature: modelOverrides?.temperature ?? this._config.llm?.temperature,
    };
  }

  // -----------------------------------------------------------------------
  // Agent management
  // -----------------------------------------------------------------------

  private ensureWorkspaceDb(): WorkspaceDatabaseClient {
    if (!this.workspaceDb) {
      throw new Error("No workspace configured. Provide workspacePath.");
    }
    return this.workspaceDb;
  }

  private getAgent(llmConfig?: LLMConfig): Agent {
    if (!this.agent) {
      const systemPrompt = this._config.systemPrompt ?? this._configManager.getSystemPrompt() ?? undefined;

      this.agent = new Agent({
        name: "openkrow",
        description: "OpenKrow AI assistant",
        customPrompt: systemPrompt,
        llm: llmConfig,
        database: this.ensureWorkspaceDb(),
        ...(this.workspace ? { workspace: this.workspace } : {}),
      });
    }

    return this.agent;
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  async chat(
    message: string,
    overrides?: { provider?: string; model?: string },
  ): Promise<{ response: string; messageId: string }> {
    this.ensureWorkspaceDb();
    const llmConfig = this.resolveLLMConfig(overrides);
    const agent = this.getAgent(llmConfig);
    const maxTurns = this._config.maxTurns ?? this._configManager.getMaxTurns();

    const controller = new AbortController();
    this.activeRequest = controller;

    try {
      const response = await agent.run(message, {
        llm: llmConfig,
        maxTurns: maxTurns || undefined,
        signal: controller.signal,
      });

      const db = this.ensureWorkspaceDb();
      const messages = db.messages.getLastMessages(1);
      const lastMessage = messages[messages.length - 1];

      return { response, messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequest = null;
    }
  }

  async *streamChat(
    message: string,
    overrides?: { provider?: string; model?: string },
  ): AsyncGenerator<StreamEvent, { messageId: string }, unknown> {
    this.ensureWorkspaceDb();
    const llmConfig = this.resolveLLMConfig(overrides);
    const agent = this.getAgent(llmConfig);
    const maxTurns = this._config.maxTurns ?? this._configManager.getMaxTurns();

    const controller = new AbortController();
    this.activeRequest = controller;

    try {
      for await (const chunk of agent.stream(message, {
        llm: llmConfig,
        maxTurns: maxTurns || undefined,
        signal: controller.signal,
      })) {
        yield chunk;
      }

      const db = this.ensureWorkspaceDb();
      const messages = db.messages.getLastMessages(1);
      const lastMessage = messages[messages.length - 1];

      return { messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequest = null;
    }
  }

  // -----------------------------------------------------------------------
  // Request cancellation
  // -----------------------------------------------------------------------

  cancelRequest(): boolean {
    if (!this.activeRequest) return false;
    this.activeRequest.abort();
    this.activeRequest = null;
    return true;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getHistory(limit?: number) {
    const db = this.ensureWorkspaceDb();
    return limit ? db.messages.getLastMessages(limit) : db.messages.findAll();
  }

  getActiveAgentsCount(): number {
    return this.agent ? 1 : 0;
  }

  getWorkspace(): WorkspaceManager | null {
    return this.workspace;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  cleanup(): void {
    if (this.activeRequest) {
      this.activeRequest.abort();
      this.activeRequest = null;
    }
    this.agent = null;
  }
}
