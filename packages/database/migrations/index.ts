/**
 * Database migrations system
 */

import { getDatabase } from "../connection/index.js";
import { SCHEMA } from "../schema/index.js";
import type { Migration } from "../types/index.js";

export interface MigrationDefinition {
  name: string;
  up: string;
  down?: string;
}

/**
 * Initial migration to create all base tables
 */
const INITIAL_MIGRATION: MigrationDefinition = {
  name: "001_initial_schema",
  up: Object.values(SCHEMA).join("\n"),
  down: `
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS users;
  `,
};

/**
 * All migrations in order
 */
const MIGRATIONS: MigrationDefinition[] = [INITIAL_MIGRATION];

/**
 * Get list of applied migrations
 */
export function getAppliedMigrations(): Migration[] {
  const db = getDatabase();

  // Ensure migrations table exists
  db.exec(SCHEMA.migrations);

  const stmt = db.prepare("SELECT id, name, applied_at FROM migrations ORDER BY id");
  return stmt.all() as Migration[];
}

/**
 * Check if a migration has been applied
 */
export function isMigrationApplied(name: string): boolean {
  const db = getDatabase();

  // Ensure migrations table exists
  db.exec(SCHEMA.migrations);

  const stmt = db.prepare("SELECT 1 FROM migrations WHERE name = ?");
  const result = stmt.get(name);
  return result !== null;
}

/**
 * Apply a single migration
 */
export function applyMigration(migration: MigrationDefinition): void {
  const db = getDatabase();

  db.transaction(() => {
    // Execute migration SQL
    db.exec(migration.up);

    // Record migration
    const stmt = db.prepare("INSERT INTO migrations (name) VALUES (?)");
    stmt.run(migration.name);
  })();
}

/**
 * Run all pending migrations
 */
export function runMigrations(): { applied: string[]; skipped: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of MIGRATIONS) {
    if (isMigrationApplied(migration.name)) {
      skipped.push(migration.name);
    } else {
      applyMigration(migration);
      applied.push(migration.name);
    }
  }

  return { applied, skipped };
}

/**
 * Get the current migration version
 */
export function getCurrentMigrationVersion(): string | null {
  const migrations = getAppliedMigrations();
  if (migrations.length === 0) {
    return null;
  }
  return migrations[migrations.length - 1].name;
}

export { MIGRATIONS };
