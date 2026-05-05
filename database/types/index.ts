/**
 * Database type definitions
 *
 * Two client types:
 * - GlobalDatabaseClient: settings only (global DB at ~/.openkrow/)
 * - WorkspaceDatabaseClient: messages (per-workspace DB)
 */

export interface DatabaseConfig {
  /** Path to the database file */
  path?: string;
  /** Enable WAL mode for better concurrent read/write performance */
  walMode?: boolean;
  /** Enable foreign key constraints */
  foreignKeys?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "snip" | "summary";
  content: string;
  tool_calls?: string;
  tool_call_id?: string;
  tool_name?: string;
  is_error?: number;
  metadata?: string;
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
// Repository interfaces
// ---------------------------------------------------------------------------

export interface CreateMessageInput {
  role: "user" | "assistant" | "system" | "tool" | "snip" | "summary";
  content: string;
  tool_calls?: Record<string, unknown>[];
  tool_call_id?: string;
  tool_name?: string;
  is_error?: boolean;
  metadata?: Record<string, unknown>;
}

export interface IMessageRepository {
  findById(id: string): Message | null;
  findAll(limit?: number, offset?: number): Message[];
  deleteById(id: string): boolean;
  count(): number;
  create(input: CreateMessageInput): Message;
  getLastMessages(count: number): Message[];
  searchByContent(query: string, limit?: number): Message[];
  deleteAll(): number;
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

// ---------------------------------------------------------------------------
// Client interfaces
// ---------------------------------------------------------------------------

/**
 * Global database client — settings only.
 * Lives at ~/.openkrow/database/openkrow.db
 */
export interface GlobalDatabaseClient {
  settings: ISettingsRepository;
}

/**
 * Per-workspace database client — messages only.
 * Lives at <workspace>/.krow/data.db
 */
export interface WorkspaceDatabaseClient {
  messages: IMessageRepository;
}
