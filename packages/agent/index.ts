/**
 * @openkrow/agent — Agent runtime package
 *
 * Core agent class with async generator support for streaming responses.
 */

import { EventEmitter } from "eventemitter3";
import type { AgentConfig, AgentEvents, Message } from "./types/index.js";
import { ToolRegistry } from "./tools/index.js";
import { ContextManager } from "./context/index.js";

/**
 * Agent — Core agent class with async generator support.
 *
 * The main orchestrator for running AI agent interactions with tool calling,
 * context management, and streaming support.
 */
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

  /**
   * Run a single prompt and return the full response.
   */
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

  /**
   * Stream a response token-by-token using an async generator.
   */
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

// Re-export supporting classes
export { ToolRegistry } from "./tools/index.js";
export { ContextManager } from "./context/index.js";
export { ConversationState } from "./state/index.js";
export { PersonalityManager } from "./personality/index.js";
export { WorkspaceManager } from "./workspace/index.js";
export { SkillManager } from "./skills/index.js";

// Re-export types
export type {
  AgentConfig,
  AgentEvents,
  Tool,
  ToolDefinition,
  ToolResult,
  Message,
} from "./types/index.js";

export type { UserPersonality } from "./personality/index.js";
export type { WorkspaceContext } from "./workspace/index.js";
export type { Skill } from "./skills/index.js";
