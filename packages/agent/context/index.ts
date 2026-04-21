/**
 * ContextManager — Manages conversation context.
 */

import type { Message } from "../types/index.js";

export class ContextManager {
  private messages: Message[] = [];
  private systemPrompt: string = "";

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  addMessage(message: Omit<Message, "timestamp">): Message {
    const full: Message = { ...message, timestamp: Date.now() };
    this.messages.push(full);
    return full;
  }

  getMessages(): ReadonlyArray<Message> {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
  }
}
