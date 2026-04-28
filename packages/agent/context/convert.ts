/**
 * Message conversion between agent and pi-ai message types.
 *
 * The agent's message types have `timestamp` fields and richer discriminated
 * unions (SnipMarker, SummaryBoundary) that don't exist in pi-ai.
 * These helpers bridge the gap.
 */

import type {
  Message as PiAiMessage,
  UserMessage as PiAiUserMessage,
  AssistantMessage as PiAiAssistantMessage,
  ToolResultMessage as PiAiToolResultMessage,
  ToolCall,
} from "@mariozechner/pi-ai";

import type {
  SendableMessage,
  AssistantMessage,
} from "../types/index.js";

/**
 * Convert an agent SendableMessage to the pi-ai Message format.
 * Strips agent-specific fields and maps to pi-ai's expected structure.
 */
export function toLLMMessage(msg: SendableMessage): PiAiMessage {
  switch (msg.role) {
    case "user":
      return {
        role: "user",
        content: msg.content,
        timestamp: msg.timestamp,
      } satisfies PiAiUserMessage;
    case "assistant":
      return {
        role: "assistant",
        content: msg.content,
        // pi-ai requires these metadata fields on AssistantMessage;
        // when replaying history they're not used by providers for context building
        api: "" as any,
        provider: "" as any,
        model: "",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: msg.timestamp,
      } satisfies PiAiAssistantMessage;
    case "tool":
      return {
        role: "toolResult",
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        content: [{ type: "text", text: msg.content }],
        isError: msg.isError ?? false,
        timestamp: msg.timestamp,
      } satisfies PiAiToolResultMessage;
  }
}

/**
 * Convert an array of agent SendableMessages to pi-ai Messages.
 */
export function toLLMMessages(msgs: SendableMessage[]): PiAiMessage[] {
  return msgs.map(toLLMMessage);
}

/**
 * Convert a pi-ai AssistantMessage back to an agent AssistantMessage (partial, no timestamp).
 */
export function fromLLMAssistantMessage(msg: PiAiAssistantMessage): Omit<AssistantMessage, "timestamp"> {
  return { role: "assistant", content: msg.content };
}

/**
 * Extract tool calls from a pi-ai AssistantMessage's content parts.
 */
export function extractToolCalls(msg: PiAiAssistantMessage): ToolCall[] {
  return msg.content.filter((p): p is ToolCall => p.type === "toolCall");
}

/**
 * Check if a pi-ai AssistantMessage contains any tool calls.
 */
export function hasToolCalls(msg: PiAiAssistantMessage): boolean {
  return msg.content.some((p) => p.type === "toolCall");
}

/**
 * Extract text content from a pi-ai AssistantMessage, joining all text blocks.
 */
export function getTextContent(msg: PiAiAssistantMessage): string {
  return msg.content
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}
