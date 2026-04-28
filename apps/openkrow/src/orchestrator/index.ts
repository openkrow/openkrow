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
   * Resolve the LLM config to use for new agents.
   * Priority: ConfigManager active model → constructor llm param → defaults.
   */
  private resolveLLMConfig(): LLMConfig {
    const active = this._configManager.getActiveModel();
    const apiKey = this._configManager.resolveApiKey(active.provider);
    const overrides = this._configManager.getModelOverrides(active.provider, active.model);

    return {
      provider: active.provider,
      model: active.model,
      apiKey: apiKey ?? this._config.llm?.apiKey,
      baseUrl: overrides?.baseUrl ?? this._config.llm?.baseUrl,
      maxTokens: overrides?.maxTokens ?? this._config.llm?.maxTokens,
      temperature: overrides?.temperature ?? this._config.llm?.temperature,
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
      const llmConfig = this.resolveLLMConfig();
      const maxTurns = this._config.maxTurns ?? this._configManager.getMaxTurns();
      const systemPrompt = this._config.systemPrompt ?? this._configManager.getSystemPrompt() ?? undefined;

      agent = new Agent({
        name: `openkrow-${sessionId}`,
        description: "OpenKrow AI assistant",
        customPrompt: systemPrompt,
        llm: llmConfig,
        database: this.db,
        conversationId,
        maxTurns,
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
    message: string
  ): Promise<{ response: string; messageId: string }> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const session = this.getSession(conversation.session_id);
    if (!session) throw new Error(`Session not found: ${conversation.session_id}`);

    const agent = this.getAgent(session.id, conversationId);
    const response = await agent.run(message);

    const messages = this.db.messages.getLastMessages(conversationId, 1);
    const lastMessage = messages[messages.length - 1];
    this.db.conversations.update(conversationId, {});

    return { response, messageId: lastMessage?.id ?? "" };
  }

  async *streamChat(
    conversationId: string,
    message: string
  ): AsyncGenerator<string, { messageId: string }, unknown> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    const session = this.getSession(conversation.session_id);
    if (!session) throw new Error(`Session not found: ${conversation.session_id}`);

    const agent = this.getAgent(session.id, conversationId);

    for await (const chunk of agent.stream(message)) {
      yield chunk;
    }

    const messages = this.db.messages.getLastMessages(conversationId, 1);
    const lastMessage = messages[messages.length - 1];
    this.db.conversations.update(conversationId, {});

    return { messageId: lastMessage?.id ?? "" };
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
    for (const sessionId of this.agents.keys()) {
      this.endSession(sessionId);
    }
    this.agents.clear();
  }
}
