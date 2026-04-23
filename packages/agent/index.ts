/**
 * @openkrow/agent — Agent runtime package
 *
 * Core agent class with async generator support for streaming responses.
 */

import { EventEmitter } from "eventemitter3";
import type { AgentConfig, AgentEvents, Message, UserMessage, AssistantMessage } from "./types/index.js";
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

    // Configure prompt assembly — the ContextManager owns the system prompt
    if (config.customPrompt) {
      this.context.setCustomPrompt(config.customPrompt);
    } else {
      this.context.configurePrompt({
        provider: config.llm?.provider,
        userName: config.userName,
      });
    }
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Persist a message to the database if configured */
  private persistMessage(role: "user" | "assistant" | "system", content: string): void {
    const { database, conversationId } = this.config;
    if (database && conversationId) {
      database.messages.create({
        conversation_id: conversationId,
        role,
        content,
      });
    }
  }

  /**
   * Run a single prompt and return the full response.
   */
  async run(input: string): Promise<string> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    this._isRunning = true;

    const userMsg: Omit<UserMessage, "timestamp"> = { role: "user", content: input };
    this.context.addMessage(userMsg);
    this.persistMessage("user", input);

    try {
      // Placeholder: in real implementation, call LLM here
      const response = `Received: ${input}`;
      const assistantMsg: Omit<AssistantMessage, "timestamp"> = {
        role: "assistant",
        content: [{ type: "text", text: response }],
      };
      const msg = this.context.addMessage(assistantMsg);
      this.persistMessage("assistant", response);
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

    const userMsg: Omit<UserMessage, "timestamp"> = { role: "user", content: input };
    this.context.addMessage(userMsg);
    this.persistMessage("user", input);

    try {
      // Placeholder: simulate streaming response
      const words = `Streaming response for: ${input}`.split(" ");
      let fullResponse = "";
      for (const word of words) {
        fullResponse += word + " ";
        yield word + " ";
        await new Promise((r) => setTimeout(r, 50));
      }
      this.persistMessage("assistant", fullResponse.trim());
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
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  SnipMarker,
  SummaryBoundary,
  SendableMessage,
  ContextAssemblyOptions,
  ContextAssemblyResult,
  CompactionAction,
  DatabaseClient,
} from "./types/index.js";

// Re-export token utilities
export { estimateTokens, estimateMessageTokens, estimateTotalTokens } from "./context/index.js";

// Re-export prompt assembly
export { assembleSystemPrompt } from "./context/prompt.js";
export type { PromptAssemblyOptions } from "./context/prompt.js";

export type { UserPersonality } from "./personality/index.js";
export type { WorkspaceContext } from "./workspace/index.js";
export type { Skill } from "./skills/index.js";
