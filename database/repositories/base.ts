/**
 * Base repository class with common database operations.
 *
 * Each repository receives a `Database` instance at construction time,
 * removing the dependency on a global singleton.
 */

import type { Database } from "bun:sqlite";

export abstract class BaseRepository<T> {
  protected abstract tableName: string;
  protected readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  protected generateId(): string {
    return crypto.randomUUID();
  }

  protected now(): string {
    return new Date().toISOString();
  }

  findById(id: string): T | null {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    return stmt.get(id) as T | null;
  }

  findAll(limit?: number, offset?: number): T[] {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: number[] = [];

    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    if (offset !== undefined) {
      sql += " OFFSET ?";
      params.push(offset);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  deleteById(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  count(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    const result = stmt.get() as { count: number };
    return result.count;
  }
}
