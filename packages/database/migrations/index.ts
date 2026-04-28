/**
 * Database migrations system
 *
 * Migrations are run against a specific Database instance (not a global singleton).
 */

import type { Database } from "bun:sqlite";
import { GLOBAL_SCHEMA, WORKSPACE_SCHEMA } from "../schema/index.js";
import type { Migration } from "../types/index.js";

export interface MigrationDefinition {
  name: string;
  up: string;
  down?: string;
}

// ---------------------------------------------------------------------------
// Global DB migrations
// ---------------------------------------------------------------------------

const GLOBAL_MIGRATIONS: MigrationDefinition[] = [
  {
    name: "001_global_settings",
    up: Object.values(GLOBAL_SCHEMA).join("\n"),
  },
];

// ---------------------------------------------------------------------------
// Workspace DB migrations
// ---------------------------------------------------------------------------

const WORKSPACE_MIGRATIONS: MigrationDefinition[] = [
  {
    name: "001_workspace_schema",
    up: Object.values(WORKSPACE_SCHEMA).join("\n"),
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function isMigrationApplied(db: Database, name: string): boolean {
  const stmt = db.prepare("SELECT 1 FROM migrations WHERE name = ?");
  return stmt.get(name) !== null;
}

function applyMigration(db: Database, migration: MigrationDefinition): void {
  db.transaction(() => {
    db.exec(migration.up);
    const stmt = db.prepare("INSERT INTO migrations (name) VALUES (?)");
    stmt.run(migration.name);
  })();
}

function runMigrationsOnDb(
  db: Database,
  migrations: MigrationDefinition[],
): { applied: string[]; skipped: string[] } {
  ensureMigrationsTable(db);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (isMigrationApplied(db, migration.name)) {
      skipped.push(migration.name);
    } else {
      applyMigration(db, migration);
      applied.push(migration.name);
    }
  }

  return { applied, skipped };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all pending global migrations on the given database.
 */
export function runGlobalMigrations(db: Database): { applied: string[]; skipped: string[] } {
  return runMigrationsOnDb(db, GLOBAL_MIGRATIONS);
}

/**
 * Run all pending workspace migrations on the given database.
 */
export function runWorkspaceMigrations(db: Database): { applied: string[]; skipped: string[] } {
  return runMigrationsOnDb(db, WORKSPACE_MIGRATIONS);
}

/**
 * Get list of applied migrations from a database.
 */
export function getAppliedMigrations(db: Database): Migration[] {
  ensureMigrationsTable(db);
  const stmt = db.prepare("SELECT id, name, applied_at FROM migrations ORDER BY id");
  return stmt.all() as Migration[];
}

/**
 * Get the current migration version from a database.
 */
export function getCurrentMigrationVersion(db: Database): string | null {
  const migrations = getAppliedMigrations(db);
  if (migrations.length === 0) return null;
  return migrations[migrations.length - 1]!.name;
}

export { GLOBAL_MIGRATIONS, WORKSPACE_MIGRATIONS };
