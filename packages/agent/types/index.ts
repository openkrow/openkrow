/**
 * @openkrow/agent — Type definitions
 *
 * Uses @mariozechner/pi-ai types directly for LLM interop.
 * Agent-specific types (messages with timestamps, tool execution, etc.) are defined here.
 */

import type {
  KnownProvider,
  TextContent,
  ThinkingContent,
  ToolCall,
  ImageContent,
} from "@mariozechner/pi-ai";
import type { WorkspaceDatabaseClient } from "@openkrow/database";
import type { SkillManager } from "@openkrow/skill";
import type { QuestionHandler } from "../tools/question.js";
import type { WorkspaceManager } from "@openkrow/workspace";

export type { WorkspaceDatabaseClient } from "@openkrow/database";

// ---------------------------------------------------------------------------
// Re-export pi-ai types used across the agent
// ---------------------------------------------------------------------------

export type { KnownProvider, TextContent, ThinkingContent, ToolCall, ImageContent } from "@mariozechner/pi-ai";

/**
 * Content part union — the types that can appear in assistant message content.
 * Aligned with pi-ai's AssistantMessage.content type.
 */
export type AssistantContentPart = TextContent | ThinkingContent | ToolCall;

/**
 * Content part union for user messages.
 */
export type UserContentPart = TextContent | ImageContent;

// ---------------------------------------------------------------------------
// LLM Configuration (agent-specific, not in pi-ai)
// ---------------------------------------------------------------------------

/**
 * Simplified LLM configuration used by the agent.
 * Maps to pi-ai's Model + StreamOptions at call time.
 */
export interface LLMConfig {
  provider: KnownProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

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
  database?: WorkspaceDatabaseClient;
  /** Working directory for bash tool (defaults to process.cwd()) */
  cwd?: string;
  /** SkillManager instance — enables the skill tool when provided */
  skillManager?: SkillManager;
  /** Question handler callback — enables the question tool when provided */
  questionHandler?: QuestionHandler;
  /** WorkspaceManager instance — context.md is injected into every LLM call */
  workspace?: WorkspaceManager;
}

// ---------------------------------------------------------------------------
// Per-request run options
// ---------------------------------------------------------------------------

/**
 * Options passed to `run()` and `stream()` per-call.
 * LLM config here overrides the `AgentConfig.llm` fallback.
 */
export interface RunOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Per-request LLM configuration (provider, model, apiKey, etc.) */
  llm?: LLMConfig;
  /** Safety net: maximum turns before forcibly stopping the loop. No default — runs until done. */
  maxTurns?: number;
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
  content: string | UserContentPart[];
  timestamp: number;
}

/**
 * An assistant message that may contain text and/or tool calls.
 */
export interface AssistantMessage {
  role: "assistant";
  content: AssistantContentPart[];
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
  /** LLM provider — used to select provider-specific system prompt */
  provider?: KnownProvider;
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
// Stream Events — yielded from the async generator
// ---------------------------------------------------------------------------

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_result"; toolCallId: string; toolName: string; success: boolean; output: string }
  | { type: "message"; message: Message }
  | { type: "error"; error: string }
  | { type: "done" };
