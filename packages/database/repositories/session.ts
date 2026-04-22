/**
 * Session repository for managing user sessions
 */

import { BaseRepository } from "./base.js";
import type { Session } from "../types/index.js";

export interface CreateSessionInput {
  user_id: string;
  workspace_path: string;
  metadata?: Record<string, unknown>;
}

export class SessionRepository extends BaseRepository<Session> {
  protected tableName = "sessions";

  /**
   * Create a new session
   */
  create(input: CreateSessionInput): Session {
    const id = this.generateId();
    const now = this.now();
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, workspace_path, started_at, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, input.user_id, input.workspace_path, now, metadata);

    return this.findById(id)!;
  }

  /**
   * End a session
   */
  endSession(id: string): Session | null {
    const stmt = this.db.prepare(`
      UPDATE sessions SET ended_at = ? WHERE id = ?
    `);

    stmt.run(this.now(), id);

    return this.findById(id);
  }

  /**
   * Find sessions by user ID
   */
  findByUserId(userId: string, limit?: number): Session[] {
    let sql = "SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC";
    const params: (string | number)[] = [userId];

    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Session[];
  }

  /**
   * Find sessions by workspace path
   */
  findByWorkspace(workspacePath: string, limit?: number): Session[] {
    let sql = "SELECT * FROM sessions WHERE workspace_path = ? ORDER BY started_at DESC";
    const params: (string | number)[] = [workspacePath];

    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Session[];
  }

  /**
   * Get the most recent active session for a user
   */
  getActiveSession(userId: string): Session | null {
    const stmt = this.db.prepare(`
      SELECT * FROM sessions 
      WHERE user_id = ? AND ended_at IS NULL 
      ORDER BY started_at DESC 
      LIMIT 1
    `);

    return stmt.get(userId) as Session | null;
  }
}
