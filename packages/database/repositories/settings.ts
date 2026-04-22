/**
 * Settings repository for managing key-value settings
 */

import { getDatabase } from "../connection/index.js";
import type { Setting } from "../types/index.js";

export class SettingsRepository {
  private get db() {
    return getDatabase();
  }

  private now(): string {
    return new Date().toISOString();
  }

  /**
   * Get a setting value by key
   */
  get(key: string): string | null {
    const stmt = this.db.prepare("SELECT value FROM settings WHERE key = ?");
    const result = stmt.get(key) as { value: string } | null;
    return result?.value ?? null;
  }

  /**
   * Get a setting value as JSON
   */
  getJson<T>(key: string): T | null {
    const value = this.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a setting value
   */
  set(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    stmt.run(key, value, this.now());
  }

  /**
   * Set a setting value as JSON
   */
  setJson<T>(key: string, value: T): void {
    this.set(key, JSON.stringify(value));
  }

  /**
   * Delete a setting
   */
  delete(key: string): boolean {
    const stmt = this.db.prepare("DELETE FROM settings WHERE key = ?");
    const result = stmt.run(key);
    return result.changes > 0;
  }

  /**
   * Get all settings
   */
  getAll(): Setting[] {
    const stmt = this.db.prepare("SELECT * FROM settings ORDER BY key");
    return stmt.all() as Setting[];
  }

  /**
   * Get all settings as a key-value object
   */
  getAllAsObject(): Record<string, string> {
    const settings = this.getAll();
    const result: Record<string, string> = {};

    for (const setting of settings) {
      result[setting.key] = setting.value;
    }

    return result;
  }

  /**
   * Check if a setting exists
   */
  has(key: string): boolean {
    const stmt = this.db.prepare("SELECT 1 FROM settings WHERE key = ?");
    return stmt.get(key) !== null;
  }
}
