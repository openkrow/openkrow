/**
 * @openkrow/agent — Type definitions
 */

import type {
  LLMConfig,
  ContentPart,
  ToolCallContent,
  KnownProvider,
} from "@openkrow/llm";
import type { DatabaseClient } from "@openkrow/database";

export type { DatabaseClient } from "@openkrow/database";

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  name: string;
  description?: string;
  /**
   * Custom system prompt override. When set, bypasses the built-in prompt
   * assembly pipeline entirely. Use this only for specialized agents that
   * need a completely custom prompt.
   */
  customPrompt?: string;
  /** User's name, injected into the assembled prompt */
  userName?: string;
  llm?: LLMConfig;
  /** Database client for persistence. When provided, the agent persists messages automatically. */
  database?: DatabaseClient;
  /** Conversation ID to persist messages to. Required when database is provided. */
  conversationId?: string;
  maxTurns?: number;
  maxToolCallsPerTurn?: number;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface Tool {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Messages — Rich message types for the agent conversation history
// ---------------------------------------------------------------------------

/**
 * A user message (text, possibly with images in the future).
 */
export interface UserMessage {
  role: "user";
  content: string | ContentPart[];
  timestamp: number;
}

/**
 * An assistant message that may contain text and/or tool calls.
 */
export interface AssistantMessage {
  role: "assistant";
  content: ContentPart[];
  timestamp: number;
}

/**
 * A tool result returned after executing a tool call.
 */
export interface ToolResultMessage {
  role: "tool";
  toolCallId: string;
  /** The tool name, for display/logging purposes */
  toolName: string;
  content: string;
  isError?: boolean;
  timestamp: number;
}

/**
 * A snip marker indicating older messages were dropped without summarization.
 * Inserted by the Snip Compact phase.
 */
export interface SnipMarker {
  role: "snip";
  /** Number of messages that were dropped */
  droppedCount: number;
  /** Approximate tokens freed by the snip */
  tokensFreed: number;
  timestamp: number;
}

/**
 * A summary boundary replacing a range of older messages with a condensed summary.
 * Inserted by the Auto-Compaction phase.
 */
export interface SummaryBoundary {
  role: "summary";
  /** The summary text produced by the LLM */
  content: string;
  /** Number of original messages that were summarized */
  summarizedCount: number;
  /** Approximate tokens freed */
  tokensFreed: number;
  timestamp: number;
}

/**
 * Union of all message types stored in the agent's conversation history.
 */
export type Message =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | SnipMarker
  | SummaryBoundary;

/**
 * Only "real" messages that can be sent to the LLM (excludes markers).
 */
export type SendableMessage = UserMessage | AssistantMessage | ToolResultMessage;

// ---------------------------------------------------------------------------
// Context Assembly types
// ---------------------------------------------------------------------------

/**
 * A function that summarizes a list of messages into a short text summary.
 * Used by Phase 5 (Auto-Compaction) to generate LLM-based summaries.
 *
 * The agent configures this callback using the LLM package, keeping the
 * ContextManager testable without real API calls.
 */
export type SummarizerFn = (messages: SendableMessage[]) => Promise<string>;

export interface ContextAssemblyOptions {
  /** Model context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens reserved for the response */
  maxOutputTokens: number;
  /** Available tools (their definitions contribute to token budget) */
  tools?: ToolDefinition[];
  /**
   * Buffer reserved beyond maxOutputTokens to prevent context overflow.
   * Defaults to 20_000.
   */
  reservedBuffer?: number;
  /** Maximum tokens for a single tool result before it gets trimmed. Defaults to 10_000. */
  toolResultBudget?: number;
}

export interface ContextAssemblyResult {
  /** Messages ready to send to the LLM */
  messages: SendableMessage[];
  /** System prompt */
  systemPrompt?: string;
  /** Approximate total tokens in the assembled context */
  estimatedTokens: number;
  /** Compaction actions that were applied */
  compactions: CompactionAction[];
}

export interface CompactionAction {
  type: "tool_result_trim" | "snip" | "microcompact" | "context_collapse" | "auto_compaction";
  tokensFreed: number;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AgentEvents {
  /** Emitted when a complete message is added to the conversation */
  message: (message: Message) => void;
  /** Emitted for each text delta during streaming */
  text_delta: (text: string) => void;
  /** Emitted when the LLM requests a tool call */
  tool_call: (toolCall: { id: string; name: string; arguments: string }) => void;
  /** Emitted when a tool execution completes */
  tool_result: (result: { toolCallId: string; toolName: string; success: boolean; output: string }) => void;
  /** Emitted on errors (non-fatal, the loop may continue) */
  error: (error: Error) => void;
  /** Emitted when the agent finishes processing */
  done: () => void;
}
