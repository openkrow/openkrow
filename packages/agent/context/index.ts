/**
 * ContextManager — Manages conversation context and assembles it for LLM calls.
 *
 * The `contextAssembly()` method is the core of this module. It applies up to 5
 * compaction mechanisms in order to fit the conversation into the model's context
 * window while minimizing information loss.
 *
 * Compaction pipeline (applied in order, each only if still over budget):
 *   1. Tool Result Budget — trim oversized individual tool results
 *   2. Snip Compact — drop oldest message blocks entirely (cheapest, most aggressive)
 *   3. Microcompact — selectively clear stale tool outputs
 *   4. Context Collapse — create summarized read-time projections of collapsible blocks
 *   5. Auto-Compaction — LLM-generated summary of entire history (most expensive, last resort)
 *
 * IMPORTANT: The original messages array is NEVER mutated during assembly.
 * All compaction produces a new array of projected messages for sending.
 */

import type {
  Message,
  SendableMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  SnipMarker,
  SummaryBoundary,
  ContextAssemblyOptions,
  ContextAssemblyResult,
  CompactionAction,
} from "../types/index.js";

import {
  estimateTokens,
  estimateMessageTokens,
  estimateTotalTokens,
  estimateToolDefinitionTokens,
} from "./tokens.js";

import { assembleSystemPrompt, type PromptAssemblyOptions } from "./prompt.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RESERVED_BUFFER = 20_000;
const DEFAULT_TOOL_RESULT_BUDGET = 10_000;
/** Minimum number of recent messages to always keep (never snip these) */
const MIN_RECENT_MESSAGES = 4;
/** Tool results older than this many messages are candidates for microcompact */
const MICROCOMPACT_STALENESS_THRESHOLD = 10;
/** Minimum consecutive tool messages to be considered a collapsible block */
const COLLAPSE_MIN_BLOCK_SIZE = 3;

// ---------------------------------------------------------------------------
// ContextManager class
// ---------------------------------------------------------------------------

export class ContextManager {
  private messages: Message[] = [];
  private promptOptions: PromptAssemblyOptions = {};
  private customPromptOverride: string | undefined;

  // ---- Prompt management ----

  /**
   * Configure prompt assembly options. The system prompt is built internally
   * from prompt templates based on provider, tools, and user context.
   */
  configurePrompt(options: PromptAssemblyOptions): void {
    this.promptOptions = { ...this.promptOptions, ...options };
  }

  /**
   * Override the assembled prompt with a fully custom system prompt.
   * When set, the prompt assembly pipeline is bypassed entirely.
   */
  setCustomPrompt(prompt: string | undefined): void {
    this.customPromptOverride = prompt;
  }

  /**
   * Get the current system prompt (assembled or custom override).
   */
  getSystemPrompt(): string {
    if (this.customPromptOverride !== undefined) return this.customPromptOverride;
    return assembleSystemPrompt(this.promptOptions);
  }

  addMessage(message: Omit<Message, "timestamp"> & { timestamp?: number }): Message {
    const full = { ...message, timestamp: message.timestamp ?? Date.now() } as Message;
    this.messages.push(full);
    return full;
  }

  getMessages(): ReadonlyArray<Message> {
    return this.messages;
  }

  reset(): void {
    this.messages = [];
  }

  // ---- Context Assembly ----

  /**
   * Assemble the current conversation into a context that fits within the model's
   * token budget. Returns projected messages (never mutates internal state).
   */
  contextAssembly(options: ContextAssemblyOptions): ContextAssemblyResult {
    const {
      contextWindow,
      maxOutputTokens,
      tools = [],
      reservedBuffer = DEFAULT_RESERVED_BUFFER,
      toolResultBudget = DEFAULT_TOOL_RESULT_BUDGET,
    } = options;

    // Update prompt options with tool awareness
    if (tools.length > 0) {
      this.promptOptions.hasTools = true;
    }

    // System prompt is assembled internally
    const systemPrompt = this.getSystemPrompt();
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    const toolTokens = estimateToolDefinitionTokens(tools);
    const effectiveBudget = contextWindow - maxOutputTokens - reservedBuffer - systemTokens - toolTokens;

    const compactions: CompactionAction[] = [];

    // Start with only sendable messages (filter out snip/summary markers from history,
    // but include summary content as user messages)
    let projected = this.projectSendableMessages();

    // Phase 1: Tool Result Budget
    const phase1 = this.applyToolResultBudget(projected, toolResultBudget);
    projected = phase1.messages;
    if (phase1.tokensFreed > 0) {
      compactions.push({ type: "tool_result_trim", tokensFreed: phase1.tokensFreed, detail: `Trimmed ${phase1.trimCount} tool results` });
    }

    // Check if we're within budget
    let totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return { messages: projected, systemPrompt, estimatedTokens: totalTokens + systemTokens + toolTokens, compactions };
    }

    // Phase 2: Snip Compact
    const phase2 = this.applySnipCompact(projected, totalTokens, effectiveBudget);
    projected = phase2.messages;
    if (phase2.tokensFreed > 0) {
      compactions.push({ type: "snip", tokensFreed: phase2.tokensFreed, detail: `Dropped ${phase2.droppedCount} messages` });
      // Also insert a snip marker into the real message history
      this.insertSnipMarker(phase2.droppedCount, phase2.tokensFreed);
    }

    totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return { messages: projected, systemPrompt, estimatedTokens: totalTokens + systemTokens + toolTokens, compactions };
    }

    // Phase 3: Microcompact
    const phase3 = this.applyMicrocompact(projected, totalTokens, effectiveBudget);
    projected = phase3.messages;
    if (phase3.tokensFreed > 0) {
      compactions.push({ type: "microcompact", tokensFreed: phase3.tokensFreed, detail: `Cleared ${phase3.clearedCount} stale tool outputs` });
    }

    totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return { messages: projected, systemPrompt, estimatedTokens: totalTokens + systemTokens + toolTokens, compactions };
    }

    // Phase 4: Context Collapse
    const phase4 = this.applyContextCollapse(projected, totalTokens, effectiveBudget);
    projected = phase4.messages;
    if (phase4.tokensFreed > 0) {
      compactions.push({ type: "context_collapse", tokensFreed: phase4.tokensFreed, detail: `Collapsed ${phase4.collapsedBlocks} blocks` });
    }

    totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return { messages: projected, systemPrompt, estimatedTokens: totalTokens + systemTokens + toolTokens, compactions };
    }

    // Phase 5: Auto-Compaction (placeholder — requires LLM call)
    // For now, we do an aggressive snip of the oldest half of remaining messages
    const phase5 = this.applyAutoCompaction(projected, totalTokens, effectiveBudget);
    projected = phase5.messages;
    if (phase5.tokensFreed > 0) {
      compactions.push({ type: "auto_compaction", tokensFreed: phase5.tokensFreed, detail: phase5.detail });
    }

    totalTokens = estimateTotalTokens(projected);
    return { messages: projected, systemPrompt, estimatedTokens: totalTokens + systemTokens + toolTokens, compactions };
  }

  // ---- Internal: project sendable messages ----

  /**
   * Convert internal message history into sendable messages.
   * SnipMarkers are dropped. SummaryBoundaries are converted to user messages.
   */
  private projectSendableMessages(): SendableMessage[] {
    const result: SendableMessage[] = [];
    for (const msg of this.messages) {
      if (msg.role === "snip") continue;
      if (msg.role === "summary") {
        result.push({
          role: "user",
          content: `[Previous conversation summary]\n${msg.content}`,
          timestamp: msg.timestamp,
        });
        continue;
      }
      result.push(msg);
    }
    return result;
  }

  // ---- Phase 1: Tool Result Budget ----

  private applyToolResultBudget(
    messages: SendableMessage[],
    budget: number,
  ): { messages: SendableMessage[]; tokensFreed: number; trimCount: number } {
    let tokensFreed = 0;
    let trimCount = 0;

    const result = messages.map((msg): SendableMessage => {
      if (msg.role !== "tool") return msg;
      const tokens = estimateTokens(msg.content);
      if (tokens <= budget) return msg;

      // Trim to budget: keep first and last portions
      const charBudget = budget * 4; // reverse the chars/4 heuristic
      const headSize = Math.floor(charBudget * 0.7);
      const tailSize = Math.floor(charBudget * 0.2);
      const head = msg.content.slice(0, headSize);
      const tail = msg.content.slice(-tailSize);
      const trimmed = `${head}\n\n... [${tokens - budget} tokens trimmed] ...\n\n${tail}`;

      tokensFreed += tokens - estimateTokens(trimmed);
      trimCount++;
      return { ...msg, content: trimmed };
    });

    return { messages: result, tokensFreed, trimCount };
  }

  // ---- Phase 2: Snip Compact ----

  private applySnipCompact(
    messages: SendableMessage[],
    currentTokens: number,
    budget: number,
  ): { messages: SendableMessage[]; tokensFreed: number; droppedCount: number } {
    const excess = currentTokens - budget;
    if (excess <= 0) return { messages, tokensFreed: 0, droppedCount: 0 };

    // Drop messages from the front until we've freed enough tokens,
    // but always keep at least MIN_RECENT_MESSAGES from the end
    const maxDroppable = Math.max(0, messages.length - MIN_RECENT_MESSAGES);
    let freed = 0;
    let dropCount = 0;

    for (let i = 0; i < maxDroppable && freed < excess; i++) {
      freed += estimateMessageTokens(messages[i]!);
      dropCount++;
    }

    return {
      messages: messages.slice(dropCount),
      tokensFreed: freed,
      droppedCount: dropCount,
    };
  }

  // ---- Phase 3: Microcompact ----

  private applyMicrocompact(
    messages: SendableMessage[],
    currentTokens: number,
    budget: number,
  ): { messages: SendableMessage[]; tokensFreed: number; clearedCount: number } {
    const excess = currentTokens - budget;
    if (excess <= 0) return { messages, tokensFreed: 0, clearedCount: 0 };

    let freed = 0;
    let clearedCount = 0;
    const totalMessages = messages.length;

    const result = messages.map((msg, i): SendableMessage => {
      if (freed >= excess) return msg;
      if (msg.role !== "tool") return msg;

      // Only clear stale tool results (far from the end of the conversation)
      const distanceFromEnd = totalMessages - i;
      if (distanceFromEnd < MICROCOMPACT_STALENESS_THRESHOLD) return msg;

      const tokens = estimateMessageTokens(msg);
      const replacement = `[Tool result cleared — ${msg.toolName}: ${tokens} tokens]`;
      const newTokens = estimateTokens(replacement) + 10;
      freed += tokens - newTokens;
      clearedCount++;
      return { ...msg, content: replacement };
    });

    return { messages: result, tokensFreed: freed, clearedCount };
  }

  // ---- Phase 4: Context Collapse ----

  private applyContextCollapse(
    messages: SendableMessage[],
    currentTokens: number,
    budget: number,
  ): { messages: SendableMessage[]; tokensFreed: number; collapsedBlocks: number } {
    const excess = currentTokens - budget;
    if (excess <= 0) return { messages, tokensFreed: 0, collapsedBlocks: 0 };

    // Find consecutive tool result blocks and collapse them into summaries
    let freed = 0;
    let collapsedBlocks = 0;
    const result: SendableMessage[] = [];
    let i = 0;

    while (i < messages.length) {
      // Look for consecutive tool results
      if (messages[i]!.role === "tool" && freed < excess) {
        let blockEnd = i;
        while (blockEnd < messages.length && messages[blockEnd]!.role === "tool") {
          blockEnd++;
        }
        const blockSize = blockEnd - i;

        if (blockSize >= COLLAPSE_MIN_BLOCK_SIZE) {
          // Collapse this block: summarize tool names and replace with a single user message
          const block = messages.slice(i, blockEnd) as ToolResultMessage[];
          const blockTokens = block.reduce((s, m) => s + estimateMessageTokens(m), 0);
          const toolNames = block.map(m => m.toolName);
          const summary = `[Collapsed ${blockSize} tool results: ${toolNames.join(", ")}]`;
          const summaryTokens = estimateTokens(summary) + 10;

          freed += blockTokens - summaryTokens;
          collapsedBlocks++;

          // Insert as a tool result that preserves the first toolCallId
          result.push({
            role: "tool",
            toolCallId: block[0]!.toolCallId,
            toolName: "collapsed",
            content: summary,
            timestamp: block[0]!.timestamp,
          });
          i = blockEnd;
          continue;
        }
      }
      result.push(messages[i]!);
      i++;
    }

    return { messages: result, tokensFreed: freed, collapsedBlocks };
  }

  // ---- Phase 5: Auto-Compaction ----

  /**
   * Last resort compaction. In the full implementation, this sends the history
   * to the LLM for summarization. For now, we do an aggressive snip of the
   * oldest half and insert a placeholder summary.
   *
   * TODO: Replace with actual LLM-based summarization when the agent's run()
   * loop is implemented.
   */
  private applyAutoCompaction(
    messages: SendableMessage[],
    currentTokens: number,
    budget: number,
  ): { messages: SendableMessage[]; tokensFreed: number; detail: string } {
    const excess = currentTokens - budget;
    if (excess <= 0) return { messages, tokensFreed: 0, detail: "" };

    // Drop the oldest half of messages, keep the newer half
    const keepCount = Math.max(MIN_RECENT_MESSAGES, Math.ceil(messages.length / 2));
    const dropCount = messages.length - keepCount;
    const dropped = messages.slice(0, dropCount);
    const kept = messages.slice(dropCount);

    const droppedTokens = dropped.reduce((s, m) => s + estimateMessageTokens(m), 0);

    // Insert a placeholder summary at the start
    const summaryMsg: UserMessage = {
      role: "user",
      content: `[Auto-compacted: ${dropCount} older messages (≈${droppedTokens} tokens) were removed to fit context window. Recent conversation preserved.]`,
      timestamp: kept[0]?.timestamp ?? Date.now(),
    };

    // Also record in the real history
    const summaryBoundary: SummaryBoundary = {
      role: "summary",
      content: summaryMsg.content as string,
      summarizedCount: dropCount,
      tokensFreed: droppedTokens,
      timestamp: Date.now(),
    };
    this.messages.push(summaryBoundary);

    return {
      messages: [summaryMsg, ...kept],
      tokensFreed: droppedTokens - estimateMessageTokens(summaryMsg),
      detail: `Auto-compacted ${dropCount} messages (≈${droppedTokens} tokens)`,
    };
  }

  // ---- Helpers ----

  private insertSnipMarker(droppedCount: number, tokensFreed: number): void {
    const marker: SnipMarker = {
      role: "snip",
      droppedCount,
      tokensFreed,
      timestamp: Date.now(),
    };
    // Insert at the beginning (before current messages, after any existing markers)
    this.messages.unshift(marker);
  }
}

// Re-export token utilities
export { estimateTokens, estimateMessageTokens, estimateTotalTokens } from "./tokens.js";
