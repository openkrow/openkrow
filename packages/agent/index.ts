/**
 * @openkrow/agent — Agent runtime package
 *
 * Core agent class with async generator support for streaming responses.
 * Implements the query loop: context assembly → LLM call → observe content
 * for tool_use blocks (needsFollowUp) → tool execution → repeat until done.
 */

import { EventEmitter } from "eventemitter3";
import {
  stream as llmStream,
  complete as llmComplete,
  getTextContent,
  getModelById,
  LLMConfig
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
  RunOptions,
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  SendableMessage,
  ContextAssemblyOptions,
} from "./types/index.js";
import { ToolManager } from "./tools/index.js";
import type { ToolManagerOptions } from "./tools/index.js";
import { ContextManager } from "./context/index.js";
import { toLLMMessages, extractToolCalls, hasToolCalls } from "./context/convert.js";

/**
 * Agent — Core agent class with async generator support.
 *
 * The main orchestrator for running AI agent interactions with tool calling,
 * context management, and streaming support.
 */
export class Agent extends EventEmitter<AgentEvents> {
  readonly config: AgentConfig;
  readonly tools: ToolManager;
  readonly context: ContextManager;

  private _isRunning = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.tools = new ToolManager({
      cwd: config.cwd,
      workspacePath: config.workspace?.getPath() ?? undefined,
      skillManager: config.skillManager,
      questionHandler: config.questionHandler,
    });

    // ContextManager owns persistence — pass database + conversationId + workspace
    this.context = new ContextManager({
      database: config.database,
      conversationId: config.conversationId,
      workspace: config.workspace,
    });

    // Configure prompt assembly
    if (config.customPrompt) {
      this.context.setCustomPrompt(config.customPrompt);
    } else {
      this.context.configurePrompt({
        provider: config.llm?.provider,
        userName: config.userName,
        skillsSnippet: config.skillManager?.getPromptSnippet(),
      });
    }

    // If llm is set at construction time (legacy), configure the summarizer eagerly
    if (config.llm) {
      this.configureSummarizer(config.llm);
    }
  }

  /**
   * Set up the LLM-powered summarizer for context auto-compaction.
   * Uses the provided LLM config to summarize older messages when the
   * context window overflows past all other compaction phases.
   */
  private configureSummarizer(llmConfig: LLMConfig): void {
    const model = getModelById(llmConfig.model);
    if (!model) return;

    const streamOpts: StreamOptions = {
      apiKey: llmConfig.apiKey,
      maxTokens: 1024, // Summary should be concise
      temperature: 0, // Deterministic summaries
      envFallback: llmConfig.apiKey ? false : true,
    };

    this.context.setSummarizer(async (messages: SendableMessage[]): Promise<string> => {
      const llmMessages = toLLMMessages(messages);

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
   * Resolve the effective LLM config: per-call overrides → constructor fallback.
   */
  private effectiveLLMConfig(perCall?: LLMConfig): LLMConfig {
    const cfg = perCall ?? this.config.llm;
    if (!cfg) {
      throw new Error("Agent requires LLM config. Pass it via run()/stream() options.llm or AgentConfig.llm.");
    }
    return cfg;
  }

  /**
   * Resolve the LLM Model object. Throws if not found.
   */
  private resolveModel(llmConfig: LLMConfig): Model {
    const model = getModelById(llmConfig.model);
    if (!model) {
      throw new Error(`Model "${llmConfig.model}" not found in the model registry.`);
    }
    return model;
  }

  /**
   * Build StreamOptions from LLM config.
   */
  private buildStreamOptions(llmConfig: LLMConfig, signal?: AbortSignal): StreamOptions {
    return {
      apiKey: llmConfig.apiKey,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      signal,
      envFallback: llmConfig.apiKey ? false : true,
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

    // Execute all tool calls in parallel
    const executions = toolCalls.map(async (tc) => {
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
    return settled;
  }

  // ---- Public API ----

  /**
   * Run a single prompt and return the full response.
   *
   * Implements the query loop: the agent keeps running until the LLM produces
   * a response with no tool_use blocks (needsFollowUp === false).
   * An optional maxTurns safety net prevents runaway loops.
   */
  async run(input: string, options?: RunOptions): Promise<string> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    // Resolve LLM config: per-call → constructor fallback
    const llmConfig = this.effectiveLLMConfig(options?.llm);
    const model = this.resolveModel(llmConfig);
    const streamOpts = this.buildStreamOptions(llmConfig, options?.signal);

    // Ensure summarizer is configured with current LLM config
    this.configureSummarizer(llmConfig);

    this._isRunning = true;

    // Add user message
    const userMsg: Omit<UserMessage, "timestamp"> = { role: "user", content: input };
    this.context.addMessage(userMsg);

    let turnCount = 0;

    try {
      while (true) {
        // Safety net: max turns prevents death spirals
        if (options?.maxTurns && turnCount >= options.maxTurns) {
          return "[Agent reached maximum turn limit]";
        }

        // 1. Context Assembly
        const assembled = await this.context.contextAssembly(this.buildAssemblyOptions(model));
        const llmMessages = toLLMMessages(assembled.messages);
        const context: LLMContext = {
          systemPrompt: assembled.systemPrompt,
          messages: llmMessages,
          tools: this.getLLMToolDefinitions(),
        };

        // 2. Call LLM
        const llmResponse = await llmComplete(model, context, streamOpts);

        // Persist assistant message
        const assistantMsg: Omit<AssistantMessage, "timestamp"> = {
          role: "assistant",
          content: llmResponse.content,
        };
        const persistedMsg = this.context.addMessage(assistantMsg);
        this.emit("message", persistedMsg);

        // 3. Observe content for tool_use blocks — derive needsFollowUp
        const needsFollowUp = hasToolCalls(llmResponse);

        if (needsFollowUp) {
          // 4. Tool Execution
          await this.executeToolCalls(llmResponse);
          turnCount++;
          continue;
        }

        // 5. No tool calls — normal completion
        return getTextContent(llmResponse);
      }
    } finally {
      this._isRunning = false;
      this.emit("done");
    }
  }

  /**
   * Stream a response token-by-token using an async generator.
   *
   * Implements the query loop with pull-based streaming: yields text deltas
   * to the consumer. Tool calls are handled internally (emitted as events).
   * The loop continues while needsFollowUp is true (tool_use blocks observed).
   */
  async *stream(input: string, options?: RunOptions): AsyncGenerator<string, void, unknown> {
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    // Resolve LLM config: per-call → constructor fallback
    const llmConfig = this.effectiveLLMConfig(options?.llm);
    const model = this.resolveModel(llmConfig);
    const streamOpts = this.buildStreamOptions(llmConfig, options?.signal);

    // Ensure summarizer is configured with current LLM config
    this.configureSummarizer(llmConfig);

    this._isRunning = true;

    // Add user message
    const userMsg: Omit<UserMessage, "timestamp"> = { role: "user", content: input };
    this.context.addMessage(userMsg);

    let turnCount = 0;

    try {
      while (true) {
        // Safety net: max turns prevents death spirals
        if (options?.maxTurns && turnCount >= options.maxTurns) {
          yield "[Agent reached maximum turn limit]";
          return;
        }

        // 1. Context Assembly
        const assembled = await this.context.contextAssembly(this.buildAssemblyOptions(model));
        const llmMessages = toLLMMessages(assembled.messages);
        const context: LLMContext = {
          systemPrompt: assembled.systemPrompt,
          messages: llmMessages,
          tools: this.getLLMToolDefinitions(),
        };

        // 2. Stream from LLM
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

        // 3. Observe content for tool_use blocks — derive needsFollowUp
        const needsFollowUp = hasToolCalls(llmResponse);

        if (needsFollowUp) {
          // 4. Tool Execution
          await this.executeToolCalls(llmResponse);
          turnCount++;
          continue;
        }

        // 5. No tool calls — normal completion
        return;
      }
    } finally {
      this._isRunning = false;
      this.emit("done");
    }
  }
}

// Re-export supporting classes
export {
  ToolManager,
  ToolManager as ToolRegistry,
  createTool,
  loadDescription,
  ok,
  fail,
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createTodoTool,
  createWebFetchTool,
  createWebSearchTool,
  createSkillTool,
  createQuestionTool,
} from "./tools/index.js";
export type {
  CreateToolOptions,
  ToolManagerOptions,
  TodoItem,
  QuestionOption,
  QuestionPrompt,
  QuestionHandler,
} from "./tools/index.js";
export { ContextManager } from "./context/index.js";
export type { ContextManagerOptions } from "./context/index.js";
export { PersonalityManager } from "./personality/index.js";

// Re-export types
export type {
  AgentConfig,
  AgentEvents,
  RunOptions,
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
  WorkspaceDatabaseClient,
  SummarizerFn,
  LLMConfig,
} from "./types/index.js";

// Re-export token utilities
export { estimateTokens, estimateMessageTokens, estimateTotalTokens } from "./context/index.js";

// Re-export prompt assembly
export { assembleSystemPrompt } from "./context/prompt.js";
export type { PromptAssemblyOptions } from "./context/prompt.js";

// Re-export message conversion utilities
export { toLLMMessage, toLLMMessages, extractToolCalls, hasToolCalls } from "./context/convert.js";

export type { UserPersonality } from "./personality/index.js";
