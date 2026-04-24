/**
 * @openkrow/agent — Agent runtime package
 *
 * Core agent class with async generator support for streaming responses.
 * Implements the full agentic loop: context assembly → LLM call → tool
 * execution → repeat until a text-only response or max turns.
 */

import { EventEmitter } from "eventemitter3";
import {
  stream as llmStream,
  complete as llmComplete,
  getTextContent,
  getModelById,
} from "@openkrow/llm";
import type {
  Model,
  Context as LLMContext,
  StreamOptions,
  AssistantMessage as LLMAssistantMessage,
  ToolDefinition as LLMToolDefinition,
} from "@openkrow/llm";

import type {
  AgentConfig,
  AgentEvents,
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  SendableMessage,
  ContextAssemblyOptions,
} from "./types/index.js";
import { ToolRegistry } from "./tools/index.js";
import { ContextManager } from "./context/index.js";
import { toLLMMessages, extractToolCalls, hasToolCalls } from "./context/convert.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_TURNS = 25;
const DEFAULT_MAX_TOOL_CALLS_PER_TURN = 10;

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

    // ContextManager owns persistence — pass database + conversationId
    this.context = new ContextManager({
      database: config.database,
      conversationId: config.conversationId,
    });

    // Configure prompt assembly
    if (config.customPrompt) {
      this.context.setCustomPrompt(config.customPrompt);
    } else {
      this.context.configurePrompt({
        provider: config.llm?.provider,
        userName: config.userName,
      });
    }

    // Configure LLM-based summarizer for Phase 5 auto-compaction
    if (config.llm) {
      this.configureSummarizer();
    }
  }

  /**
   * Set up the LLM-powered summarizer for context auto-compaction.
   * Uses the configured model to summarize older messages when the
   * context window overflows past all other compaction phases.
   */
  private configureSummarizer(): void {
    const model = getModelById(this.config.llm!.model);
    if (!model) return;

    const streamOpts: StreamOptions = {
      apiKey: this.config.llm!.apiKey,
      maxTokens: 1024, // Summary should be concise
      temperature: 0, // Deterministic summaries
      envFallback: this.config.llm!.apiKey ? false : true,
    };

    this.context.setSummarizer(async (messages: SendableMessage[]): Promise<string> => {
      const { toLLMMessages: convert } = await import("./context/convert.js");
      const llmMessages = convert(messages);

      const summaryPrompt = [
        "You are a conversation summarizer. Summarize the following conversation messages into a concise paragraph.",
        "Focus on: what the user asked for, what actions were taken, what tools were used and their key results, and any important decisions or outcomes.",
        "Be specific about file names, function names, and concrete details. Do NOT include pleasantries or filler.",
        "Keep the summary under 500 words.",
      ].join(" ");

      const response = await llmComplete(model, {
        systemPrompt: summaryPrompt,
        messages: llmMessages,
      }, streamOpts);

      return getTextContent(response);
    });
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  // ---- Model resolution ----

  /**
   * Resolve the LLM Model object from config. Throws if not configured or not found.
   */
  private resolveModel(): Model {
    if (!this.config.llm) {
      throw new Error("Agent requires llm config to call the LLM. Set config.llm with provider and model.");
    }
    const model = getModelById(this.config.llm.model);
    if (!model) {
      throw new Error(`Model "${this.config.llm.model}" not found in the model registry.`);
    }
    return model;
  }

  /**
   * Build StreamOptions from agent config.
   */
  private buildStreamOptions(signal?: AbortSignal): StreamOptions {
    const llmConfig = this.config.llm;
    return {
      apiKey: llmConfig?.apiKey,
      temperature: llmConfig?.temperature,
      maxTokens: llmConfig?.maxTokens,
      signal,
      // Desktop apps pass credentials from DB, so disable env fallback
      envFallback: llmConfig?.apiKey ? false : true,
    };
  }

  /**
   * Build ContextAssemblyOptions from the model and registered tools.
   */
  private buildAssemblyOptions(model: Model): ContextAssemblyOptions {
    return {
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxTokens,
      tools: this.tools.getDefinitions(),
    };
  }

  /**
   * Convert agent ToolDefinitions to LLM ToolDefinitions.
   * (They're structurally compatible, but this makes the type boundary explicit.)
   */
  private getLLMToolDefinitions(): LLMToolDefinition[] | undefined {
    const defs = this.tools.getDefinitions();
    return defs.length > 0 ? defs : undefined;
  }

  // ---- Tool execution ----

  /**
   * Execute tool calls from an LLM response in parallel, add results to context.
   * Returns the tool result messages.
   */
  private async executeToolCalls(llmMsg: LLMAssistantMessage): Promise<ToolResultMessage[]> {
    const toolCalls = extractToolCalls(llmMsg);
    const maxCalls = this.config.maxToolCallsPerTurn ?? DEFAULT_MAX_TOOL_CALLS_PER_TURN;
    const calls = toolCalls.slice(0, maxCalls);

    const results: ToolResultMessage[] = [];

    // Execute all tool calls in parallel
    const executions = calls.map(async (tc) => {
      this.emit("tool_call", { id: tc.id, name: tc.name, arguments: tc.arguments });

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.arguments);
      } catch {
        args = {};
      }

      const result = await this.tools.execute(tc.name, args);

      this.emit("tool_result", {
        toolCallId: tc.id,
        toolName: tc.name,
        success: result.success,
        output: result.output,
      });

      const toolMsg: Omit<ToolResultMessage, "timestamp"> = {
        role: "tool",
        toolCallId: tc.id,
        toolName: tc.name,
        content: result.success ? result.output : (result.error ?? result.output),
        isError: !result.success,
      };

      return this.context.addMessage(toolMsg) as ToolResultMessage;
    });

    const settled = await Promise.all(executions);
    results.push(...settled);
    return results;
  }

  // ---- Public API ----

  /**
   * Run a single prompt and return the full response.
   * Implements the full agentic loop with tool calling.
   */
  async run(input: string, options?: { signal?: AbortSignal }): Promise<string> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    // Validate before entering running state
    const model = this.resolveModel();
    const streamOpts = this.buildStreamOptions(options?.signal);

    this._isRunning = true;

    // Add user message
    const userMsg: Omit<UserMessage, "timestamp"> = { role: "user", content: input };
    this.context.addMessage(userMsg);

    try {
      const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;

      for (let turn = 0; turn < maxTurns; turn++) {
        // Assemble context
        const assembled = await this.context.contextAssembly(this.buildAssemblyOptions(model));
        const llmMessages = toLLMMessages(assembled.messages);
        const context: LLMContext = {
          systemPrompt: assembled.systemPrompt,
          messages: llmMessages,
          tools: this.getLLMToolDefinitions(),
        };

        // Call LLM
        const llmResponse = await llmComplete(model, context, streamOpts);

        // Persist assistant message
        const assistantMsg: Omit<AssistantMessage, "timestamp"> = {
          role: "assistant",
          content: llmResponse.content,
        };
        const persistedMsg = this.context.addMessage(assistantMsg);
        this.emit("message", persistedMsg);

        // Check for tool calls
        if (hasToolCalls(llmResponse)) {
          await this.executeToolCalls(llmResponse);
          // Continue the loop for another LLM turn
          continue;
        }

        // No tool calls — we're done
        return getTextContent(llmResponse);
      }

      // Exceeded max turns
      return getTextContent({
        role: "assistant",
        content: [{ type: "text", text: "[Agent reached maximum turn limit]" }],
      });
    } finally {
      this._isRunning = false;
      this.emit("done");
    }
  }

  /**
   * Stream a response token-by-token using an async generator.
   * Implements the full agentic loop with tool calling.
   *
   * Yields text deltas. Tool calls are handled internally (emitted as events).
   * The final assistant message is persisted after each LLM turn.
   */
  async *stream(input: string, options?: { signal?: AbortSignal }): AsyncGenerator<string, void, unknown> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    // Validate before entering running state
    const model = this.resolveModel();
    const streamOpts = this.buildStreamOptions(options?.signal);

    this._isRunning = true;

    // Add user message
    const userMsg: Omit<UserMessage, "timestamp"> = { role: "user", content: input };
    this.context.addMessage(userMsg);

    try {
      const maxTurns = this.config.maxTurns ?? DEFAULT_MAX_TURNS;

      for (let turn = 0; turn < maxTurns; turn++) {
        // Assemble context
        const assembled = await this.context.contextAssembly(this.buildAssemblyOptions(model));
        const llmMessages = toLLMMessages(assembled.messages);
        const context: LLMContext = {
          systemPrompt: assembled.systemPrompt,
          messages: llmMessages,
          tools: this.getLLMToolDefinitions(),
        };

        // Stream from LLM
        const eventStream = llmStream(model, context, streamOpts);

        for await (const event of eventStream) {
          switch (event.type) {
            case "text_delta":
              this.emit("text_delta", event.text);
              yield event.text;
              break;
            case "tool_call_start":
              this.emit("tool_call", { id: event.id, name: event.name, arguments: "" });
              break;
            case "error":
              this.emit("error", event.error);
              break;
          }
        }

        // Get the final assembled message
        const llmResponse = await eventStream.result();

        // Persist assistant message
        const assistantMsg: Omit<AssistantMessage, "timestamp"> = {
          role: "assistant",
          content: llmResponse.content,
        };
        const persistedMsg = this.context.addMessage(assistantMsg);
        this.emit("message", persistedMsg);

        // Check for tool calls
        if (hasToolCalls(llmResponse)) {
          await this.executeToolCalls(llmResponse);
          // Continue the loop for another LLM turn
          continue;
        }

        // No tool calls — we're done
        return;
      }

      // Exceeded max turns
      yield "[Agent reached maximum turn limit]";
    } finally {
      this._isRunning = false;
      this.emit("done");
    }
  }
}

// Re-export supporting classes
export { ToolRegistry } from "./tools/index.js";
export { ContextManager } from "./context/index.js";
export type { ContextManagerOptions } from "./context/index.js";
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
  SummarizerFn,
} from "./types/index.js";

// Re-export token utilities
export { estimateTokens, estimateMessageTokens, estimateTotalTokens } from "./context/index.js";

// Re-export prompt assembly
export { assembleSystemPrompt } from "./context/prompt.js";
export type { PromptAssemblyOptions } from "./context/prompt.js";

// Re-export message conversion utilities
export { toLLMMessage, toLLMMessages, extractToolCalls, hasToolCalls } from "./context/convert.js";

export type { UserPersonality } from "./personality/index.js";
export type { WorkspaceContext } from "./workspace/index.js";
export type { Skill } from "./skills/index.js";
