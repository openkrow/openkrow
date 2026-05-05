/**
 * Database schema definitions
 *
 * Split into two groups:
 * - GLOBAL_SCHEMA: tables for the global database (~/.openkrow/database/openkrow.db)
 * - WORKSPACE_SCHEMA: tables for per-workspace databases (<workspace>/.krow/data.db)
 */

export const GLOBAL_SCHEMA = {
  settings: `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,

  migrations: `
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,
};

export const WORKSPACE_SCHEMA = {
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool', 'snip', 'summary')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      is_error INTEGER DEFAULT 0,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
  `,

  migrations: `
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `,
};

/**
 * Get all table names across both schemas
 */
export function getTableNames(): string[] {
  return [...new Set([...Object.keys(GLOBAL_SCHEMA), ...Object.keys(WORKSPACE_SCHEMA)])];
}
