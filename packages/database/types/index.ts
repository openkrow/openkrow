/**
 * Database type definitions
 */

export interface DatabaseConfig {
  /** Path to the database file (defaults to ~/.openkrow/database/openkrow.db) */
  path?: string;
  /** Enable WAL mode for better concurrent read/write performance */
  walMode?: boolean;
  /** Enable foreign key constraints */
  foreignKeys?: boolean;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  workspace_path: string;
  started_at: string;
  ended_at?: string;
  metadata?: string;
}

export interface Conversation {
  id: string;
  session_id: string;
  title?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: string;
  created_at: string;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: string;
}

export interface Migration {
  id: number;
  name: string;
  applied_at: string;
}

// ---------------------------------------------------------------------------
// Repository interfaces (pure types — no runtime dependency on bun:sqlite)
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  username: string;
  email?: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
}

export interface CreateSessionInput {
  user_id: string;
  workspace_path: string;
  metadata?: Record<string, unknown>;
}

export interface CreateConversationInput {
  session_id: string;
  title?: string;
}

export interface UpdateConversationInput {
  title?: string;
}

export interface CreateMessageInput {
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: Record<string, unknown>[];
}

export interface IUserRepository {
  findById(id: string): User | null;
  findAll(limit?: number, offset?: number): User[];
  deleteById(id: string): boolean;
  count(): number;
  create(input: CreateUserInput): User;
  update(id: string, input: UpdateUserInput): User | null;
  findByUsername(username: string): User | null;
  findByEmail(email: string): User | null;
  getOrCreateDefault(): User;
}

export interface ISessionRepository {
  findById(id: string): Session | null;
  findAll(limit?: number, offset?: number): Session[];
  deleteById(id: string): boolean;
  count(): number;
  create(input: CreateSessionInput): Session;
  endSession(id: string): Session | null;
  findByUserId(userId: string, limit?: number): Session[];
  findByWorkspace(workspacePath: string, limit?: number): Session[];
  getActiveSession(userId: string): Session | null;
}

export interface IConversationRepository {
  findById(id: string): Conversation | null;
  findAll(limit?: number, offset?: number): Conversation[];
  deleteById(id: string): boolean;
  count(): number;
  create(input: CreateConversationInput): Conversation;
  update(id: string, input: UpdateConversationInput): Conversation | null;
  findBySessionId(sessionId: string, limit?: number): Conversation[];
  getRecent(limit?: number): Conversation[];
  searchByTitle(query: string, limit?: number): Conversation[];
}

export interface IMessageRepository {
  findById(id: string): Message | null;
  findAll(limit?: number, offset?: number): Message[];
  deleteById(id: string): boolean;
  count(): number;
  create(input: CreateMessageInput): Message;
  findByConversationId(conversationId: string, limit?: number): Message[];
  getLastMessages(conversationId: string, count: number): Message[];
  countByConversationId(conversationId: string): number;
  deleteByConversationId(conversationId: string): number;
  searchByContent(query: string, limit?: number): Message[];
}

export interface ISettingsRepository {
  get(key: string): string | null;
  getJson<T>(key: string): T | null;
  set(key: string, value: string): void;
  setJson<T>(key: string, value: T): void;
  delete(key: string): boolean;
  getAll(): Setting[];
  getAllAsObject(): Record<string, string>;
  has(key: string): boolean;
}

/**
 * DatabaseClient — the typed interface for all database operations.
 *
 * Created by `createDatabaseClient()`. Can be passed to agents and other
 * consumers without coupling them to the SQLite implementation.
 */
export interface DatabaseClient {
  users: IUserRepository;
  sessions: ISessionRepository;
  conversations: IConversationRepository;
  messages: IMessageRepository;
  settings: ISettingsRepository;
}
