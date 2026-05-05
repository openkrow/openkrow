/**
 * Database connection utilities using Bun SQLite.
 *
 * No global singleton — callers open named connections via `openDatabase()`.
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";
import type { DatabaseConfig } from "../types/index.js";

const DEFAULT_DB_DIR = join(homedir(), ".openkrow", "database");
const DEFAULT_DB_NAME = "openkrow.db";

/**
 * Get the default (global) database path.
 */
export function getDefaultDatabasePath(): string {
  return join(DEFAULT_DB_DIR, DEFAULT_DB_NAME);
}

/**
 * Ensure the parent directory of a database file exists.
 */
function ensureDirectory(dbPath: string): void {
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Open (or create) a SQLite database at the given path.
 * Each call returns a new `Database` handle — callers are responsible for
 * closing it when done.
 */
export function openDatabase(config: DatabaseConfig = {}): Database {
  const dbPath = config.path ?? getDefaultDatabasePath();
  ensureDirectory(dbPath);

  const db = new Database(dbPath, { create: true });

  // Configure pragmas
  if (config.walMode !== false) {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  if (config.foreignKeys !== false) {
    db.exec("PRAGMA foreign_keys = ON;");
  }

  // Performance optimizations
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA cache_size = -64000;"); // 64MB cache
  db.exec("PRAGMA temp_store = MEMORY;");

  return db;
}

export { Database };
