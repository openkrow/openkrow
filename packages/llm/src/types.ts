/**
 * Core types for the unified LLM API.
 */

export type ProviderName = "openai" | "anthropic" | "google";

export interface LLMConfig {
  provider: ProviderName;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ChatResponse {
  id: string;
  content: string;
  role: "assistant";
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

export interface StreamEvent {
  type: "text_delta" | "tool_call_delta" | "done" | "error";
  delta?: string;
  toolCall?: Partial<ToolCall>;
  response?: ChatResponse;
  error?: Error;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

/**
 * Common options for chat/stream calls.
 */
export interface ChatOptions {
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: string;

  chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse>;

  stream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent>;

  listModels(): Promise<ModelInfo[]>;
}

// ---------------------------------------------------------------------------
// Model Routing
// ---------------------------------------------------------------------------

/**
 * Configuration for a single model endpoint (provider + model ID).
 */
export interface ModelEndpoint {
  provider: ProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Smart routing configuration — maps task categories to model endpoints.
 */
export interface ModelRoutingConfig {
  /** Strongest reasoning model for user-facing work. */
  primary: ModelEndpoint;
  /** Cheap/fast model for mechanical background tasks. */
  background: ModelEndpoint;
}

/**
 * Background tasks that the router can dispatch to the cheap model.
 */
export type BackgroundTask =
  | { type: "summarize"; content: string }
  | { type: "extract_personality"; conversations: string[] }
  | { type: "generate_title"; firstMessage: string }
  | { type: "generate_context"; fileTree: string; readme: string };

/**
 * High-level router interface that sits above individual LLMProviders.
 * The agent uses this instead of LLMClient directly.
 */
export interface IModelRouter {
  /** Send a chat request routed to the primary model. */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Stream a response from the primary model. */
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<StreamEvent>;

  /** Execute a background task using the cheap/fast model. */
  background(task: BackgroundTask): Promise<string>;

  /** Get the routing configuration. */
  getConfig(): ModelRoutingConfig;
}
