/**
 * Message repository for managing conversation messages
 */

import { BaseRepository } from "./base.js";
import type { Message } from "../types/index.js";

export interface CreateMessageInput {
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: Record<string, unknown>[];
}

export class MessageRepository extends BaseRepository<Message> {
  protected tableName = "messages";

  /**
   * Create a new message
   */
  create(input: CreateMessageInput): Message {
    const id = this.generateId();
    const now = this.now();
    const toolCalls = input.tool_calls ? JSON.stringify(input.tool_calls) : null;

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, tool_calls, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, input.conversation_id, input.role, input.content, toolCalls, now);

    return this.findById(id)!;
  }

  /**
   * Find messages by conversation ID
   */
  findByConversationId(conversationId: string, limit?: number): Message[] {
    let sql = "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC";
    const params: (string | number)[] = [conversationId];

    if (limit !== undefined) {
      sql += " LIMIT ?";
      params.push(limit);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Message[];
  }

  /**
   * Get the last N messages for a conversation
   */
  getLastMessages(conversationId: string, count: number): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages 
        WHERE conversation_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      ) ORDER BY created_at ASC
    `);

    return stmt.all(conversationId, count) as Message[];
  }

  /**
   * Count messages in a conversation
   */
  countByConversationId(conversationId: string): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?"
    );
    const result = stmt.get(conversationId) as { count: number };
    return result.count;
  }

  /**
   * Delete all messages in a conversation
   */
  deleteByConversationId(conversationId: string): number {
    const stmt = this.db.prepare("DELETE FROM messages WHERE conversation_id = ?");
    const result = stmt.run(conversationId);
    return result.changes;
  }

  /**
   * Search messages by content
   */
  searchByContent(query: string, limit: number = 50): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages 
      WHERE content LIKE ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `);

    return stmt.all(`%${query}%`, limit) as Message[];
  }
}
