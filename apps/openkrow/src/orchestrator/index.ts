/**
 * Orchestrator - Central manager for agents and conversations
 *
 * Uses two database clients:
 * - Global: settings (API keys, model config, etc.)
 * - Workspace: conversations + messages (per-workspace)
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
import type { Conversation } from "@openkrow/database";

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
 * Orchestrator manages the lifecycle of agents and database interactions
 */
export class Orchestrator {
  private globalDb: GlobalDatabaseClient;
  private workspaceDb: WorkspaceDatabaseClient | null = null;
  private _config: OrchestratorConfig;
  private _configManager: ConfigManager;
  private agents: Map<string, Agent> = new Map();
  private activeRequests: Map<string, AbortController> = new Map();
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
  // Conversation
  // -----------------------------------------------------------------------

  private ensureWorkspaceDb(): WorkspaceDatabaseClient {
    if (!this.workspaceDb) {
      throw new Error("No workspace configured. Provide workspacePath to use conversations.");
    }
    return this.workspaceDb;
  }

  getOrCreateConversation(): Conversation {
    const db = this.ensureWorkspaceDb();
    const conversations = db.conversations.getRecent(1);
    if (conversations.length > 0) return conversations[0]!;
    return db.conversations.create();
  }

  getConversation(conversationId: string): Conversation | null {
    return this.ensureWorkspaceDb().conversations.findById(conversationId);
  }

  // -----------------------------------------------------------------------
  // Agent management
  // -----------------------------------------------------------------------

  getAgent(conversationId: string): Agent {
    let agent = this.agents.get(conversationId);

    if (!agent) {
      const systemPrompt = this._config.systemPrompt ?? this._configManager.getSystemPrompt() ?? undefined;

      agent = new Agent({
        name: `openkrow-${conversationId}`,
        description: "OpenKrow AI assistant",
        customPrompt: systemPrompt,
        database: this.ensureWorkspaceDb(),
        conversationId,
        ...(this.workspace ? { workspace: this.workspace } : {}),
      });

      this.agents.set(conversationId, agent);
    }

    return agent;
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  async chat(
    conversationId: string,
    message: string,
    overrides?: { provider?: string; model?: string },
  ): Promise<{ response: string; messageId: string }> {
    const db = this.ensureWorkspaceDb();
    const conversation = db.conversations.findById(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const agent = this.getAgent(conversationId);
    const llmConfig = this.resolveLLMConfig(overrides);
    const maxTurns = this._config.maxTurns ?? this._configManager.getMaxTurns();

    const controller = new AbortController();
    this.activeRequests.set(conversationId, controller);

    try {
      const response = await agent.run(message, {
        llm: llmConfig,
        maxTurns: maxTurns || undefined,
        signal: controller.signal,
      });

      const messages = db.messages.getLastMessages(conversationId, 1);
      const lastMessage = messages[messages.length - 1];
      db.conversations.update(conversationId, {});

      return { response, messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequests.delete(conversationId);
    }
  }

  async *streamChat(
    conversationId: string,
    message: string,
    overrides?: { provider?: string; model?: string },
  ): AsyncGenerator<StreamEvent, { messageId: string }, unknown> {
    const db = this.ensureWorkspaceDb();
    const conversation = db.conversations.findById(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const agent = this.getAgent(conversationId);
    const llmConfig = this.resolveLLMConfig(overrides);
    const maxTurns = this._config.maxTurns ?? this._configManager.getMaxTurns();

    const controller = new AbortController();
    this.activeRequests.set(conversationId, controller);

    try {
      for await (const chunk of agent.stream(message, {
        llm: llmConfig,
        maxTurns: maxTurns || undefined,
        signal: controller.signal,
      })) {
        yield chunk;
      }

      const messages = db.messages.getLastMessages(conversationId, 1);
      const lastMessage = messages[messages.length - 1];
      db.conversations.update(conversationId, {});

      return { messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequests.delete(conversationId);
    }
  }

  // -----------------------------------------------------------------------
  // Request cancellation
  // -----------------------------------------------------------------------

  cancelRequest(conversationId: string): boolean {
    const controller = this.activeRequests.get(conversationId);
    if (!controller) return false;
    controller.abort();
    this.activeRequests.delete(conversationId);
    return true;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getConversationHistory(conversationId: string, limit?: number) {
    return this.ensureWorkspaceDb().messages.findByConversationId(conversationId, limit);
  }

  getRecentConversations(limit?: number) {
    return this.ensureWorkspaceDb().conversations.getRecent(limit);
  }

  getActiveAgentsCount(): number {
    return this.agents.size;
  }

  getWorkspace(): WorkspaceManager | null {
    return this.workspace;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  cleanup(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
    this.agents.clear();
  }
}
