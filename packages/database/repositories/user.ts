/**
 * User repository for managing user data
 */

import { BaseRepository } from "./base.js";
import type { User } from "../types/index.js";

export interface CreateUserInput {
  username: string;
  email?: string;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
}

export class UserRepository extends BaseRepository<User> {
  protected tableName = "users";

  /**
   * Create a new user
   */
  create(input: CreateUserInput): User {
    const id = this.generateId();
    const now = this.now();

    const stmt = this.db.prepare(`
      INSERT INTO users (id, username, email, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, input.username, input.email ?? null, now, now);

    return this.findById(id)!;
  }

  /**
   * Update an existing user
   */
  update(id: string, input: UpdateUserInput): User | null {
    const user = this.findById(id);
    if (!user) return null;

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.username !== undefined) {
      updates.push("username = ?");
      values.push(input.username);
    }

    if (input.email !== undefined) {
      updates.push("email = ?");
      values.push(input.email ?? null);
    }

    if (updates.length === 0) return user;

    updates.push("updated_at = ?");
    values.push(this.now());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE users SET ${updates.join(", ")} WHERE id = ?
    `);

    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Find a user by username
   */
  findByUsername(username: string): User | null {
    const stmt = this.db.prepare("SELECT * FROM users WHERE username = ?");
    return stmt.get(username) as User | null;
  }

  /**
   * Find a user by email
   */
  findByEmail(email: string): User | null {
    const stmt = this.db.prepare("SELECT * FROM users WHERE email = ?");
    return stmt.get(email) as User | null;
  }

  /**
   * Get or create a default user
   */
  getOrCreateDefault(): User {
    const defaultUsername = "default";
    let user = this.findByUsername(defaultUsername);

    if (!user) {
      user = this.create({ username: defaultUsername });
    }

    return user;
  }
}
