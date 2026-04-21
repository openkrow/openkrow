/**
 * @openkrow/agent — Type definitions
 */

import type { LLMConfig } from "@openkrow/ai";

// ---------------------------------------------------------------------------
// Agent Configuration
// ---------------------------------------------------------------------------

export interface AgentConfig {
  name: string;
  description?: string;
  systemPrompt?: string;
  llm?: LLMConfig;
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
// Messages
// ---------------------------------------------------------------------------

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AgentEvents {
  message: (message: Message) => void;
  error: (error: Error) => void;
  done: () => void;
}
