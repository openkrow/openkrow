/**
 * @openkrow/agent — Agent runtime package
 *
 * Core agent class with async generator support for streaming responses.
 * Implements the query loop: context assembly → LLM call → observe content
 * for toolCall blocks (needsFollowUp) → tool execution → repeat until done.
 */

import {
  stream as piAiStream,
  complete as piAiComplete,
  getModels,
  getProviders,
} from "@mariozechner/pi-ai";
import type {
  Model,
  Context as PiAiContext,
  StreamOptions as PiAiStreamOptions,
  AssistantMessage as PiAiAssistantMessage,
  Tool as PiAiTool,
  KnownProvider,
} from "@mariozechner/pi-ai";

import type {
  AgentConfig,
  RunOptions,
  StreamEvent,
  LLMConfig,
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  SendableMessage,
  ContextAssemblyOptions,
} from "./types/index.js";
import { ToolManager } from "./tools/index.js";
import { ContextManager } from "./context/index.js";
import { toLLMMessages, extractToolCalls, hasToolCalls, getTextContent } from "./context/convert.js";

// ---------------------------------------------------------------------------
// Helpers — fill gaps between pi-ai and agent needs
// ---------------------------------------------------------------------------

/**
 * Find a model by ID across all providers (pi-ai doesn't have getModelById).
 */
function getModelById(modelId: string): Model<any> | undefined {
  for (const provider of getProviders()) {
    const models = getModels(provider);
    const found = models.find((m: Model<any>) => m.id === modelId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Get all registered models across all providers.
 */
function getAllModels(): Model<any>[] {
  return getProviders().flatMap((p: KnownProvider) => getModels(p));
}

/**
 * Agent — Core agent class with async generator support.
 *
 * The main orchestrator for running AI agent interactions with tool calling,
 * context management, and streaming support.
 */
export class Agent {
  readonly config: AgentConfig;
  readonly tools: ToolManager;
  readonly context: ContextManager;

  private _isRunning = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.tools = new ToolManager({
      cwd: config.cwd,
      workspacePath: config.workspace?.getPath() ?? undefined,
      skillManager: config.skillManager,
      questionHandler: config.questionHandler,
    });

    // ContextManager owns persistence — pass database + workspace
    this.context = new ContextManager({
      database: config.database,
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

    const streamOpts: PiAiStreamOptions & Record<string, unknown> = {
      apiKey: llmConfig.apiKey,
      maxTokens: 1024, // Summary should be concise
      temperature: 0, // Deterministic summaries
    };

    this.context.setSummarizer(async (messages: SendableMessage[]): Promise<string> => {
      const llmMessages = toLLMMessages(messages);

      const summaryPrompt = [
        "You are a conversation summarizer. Summarize the following conversation messages into a concise paragraph.",
        "Focus on: what the user asked for, what actions were taken, what tools were used and their key results, and any important decisions or outcomes.",
        "Be specific about file names, function names, and concrete details. Do NOT include pleasantries or filler.",
        "Keep the summary under 500 words.",
      ].join(" ");

      const response = await piAiComplete(model, {
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
  private resolveModel(llmConfig: LLMConfig): Model<any> {
    const model = getModelById(llmConfig.model);
    if (!model) {
      throw new Error(`Model "${llmConfig.model}" not found in the model registry.`);
    }
    return model;
  }

  /**
   * Build StreamOptions from LLM config.
   */
  private buildStreamOptions(llmConfig: LLMConfig, signal?: AbortSignal): PiAiStreamOptions & Record<string, unknown> {
    return {
      apiKey: llmConfig.apiKey,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      signal,
    };
  }

  /**
   * Build ContextAssemblyOptions from the model and registered tools.
   */
  private buildAssemblyOptions(model: Model<any>): ContextAssemblyOptions {
    return {
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxTokens,
      tools: this.tools.getDefinitions(),
    };
  }

  /**
   * Convert agent ToolDefinitions to pi-ai Tool format.
   */
  private getPiAiTools(): PiAiTool[] | undefined {
    const defs = this.tools.getDefinitions();
    if (defs.length === 0) return undefined;
    return defs.map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.parameters as any,
    }));
  }

  // ---- Tool execution (yields events) ----

  /**
   * Execute tool calls from an LLM response in parallel, add results to context.
   * Returns StreamEvents for each tool call and result.
   */
  private async executeToolCalls(llmMsg: PiAiAssistantMessage): Promise<StreamEvent[]> {
    const toolCalls = extractToolCalls(llmMsg);
    const events: StreamEvent[] = [];

    // Execute all tool calls in parallel
    const executions = toolCalls.map(async (tc) => {
      const callEvent: StreamEvent = {
        type: "tool_call",
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments as Record<string, unknown>,
      };

      const args = tc.arguments as Record<string, unknown>;
      const result = await this.tools.execute(tc.name, args);

      const resultEvent: StreamEvent = {
        type: "tool_result",
        toolCallId: tc.id,
        toolName: tc.name,
        success: result.success,
        output: result.output,
      };

      const toolMsg: Omit<ToolResultMessage, "timestamp"> = {
        role: "tool",
        toolCallId: tc.id,
        toolName: tc.name,
        content: result.success ? result.output : (result.error ?? result.output),
        isError: !result.success,
      };

      this.context.addMessage(toolMsg);
      return [callEvent, resultEvent];
    });

    const pairs = await Promise.all(executions);
    for (const pair of pairs) events.push(...pair);
    return events;
  }

  // ---- Public API ----

  /**
   * Stream a response as an async generator of StreamEvents.
   *
   * Yields all LLM response events: text deltas, thinking blocks, tool calls,
   * tool results, messages, errors, and a final done event.
   * The loop continues while needsFollowUp is true (toolCall blocks observed).
   */
  async *stream(input: string, options?: RunOptions): AsyncGenerator<StreamEvent, void, unknown> {
    console.log("Agent stream started with input:", input);
    if (this._isRunning) {
      throw new Error("Agent is already running");
    }

    const llmConfig = this.effectiveLLMConfig(options?.llm);
    const model = this.resolveModel(llmConfig);
    const streamOpts = this.buildStreamOptions(llmConfig, options?.signal);
    this.configureSummarizer(llmConfig);

    this._isRunning = true;

    const userMsg: Omit<UserMessage, "timestamp"> = { role: "user", content: input };
    this.context.addMessage(userMsg);

    let turnCount = 0;

    try {
      while (true) {
        if (options?.maxTurns && turnCount >= options.maxTurns) {
          yield { type: "text_delta", delta: "[Agent reached maximum turn limit]" };
          return;
        }

        // 1. Context Assembly
        const assembled = await this.context.contextAssembly(this.buildAssemblyOptions(model));
        const llmMessages = toLLMMessages(assembled.messages);
        const context: PiAiContext = {
          systemPrompt: assembled.systemPrompt,
          messages: llmMessages,
          tools: this.getPiAiTools(),
        };

        // 2. Stream from LLM
        const eventStream = piAiStream(model, context, streamOpts);

        for await (const event of eventStream) {
          switch (event.type) {
            case "text_delta":
              yield { type: "text_delta", delta: event.delta };
              break;
            case "thinking_delta":
              yield { type: "thinking", thinking: event.delta };
              break;
            case "toolcall_end":
              // Tool call events will be yielded during execution below
              break;
            case "error":
              yield { type: "error", error: new Error(event.error.errorMessage ?? "LLM stream error") };
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
        yield { type: "message", message: persistedMsg };

        // 3. Observe content for toolCall blocks — derive needsFollowUp
        const needsFollowUp = hasToolCalls(llmResponse);

        if (needsFollowUp) {
          // 4. Tool Execution — yield all tool events
          const toolEvents = await this.executeToolCalls(llmResponse);
          for (const evt of toolEvents) yield evt;
          turnCount++;
          continue;
        }

        // 5. No tool calls — done
        return;
      }
    } finally {
      this._isRunning = false;
      yield { type: "done" };
    }
  }

  /**
   * Run a single prompt and return the full text response.
   * Internally consumes the stream() generator.
   */
  async run(input: string, options?: RunOptions): Promise<string> {
    let result = "";
    for await (const event of this.stream(input, options)) {
      if (event.type === "text_delta") {
        result += event.delta;
      }
    }
    return result;
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

// Re-export helper functions for consumers
export { getTextContent, extractToolCalls, hasToolCalls } from "./context/convert.js";

// Re-export types
export type {
  AgentConfig,
  StreamEvent,
  RunOptions,
  LLMConfig,
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
  AssistantContentPart,
  UserContentPart,
  ContextAssemblyOptions,
  ContextAssemblyResult,
  CompactionAction,
  WorkspaceDatabaseClient,
  SummarizerFn,
  KnownProvider,
  TextContent,
  ThinkingContent,
  ToolCall,
  ImageContent,
} from "./types/index.js";

// Re-export token utilities
export { estimateTokens, estimateMessageTokens, estimateTotalTokens } from "./context/index.js";

// Re-export prompt assembly
export { assembleSystemPrompt } from "./context/prompt.js";
export type { PromptAssemblyOptions } from "./context/prompt.js";

// Re-export message conversion utilities
export { toLLMMessage, toLLMMessages } from "./context/convert.js";
