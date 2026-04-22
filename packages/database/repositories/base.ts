/**
 * Base repository class with common database operations
 */

import { getDatabase } from "../connection/index.js";
import type { Database } from "bun:sqlite";

export abstract class BaseRepository<T> {
  protected abstract tableName: string;

  protected get db(): Database {
    return getDatabase();
  }

  /**
   * Generate a unique ID
   */
  protected generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Get current timestamp in ISO format
   */
  protected now(): string {
    return new Date().toISOString();
  }

  /**
   * Find a record by ID
   */
  findById(id: string): T | null {
    const stmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`);
    return stmt.get(id) as T | null;
  }

  /**
   * Find all records
   */
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

  /**
   * Delete a record by ID
   */
  deleteById(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Count total records
   */
  count(): number {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`);
    const result = stmt.get() as { count: number };
    return result.count;
  }
}
