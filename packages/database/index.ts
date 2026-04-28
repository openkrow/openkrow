/**
 * @openkrow/database — SQLite database layer
 *
 * Two database types:
 * - Global: settings + migrations at ~/.openkrow/database/openkrow.db
 * - Workspace: conversations + messages at <workspace>/.krow/data.db
 */

import { join } from "path";
import type { GlobalDatabaseClient, WorkspaceDatabaseClient, DatabaseConfig } from "./types/index.js";
import { openDatabase, getDefaultDatabasePath } from "./connection/index.js";
import { runGlobalMigrations, runWorkspaceMigrations } from "./migrations/index.js";
import {
  ConversationRepository,
  MessageRepository,
  SettingsRepository,
} from "./repositories/index.js";

// Connection
export { openDatabase, getDefaultDatabasePath, Database } from "./connection/index.js";
export type { DatabaseConfig } from "./types/index.js";

// Schema
export { GLOBAL_SCHEMA, WORKSPACE_SCHEMA, getTableNames } from "./schema/index.js";

// Migrations
export {
  runGlobalMigrations,
  runWorkspaceMigrations,
  getAppliedMigrations,
  getCurrentMigrationVersion,
} from "./migrations/index.js";

// Repositories
export {
  ConversationRepository,
  MessageRepository,
  SettingsRepository,
} from "./repositories/index.js";

// Types
export type {
  GlobalDatabaseClient,
  WorkspaceDatabaseClient,
  Conversation,
  Message,
  Setting,
  Migration,
  IConversationRepository,
  IMessageRepository,
  ISettingsRepository,
  CreateConversationInput,
  UpdateConversationInput,
  CreateMessageInput,
} from "./types/index.js";

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a global database client (settings only).
 * Default path: ~/.openkrow/database/openkrow.db
 */
export function createGlobalClient(config?: DatabaseConfig): GlobalDatabaseClient {
  const db = openDatabase(config);
  runGlobalMigrations(db);

  return {
    settings: new SettingsRepository(db),
  };
}

/**
 * Create a workspace database client (conversations + messages).
 * Path: <workspacePath>/.krow/data.db
 */
export function createWorkspaceClient(workspacePath: string): WorkspaceDatabaseClient {
  const dbPath = join(workspacePath, ".krow", "data.db");
  const db = openDatabase({ path: dbPath });
  runWorkspaceMigrations(db);

  return {
    conversations: new ConversationRepository(db),
    messages: new MessageRepository(db),
  };
}
