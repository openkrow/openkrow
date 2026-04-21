/**
 * Agent — Core agent class with async generator support.
 */

import { EventEmitter } from "eventemitter3";
import type { AgentConfig, AgentEvents, Message } from "../types/index.js";
import { ToolRegistry } from "../tools/index.js";
import { ContextManager } from "../context/index.js";

export class Agent extends EventEmitter<AgentEvents> {
  readonly config: AgentConfig;
  readonly tools: ToolRegistry;
  readonly context: ContextManager;

  private _isRunning = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.tools = new ToolRegistry();
    this.context = new ContextManager();

    if (config.systemPrompt) {
      this.context.setSystemPrompt(config.systemPrompt);
    }
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  async run(input: string): Promise<string> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    this._isRunning = true;
    this.context.addMessage({ role: "user", content: input });

    try {
      // Placeholder: in real implementation, call LLM here
      const response = `Received: ${input}`;
      const msg = this.context.addMessage({ role: "assistant", content: response });
      this.emit("message", msg);
      return response;
    } finally {
      this._isRunning = false;
      this.emit("done");
    }
  }

  async *stream(input: string): AsyncGenerator<string, void, unknown> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    this._isRunning = true;
    this.context.addMessage({ role: "user", content: input });

    try {
      // Placeholder: simulate streaming response
      const words = `Streaming response for: ${input}`.split(" ");
      for (const word of words) {
        yield word + " ";
        await new Promise((r) => setTimeout(r, 50));
      }
    } finally {
      this._isRunning = false;
      this.emit("done");
    }
  }
}
