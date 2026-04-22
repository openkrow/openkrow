/**
 * @openkrow/llm — Core type definitions
 *
 * Inspired by pi-mono/packages/ai but simplified:
 * - Text-only streaming (no tool call processing in this package)
 * - Tool definitions passed through to providers but results handled by agent
 */

// ---------------------------------------------------------------------------
// API & Provider identifiers
// ---------------------------------------------------------------------------

/** Known LLM API protocols */
export type KnownApi =
  | "openai-completions"
  | "anthropic-messages"
  | "google-generative-ai";

/** Known LLM providers */
export type KnownProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "github-copilot"
  | "xai"
  | "groq"
  | "deepseek"
  | "openrouter";

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface Model<TApi extends KnownApi = KnownApi> {
  /** Model identifier (e.g. "claude-sonnet-4-20250514") */
  id: string;
  /** Human-readable name */
  name: string;
  /** API protocol this model uses */
  api: TApi;
  /** Provider that hosts this model */
  provider: KnownProvider;
  /** Base URL override (for custom endpoints) */
  baseUrl?: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxTokens: number;
  /** Whether the model supports tool/function calling */
  supportsTools: boolean;
  /** Whether the model supports extended thinking */
  supportsThinking: boolean;
  /** Cost per million input tokens (USD) */
  inputCostPerMillion?: number;
  /** Cost per million output tokens (USD) */
  outputCostPerMillion?: number;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Content types within a message */
export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  text: string;
}

export interface ImageContent {
  type: "image";
  /** Base64-encoded image data */
  data: string;
  /** MIME type (e.g. "image/png") */
  mediaType: string;
}

export interface ToolCallContent {
  type: "tool_call";
  id: string;
  name: string;
  arguments: string;
}

export type ContentPart =
  | TextContent
  | ThinkingContent
  | ImageContent
  | ToolCallContent;

export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentPart[];
  usage?: Usage;
}

export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

// ---------------------------------------------------------------------------
// Tool definitions (passed through to providers, processed by agent)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Context (what gets sent to the LLM)
// ---------------------------------------------------------------------------

export interface Context {
  /** System prompt */
  systemPrompt?: string;
  /** Conversation messages */
  messages: Message[];
  /** Available tools (passed to provider, tool execution is agent's job) */
  tools?: ToolDefinition[];
}

// ---------------------------------------------------------------------------
// Stream options
// ---------------------------------------------------------------------------

export interface StreamOptions {
  /** API key override */
  apiKey?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Custom headers */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Streaming events
// ---------------------------------------------------------------------------

export interface TextStartEvent {
  type: "text_start";
}

export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface TextEndEvent {
  type: "text_end";
}

export interface ThinkingStartEvent {
  type: "thinking_start";
}

export interface ThinkingDeltaEvent {
  type: "thinking_delta";
  text: string;
}

export interface ThinkingEndEvent {
  type: "thinking_end";
}

export interface ToolCallStartEvent {
  type: "tool_call_start";
  id: string;
  name: string;
}

export interface ToolCallDeltaEvent {
  type: "tool_call_delta";
  arguments: string;
}

export interface ToolCallEndEvent {
  type: "tool_call_end";
}

export interface DoneEvent {
  type: "done";
  message: AssistantMessage;
}

export interface ErrorEvent {
  type: "error";
  error: Error;
}

export type StreamEvent =
  | TextStartEvent
  | TextDeltaEvent
  | TextEndEvent
  | ThinkingStartEvent
  | ThinkingDeltaEvent
  | ThinkingEndEvent
  | ToolCallStartEvent
  | ToolCallDeltaEvent
  | ToolCallEndEvent
  | DoneEvent
  | ErrorEvent;

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost?: number;
}

// ---------------------------------------------------------------------------
// API Provider (what each provider module exports)
// ---------------------------------------------------------------------------

export interface ApiProvider {
  /** API protocol identifier */
  api: KnownApi;
  /** Stream a response from this provider */
  stream: (
    model: Model,
    context: Context,
    options?: StreamOptions
  ) => AssistantMessageEventStream;
}

// ---------------------------------------------------------------------------
// Event stream (forward declaration — implemented in event-stream.ts)
// ---------------------------------------------------------------------------

/**
 * An async iterable stream of assistant message events.
 * Consumers iterate events with `for await...of`.
 * Call `result()` to get the final AssistantMessage after the stream completes.
 */
export interface AssistantMessageEventStream
  extends AsyncIterable<StreamEvent> {
  /** Promise that resolves to the final AssistantMessage when the stream is done */
  result(): Promise<AssistantMessage>;
}

// ---------------------------------------------------------------------------
// Env API key resolution
// ---------------------------------------------------------------------------

export interface EnvApiKeyMap {
  provider: KnownProvider;
  envVars: string[];
}

// ---------------------------------------------------------------------------
// LLMConfig (simplified config for quick setup — used by agent)
// ---------------------------------------------------------------------------

export interface LLMConfig {
  provider: KnownProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}
