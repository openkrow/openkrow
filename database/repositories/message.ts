/**
 * Message repository — stores all messages for a workspace.
 * One workspace = one conversation, so no conversation_id needed.
 */

import { BaseRepository } from "./base.js";
import type { Message, CreateMessageInput } from "../types/index.js";

export class MessageRepository extends BaseRepository<Message> {
  protected tableName = "messages";

  create(input: CreateMessageInput): Message {
    const id = this.generateId();
    const now = this.now();
    const toolCalls = input.tool_calls ? JSON.stringify(input.tool_calls) : null;
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

    const stmt = this.db.prepare(`
      INSERT INTO messages (id, role, content, tool_calls, tool_call_id, tool_name, is_error, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.role,
      input.content,
      toolCalls,
      input.tool_call_id ?? null,
      input.tool_name ?? null,
      input.is_error ? 1 : 0,
      metadata,
      now,
    );

    return this.findById(id)!;
  }

  getLastMessages(count: number): Message[] {
    const stmt = this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages
        ORDER BY created_at DESC
        LIMIT ?
      ) ORDER BY created_at ASC
    `);

    return stmt.all(count) as Message[];
  }

  deleteAll(): number {
    const stmt = this.db.prepare("DELETE FROM messages");
    const result = stmt.run();
    return result.changes;
  }

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
