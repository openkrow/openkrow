/**
 * Orchestrator - Central manager for database, agents, and sessions
 *
 * The orchestrator is the core of OpenKrow server, managing:
 * - Database connections and repositories
 * - Agent instances per session
 * - Session and conversation state
 * - Configuration via ConfigManager
 */

import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseConfig,
  type User,
  type Session,
  type Conversation,
} from "@openkrow/database";
import { ConfigManager } from "@openkrow/config";
import { Agent } from "@openkrow/agent";
import { WorkspaceManager } from "@openkrow/workspace";
import type { LLMConfig } from "@openkrow/llm";

export interface OrchestratorConfig {
  /** Database configuration */
  database?: DatabaseConfig;
  /** Default LLM configuration for agents (used as fallback if ConfigManager has no active model) */
  llm?: LLMConfig;
  /** System prompt override for agents */
  systemPrompt?: string;
  /** Maximum turns per agent run */
  maxTurns?: number;
  /** Workspace directory path */
  workspacePath?: string;
}

/**
 * Orchestrator manages the lifecycle of agents, sessions, and database interactions
 */
export class Orchestrator {
  private db: DatabaseClient;
  private _config: OrchestratorConfig;
  private _configManager: ConfigManager;
  private agents: Map<string, Agent> = new Map();
  /** Active AbortControllers keyed by conversationId — one active request per conversation. */
  private activeRequests: Map<string, AbortController> = new Map();
  private currentUser: User | null = null;
  private workspace: WorkspaceManager | null = null;

  private constructor(db: DatabaseClient, config: OrchestratorConfig) {
    this.db = db;
    this._config = config;
    this._configManager = new ConfigManager(db.settings);

    // Initialize workspace: prefer ConfigManager, fall back to config param
    const wsPath = config.workspacePath ?? this._configManager.getWorkspacePath();
    if (wsPath) {
      this.workspace = new WorkspaceManager();
      this.workspace.init(wsPath);
    }
  }

  /** Get the database client (for direct access by the app) */
  get database(): DatabaseClient {
    return this.db;
  }

  /** Get the ConfigManager for reading/writing all configuration. */
  get configManager(): ConfigManager {
    return this._configManager;
  }

  /**
   * Create and initialize the orchestrator
   */
  static create(config: OrchestratorConfig): Orchestrator {
    const db = createDatabaseClient(config.database);
    return new Orchestrator(db, config);
  }

  /**
   * Resolve the LLM config for a request.
   * Priority: request overrides → ConfigManager active model → constructor llm param.
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
  // User / Session / Conversation management
  // -----------------------------------------------------------------------

  getUser(): User {
    if (!this.currentUser) {
      this.currentUser = this.db.users.getOrCreateDefault();
    }
    return this.currentUser;
  }

  createSession(workspacePath: string): Session {
    const user = this.getUser();
    return this.db.sessions.create({
      user_id: user.id,
      workspace_path: workspacePath,
    });
  }

  getSession(sessionId: string): Session | null {
    return this.db.sessions.findById(sessionId);
  }

  getOrCreateSession(workspacePath: string): Session {
    const user = this.getUser();
    const activeSession = this.db.sessions.getActiveSession(user.id);

    if (activeSession && activeSession.workspace_path === workspacePath) {
      return activeSession;
    }

    return this.createSession(workspacePath);
  }

  endSession(sessionId: string): void {
    this.db.sessions.endSession(sessionId);
    this.agents.delete(sessionId);
  }

  createConversation(sessionId: string, title?: string): Conversation {
    return this.db.conversations.create({ session_id: sessionId, title });
  }

  getConversation(conversationId: string): Conversation | null {
    return this.db.conversations.findById(conversationId);
  }

  getOrCreateConversation(sessionId: string): Conversation {
    const conversations = this.db.conversations.findBySessionId(sessionId, 1);
    if (conversations.length > 0) return conversations[0];
    return this.createConversation(sessionId);
  }

  // -----------------------------------------------------------------------
  // Agent management
  // -----------------------------------------------------------------------

  getAgent(sessionId: string, conversationId: string): Agent {
    const key = `${sessionId}:${conversationId}`;
    let agent = this.agents.get(key);

    if (!agent) {
      const systemPrompt = this._config.systemPrompt ?? this._configManager.getSystemPrompt() ?? undefined;

      agent = new Agent({
        name: `openkrow-${sessionId}`,
        description: "OpenKrow AI assistant",
        customPrompt: systemPrompt,
        // No llm here — resolved per-request in chat()/streamChat()
        database: this.db,
        conversationId,
        ...(this.workspace ? { workspace: this.workspace } : {}),
      });

      this.agents.set(key, agent);
    }

    return agent;
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  async chat(
    conversationId: string,
    message: string,
    overrides?: { provider?: string; model?: string }
  ): Promise<{ response: string; messageId: string }> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const session = this.getSession(conversation.session_id);
    if (!session) throw new Error(`Session not found: ${conversation.session_id}`);

    const agent = this.getAgent(session.id, conversationId);
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

      const messages = this.db.messages.getLastMessages(conversationId, 1);
      const lastMessage = messages[messages.length - 1];
      this.db.conversations.update(conversationId, {});

      return { response, messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequests.delete(conversationId);
    }
  }

  async *streamChat(
    conversationId: string,
    message: string,
    overrides?: { provider?: string; model?: string }
  ): AsyncGenerator<string, { messageId: string }, unknown> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const session = this.getSession(conversation.session_id);
    if (!session) throw new Error(`Session not found: ${conversation.session_id}`);

    const agent = this.getAgent(session.id, conversationId);
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

      const messages = this.db.messages.getLastMessages(conversationId, 1);
      const lastMessage = messages[messages.length - 1];
      this.db.conversations.update(conversationId, {});

      return { messageId: lastMessage?.id ?? "" };
    } finally {
      this.activeRequests.delete(conversationId);
    }
  }

  // -----------------------------------------------------------------------
  // Request cancellation
  // -----------------------------------------------------------------------

  /**
   * Cancel an active request for a conversation.
   * Returns true if a request was found and aborted, false otherwise.
   */
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
    return this.db.messages.findByConversationId(conversationId, limit);
  }

  getRecentConversations(limit?: number) {
    return this.db.conversations.getRecent(limit);
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
    // Abort all active requests
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();

    for (const sessionId of this.agents.keys()) {
      this.endSession(sessionId);
    }
    this.agents.clear();
  }
}
