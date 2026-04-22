/**
 * @openkrow/database — SQLite database layer for user data
 *
 * Uses Bun SQLite to store user data in ~/.openkrow/database
 */

import type { DatabaseConfig } from "./types/index.js";
import { initializeDatabase as initDb } from "./connection/index.js";
import { runMigrations as migrate } from "./migrations/index.js";
import {
  UserRepository as UserRepo,
  SessionRepository as SessionRepo,
  ConversationRepository as ConversationRepo,
  MessageRepository as MessageRepo,
  SettingsRepository as SettingsRepo,
} from "./repositories/index.js";

// Connection management
export {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  isDatabaseInitialized,
  getDefaultDatabasePath,
  transaction,
} from "./connection/index.js";

export type { DatabaseConfig } from "./types/index.js";

// Schema
export { SCHEMA, getTableNames, getTableSchema } from "./schema/index.js";

// Migrations
export {
  runMigrations,
  getAppliedMigrations,
  isMigrationApplied,
  getCurrentMigrationVersion,
} from "./migrations/index.js";

// Repositories
export {
  UserRepository,
  SessionRepository,
  ConversationRepository,
  MessageRepository,
  SettingsRepository,
} from "./repositories/index.js";

export type {
  CreateUserInput,
  UpdateUserInput,
  CreateSessionInput,
  CreateConversationInput,
  UpdateConversationInput,
  CreateMessageInput,
} from "./repositories/index.js";

// Types
export type {
  User,
  Session,
  Conversation,
  Message,
  Setting,
  Migration,
} from "./types/index.js";

/**
 * Initialize the database and run migrations
 * This is a convenience function that combines initialization and migration
 */
export function setupDatabase(config?: DatabaseConfig): void {
  initDb(config);
  migrate();
}

/**
 * Create a database instance with all repositories
 */
export function createDatabaseClient(config?: DatabaseConfig) {
  initDb(config);
  migrate();

  return {
    users: new UserRepo(),
    sessions: new SessionRepo(),
    conversations: new ConversationRepo(),
    messages: new MessageRepo(),
    settings: new SettingsRepo(),
  };
}
