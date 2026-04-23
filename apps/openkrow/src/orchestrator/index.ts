/**
 * Orchestrator - Central manager for database, agents, and sessions
 *
 * The orchestrator is the core of OpenKrow server, managing:
 * - Database connections and repositories
 * - Agent instances per session
 * - Session and conversation state
 */

import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseConfig,
  type User,
  type Session,
  type Conversation,
} from "@openkrow/database";
import { Agent } from "@openkrow/agent";
import type { LLMConfig } from "@openkrow/llm";

export interface OrchestratorConfig {
  /** Database configuration */
  database?: DatabaseConfig;
  /** Default LLM configuration for agents */
  llm: LLMConfig;
  /** System prompt override for agents (optional — uses built-in prompt by default) */
  systemPrompt?: string;
  /** Maximum turns per agent run */
  maxTurns?: number;
  /** Enable tools */
  enableTools?: boolean;
}

/**
 * Orchestrator manages the lifecycle of agents, sessions, and database interactions
 */
export class Orchestrator {
  private db: DatabaseClient;
  private config: OrchestratorConfig;
  private agents: Map<string, Agent> = new Map();
  private currentUser: User | null = null;

  private constructor(db: DatabaseClient, config: OrchestratorConfig) {
    this.db = db;
    this.config = config;
  }

  /** Get the database client (for direct access by the app) */
  get database(): DatabaseClient {
    return this.db;
  }

  /**
   * Create and initialize the orchestrator
   */
  static create(config: OrchestratorConfig): Orchestrator {
    const db = createDatabaseClient(config.database);
    return new Orchestrator(db, config);
  }

  /**
   * Get or create the default user
   */
  getUser(): User {
    if (!this.currentUser) {
      this.currentUser = this.db.users.getOrCreateDefault();
    }
    return this.currentUser;
  }

  /**
   * Create a new session for a workspace
   */
  createSession(workspacePath: string): Session {
    const user = this.getUser();
    return this.db.sessions.create({
      user_id: user.id,
      workspace_path: workspacePath,
    });
  }

  /**
   * Get an existing session by ID
   */
  getSession(sessionId: string): Session | null {
    return this.db.sessions.findById(sessionId);
  }

  /**
   * Get or create a session for a workspace
   */
  getOrCreateSession(workspacePath: string): Session {
    const user = this.getUser();
    const activeSession = this.db.sessions.getActiveSession(user.id);

    if (activeSession && activeSession.workspace_path === workspacePath) {
      return activeSession;
    }

    return this.createSession(workspacePath);
  }

  /**
   * End a session
   */
  endSession(sessionId: string): void {
    this.db.sessions.endSession(sessionId);
    this.agents.delete(sessionId);
  }

  /**
   * Create a new conversation in a session
   */
  createConversation(sessionId: string, title?: string): Conversation {
    return this.db.conversations.create({
      session_id: sessionId,
      title,
    });
  }

  /**
   * Get an existing conversation
   */
  getConversation(conversationId: string): Conversation | null {
    return this.db.conversations.findById(conversationId);
  }

  /**
   * Get or create a conversation for a session
   */
  getOrCreateConversation(sessionId: string): Conversation {
    const conversations = this.db.conversations.findBySessionId(sessionId, 1);

    if (conversations.length > 0) {
      return conversations[0];
    }

    return this.createConversation(sessionId);
  }

  /**
   * Get an agent for a session + conversation, creating one if needed.
   * The agent gets the database client so it handles message persistence.
   */
  getAgent(sessionId: string, conversationId: string): Agent {
    const key = `${sessionId}:${conversationId}`;
    let agent = this.agents.get(key);

    if (!agent) {
      agent = new Agent({
        name: `openkrow-${sessionId}`,
        description: "OpenKrow AI assistant",
        customPrompt: this.config.systemPrompt,
        llm: this.config.llm,
        database: this.db,
        conversationId,
        maxTurns: this.config.maxTurns,
      });

      this.agents.set(key, agent);
    }

    return agent;
  }

  /**
   * Send a message and get a response.
   * The agent persists messages to the database automatically.
   */
  async chat(
    conversationId: string,
    message: string
  ): Promise<{ response: string; messageId: string }> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const session = this.getSession(conversation.session_id);
    if (!session) {
      throw new Error(`Session not found: ${conversation.session_id}`);
    }

    const agent = this.getAgent(session.id, conversationId);
    const response = await agent.run(message);

    // Get the last assistant message from the database (persisted by the agent)
    const messages = this.db.messages.getLastMessages(conversationId, 1);
    const lastMessage = messages[messages.length - 1];

    // Update conversation timestamp
    this.db.conversations.update(conversationId, {});

    return {
      response,
      messageId: lastMessage?.id ?? "",
    };
  }

  /**
   * Stream a chat response.
   * The agent persists messages to the database automatically.
   */
  async *streamChat(
    conversationId: string,
    message: string
  ): AsyncGenerator<string, { messageId: string }, unknown> {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const session = this.getSession(conversation.session_id);
    if (!session) {
      throw new Error(`Session not found: ${conversation.session_id}`);
    }

    const agent = this.getAgent(session.id, conversationId);

    for await (const chunk of agent.stream(message)) {
      yield chunk;
    }

    // Get the last assistant message from the database (persisted by the agent)
    const messages = this.db.messages.getLastMessages(conversationId, 1);
    const lastMessage = messages[messages.length - 1];

    // Update conversation timestamp
    this.db.conversations.update(conversationId, {});

    return { messageId: lastMessage?.id ?? "" };
  }

  /**
   * Get conversation history
   */
  getConversationHistory(conversationId: string, limit?: number) {
    return this.db.messages.findByConversationId(conversationId, limit);
  }

  /**
   * Get recent conversations
   */
  getRecentConversations(limit?: number) {
    return this.db.conversations.getRecent(limit);
  }

  /**
   * Get a setting value
   */
  getSetting(key: string): string | null {
    return this.db.settings.get(key);
  }

  /**
   * Set a setting value
   */
  setSetting(key: string, value: string): void {
    this.db.settings.set(key, value);
  }

  /**
   * Get all active agents count
   */
  getActiveAgentsCount(): number {
    return this.agents.size;
  }

  /**
   * Cleanup - end all sessions and close connections
   */
  cleanup(): void {
    for (const sessionId of this.agents.keys()) {
      this.endSession(sessionId);
    }
    this.agents.clear();
  }
}
