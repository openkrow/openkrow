/**
 * Conversation repository for managing conversations
 */

import { BaseRepository } from "./base.js";
import type { Conversation } from "../types/index.js";

export interface CreateConversationInput {
  session_id: string;
  title?: string;
}

export interface UpdateConversationInput {
  title?: string;
}

export class ConversationRepository extends BaseRepository<Conversation> {
  protected tableName = "conversations";

  /**
   * Create a new conversation
   */
  create(input: CreateConversationInput): Conversation {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, session_id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, input.session_id, input.title ?? null, now, now);

    return this.findById(id)!;
  }

  /**
   * Update a conversation
   */
  update(id: string, input: UpdateConversationInput): Conversation | null {
    const conversation = this.findById(id);
    if (!conversation) return null;

    const title = input.title !== undefined ? input.title : conversation.title;

    const stmt = this.db.prepare(`
      UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?
    `);

    stmt.run(title ?? null, this.now(), id);

    return this.findById(id);
  }

  /**
   * Find conversations by session ID
   */
  findBySessionId(sessionId: string, limit?: number): Conversation[] {
    let sql = "SELECT * FROM conversations WHERE session_id = ? ORDER BY created_at DESC";
    const params: (string | number)[] = [sessionId];

    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Conversation[];
  }

  /**
   * Get recent conversations across all sessions
   */
  getRecent(limit: number = 10): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations 
      ORDER BY updated_at DESC 
      LIMIT ?
    `);

    return stmt.all(limit) as Conversation[];
  }

  /**
   * Search conversations by title
   */
  searchByTitle(query: string, limit: number = 10): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations 
      WHERE title LIKE ? 
      ORDER BY updated_at DESC 
      LIMIT ?
    `);

    return stmt.all(`%${query}%`, limit) as Conversation[];
  }
}
