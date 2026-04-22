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
