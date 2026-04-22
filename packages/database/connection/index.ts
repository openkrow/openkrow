/**
 * Database connection manager using Bun SQLite
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import type { DatabaseConfig } from "../types/index.js";

const DEFAULT_DB_DIR = join(homedir(), ".openkrow", "database");
const DEFAULT_DB_NAME = "openkrow.db";

let instance: Database | null = null;

/**
 * Get the default database path
 */
export function getDefaultDatabasePath(): string {
  return join(DEFAULT_DB_DIR, DEFAULT_DB_NAME);
}

/**
 * Ensure the database directory exists
 */
function ensureDatabaseDirectory(dbPath: string): void {
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Initialize database connection
 */
export function initializeDatabase(config: DatabaseConfig = {}): Database {
  if (instance) {
    return instance;
  }

  const dbPath = config.path ?? getDefaultDatabasePath();
  ensureDatabaseDirectory(dbPath);

  instance = new Database(dbPath, { create: true });

  // Configure database pragmas
  if (config.walMode !== false) {
    instance.exec("PRAGMA journal_mode = WAL;");
  }

  if (config.foreignKeys !== false) {
    instance.exec("PRAGMA foreign_keys = ON;");
  }

  // Performance optimizations
  instance.exec("PRAGMA synchronous = NORMAL;");
  instance.exec("PRAGMA cache_size = -64000;"); // 64MB cache
  instance.exec("PRAGMA temp_store = MEMORY;");

  return instance;
}

/**
 * Get the current database instance
 * @throws Error if database is not initialized
 */
export function getDatabase(): Database {
  if (!instance) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  }
  return instance;
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return instance !== null;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/**
 * Execute a transaction
 */
export function transaction<T>(fn: () => T): T {
  const db = getDatabase();
  return db.transaction(fn)();
}

export { Database };
