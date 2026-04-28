/**
 * ContextManager — Manages conversation context and assembles it for LLM calls.
 *
 * When a DatabaseClient + conversationId are provided, messages are persisted
 * to the database on addMessage() and loaded from the database during
 * contextAssembly(). This makes the ContextManager the single source of truth
 * for conversation state.
 *
 * The `contextAssembly()` method applies up to 5 compaction mechanisms in order
 * to fit the conversation into the model's context window. Each phase only
 * runs if the context is still over budget after the previous phase:
 *   1. Tool Result Budget — trim oversized individual tool results
 *   2. Snip Compact — drop oldest message blocks entirely
 *   3. Microcompact — selectively clear stale tool outputs
 *   4. Context Collapse — summarize collapsible blocks at read time
 *   5. Auto-Compaction — LLM-generated summary of older messages
 *
 * IMPORTANT: The original messages are NEVER mutated during assembly.
 */

import type { TextContent, ThinkingContent, ToolCall } from "@mariozechner/pi-ai";
import type { AssistantContentPart } from "../types/index.js";
import type { WorkspaceDatabaseClient } from "@openkrow/database";
import type { Message as DbMessage } from "@openkrow/database";

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
  SummarizerFn,
} from "../types/index.js";

import {
  estimateTokens,
  estimateMessageTokens,
  estimateTotalTokens,
  estimateToolDefinitionTokens,
} from "./tokens.js";

import { assembleSystemPrompt, type PromptAssemblyOptions } from "./prompt.js";
import type { WorkspaceManager } from "@openkrow/workspace";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_RESERVED_BUFFER = 20_000;
const DEFAULT_TOOL_RESULT_BUDGET = 10_000;
const MIN_RECENT_MESSAGES = 4;
const MICROCOMPACT_STALENESS_THRESHOLD = 10;
const COLLAPSE_MIN_BLOCK_SIZE = 3;

// ---------------------------------------------------------------------------
// ContextManager class
// ---------------------------------------------------------------------------

export interface ContextManagerOptions {
  database?: WorkspaceDatabaseClient;
  conversationId?: string;
  /** Optional summarizer for Phase 5 auto-compaction. Set via `setSummarizer()`. */
  summarizer?: SummarizerFn;
  /** Optional WorkspaceManager — context.md is injected into the system prompt */
  workspace?: WorkspaceManager;
}

export class ContextManager {
  private messages: Message[] = [];
  private promptOptions: PromptAssemblyOptions = {};
  private customPromptOverride: string | undefined;
  private database: WorkspaceDatabaseClient | undefined;
  private conversationId: string | undefined;
  private summarizer: SummarizerFn | undefined;
  private workspace: WorkspaceManager | undefined;

  constructor(options?: ContextManagerOptions) {
    this.database = options?.database;
    this.conversationId = options?.conversationId;
    this.summarizer = options?.summarizer;
    this.workspace = options?.workspace;
  }

  // ---- Persistence configuration ----

  /**
   * Set or update the database client and conversation ID.
   */
  configure(options: ContextManagerOptions): void {
    if (options.database !== undefined) this.database = options.database;
    if (options.conversationId !== undefined) this.conversationId = options.conversationId;
    if (options.summarizer !== undefined) this.summarizer = options.summarizer;
    if (options.workspace !== undefined) this.workspace = options.workspace;
  }

  get isPersistedMode(): boolean {
    return this.database !== undefined && this.conversationId !== undefined;
  }

  // ---- Summarizer ----

  /**
   * Set the summarizer function used by Phase 5 (Auto-Compaction).
   * The Agent sets this to an LLM-powered summarizer.
   */
  setSummarizer(fn: SummarizerFn | undefined): void {
    this.summarizer = fn;
  }

  // ---- Workspace ----

  /**
   * Set or replace the WorkspaceManager. Its context.md content will be
   * refreshed and appended to the system prompt on every LLM call.
   */
  setWorkspace(workspace: WorkspaceManager | undefined): void {
    this.workspace = workspace;
  }

  // ---- Prompt management ----

  configurePrompt(options: PromptAssemblyOptions): void {
    this.promptOptions = { ...this.promptOptions, ...options };
  }

  setCustomPrompt(prompt: string | undefined): void {
    this.customPromptOverride = prompt;
  }

  getSystemPrompt(): string {
    if (this.customPromptOverride !== undefined) return this.customPromptOverride;

    // Refresh workspace context from disk before each assembly
    const opts = { ...this.promptOptions };
    if (this.workspace?.isLoaded()) {
      this.workspace.refreshContext();
      const ctx = this.workspace.getContext();
      if (ctx) {
        opts.workspaceContext = ctx.contextMd;
        opts.workspacePath = ctx.path;
      }
    }

    return assembleSystemPrompt(opts);
  }

  // ---- Message management ----

  /**
   * Add a message to the conversation. When a database is configured,
   * the message is persisted automatically.
   */
  addMessage(message: Omit<Message, "timestamp"> & { timestamp?: number }): Message {
    const full = { ...message, timestamp: message.timestamp ?? Date.now() } as Message;
    this.messages.push(full);

    if (this.isPersistedMode) {
      this.persistMessage(full);
    }

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
   * Assemble the current conversation into a context that fits within the
   * model's token budget.
   *
   * Each compaction phase only runs if the context is still over budget.
   * Phase 5 uses an LLM-based summarizer when available.
   *
   * When a database is configured, messages are loaded from the database
   * first to ensure we have the complete conversation history.
   */
  async contextAssembly(options: ContextAssemblyOptions): Promise<ContextAssemblyResult> {
    const {
      contextWindow,
      maxOutputTokens,
      tools = [],
      reservedBuffer = DEFAULT_RESERVED_BUFFER,
      toolResultBudget = DEFAULT_TOOL_RESULT_BUDGET,
    } = options;

    // Load messages from database if configured
    if (this.isPersistedMode) {
      this.loadMessagesFromDatabase();
    }

    if (tools.length > 0) {
      this.promptOptions.hasTools = true;
    }

    const systemPrompt = this.getSystemPrompt();
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0;
    const toolTokens = estimateToolDefinitionTokens(tools);
    const effectiveBudget = contextWindow - maxOutputTokens - reservedBuffer - systemTokens - toolTokens;

    const compactions: CompactionAction[] = [];
    let projected = this.projectSendableMessages();

    // Helper: check if we're within budget and return early if so
    const makeResult = (msgs: SendableMessage[]): ContextAssemblyResult => {
      const totalTokens = estimateTotalTokens(msgs);
      return {
        messages: msgs,
        systemPrompt,
        estimatedTokens: totalTokens + systemTokens + toolTokens,
        compactions,
      };
    };

    let totalTokens = estimateTotalTokens(projected);

    // Already within budget — no compaction needed
    if (totalTokens <= effectiveBudget) {
      return makeResult(projected);
    }

    // Phase 1: Tool Result Budget — only if over budget
    const phase1 = this.applyToolResultBudget(projected, toolResultBudget);
    projected = phase1.messages;
    if (phase1.tokensFreed > 0) {
      compactions.push({ type: "tool_result_trim", tokensFreed: phase1.tokensFreed, detail: `Trimmed ${phase1.trimCount} tool results` });
    }

    totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return makeResult(projected);
    }

    // Phase 2: Snip Compact — only if still over budget
    const phase2 = this.applySnipCompact(projected, totalTokens, effectiveBudget);
    projected = phase2.messages;
    if (phase2.tokensFreed > 0) {
      compactions.push({ type: "snip", tokensFreed: phase2.tokensFreed, detail: `Dropped ${phase2.droppedCount} messages` });
      this.insertSnipMarker(phase2.droppedCount, phase2.tokensFreed);
    }

    totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return makeResult(projected);
    }

    // Phase 3: Microcompact — only if still over budget
    const phase3 = this.applyMicrocompact(projected, totalTokens, effectiveBudget);
    projected = phase3.messages;
    if (phase3.tokensFreed > 0) {
      compactions.push({ type: "microcompact", tokensFreed: phase3.tokensFreed, detail: `Cleared ${phase3.clearedCount} stale tool outputs` });
    }

    totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return makeResult(projected);
    }

    // Phase 4: Context Collapse — only if still over budget
    const phase4 = this.applyContextCollapse(projected, totalTokens, effectiveBudget);
    projected = phase4.messages;
    if (phase4.tokensFreed > 0) {
      compactions.push({ type: "context_collapse", tokensFreed: phase4.tokensFreed, detail: `Collapsed ${phase4.collapsedBlocks} blocks` });
    }

    totalTokens = estimateTotalTokens(projected);
    if (totalTokens <= effectiveBudget) {
      return makeResult(projected);
    }

    // Phase 5: Auto-Compaction — LLM-based summarization (only if still over budget)
    const phase5 = await this.applyAutoCompaction(projected, totalTokens, effectiveBudget);
    projected = phase5.messages;
    if (phase5.tokensFreed > 0) {
      compactions.push({ type: "auto_compaction", tokensFreed: phase5.tokensFreed, detail: phase5.detail });
    }

    return makeResult(projected);
  }

  // ---- Database persistence ----

  /**
   * Persist a single agent message to the database.
   */
  private persistMessage(msg: Message): void {
    const db = this.database!;
    const conversationId = this.conversationId!;

    switch (msg.role) {
      case "user": {
        const content = typeof msg.content === "string"
          ? msg.content
          : msg.content.map(p => p.type === "text" ? p.text : `[${p.type}]`).join("\n");
        db.messages.create({
          conversation_id: conversationId,
          role: "user",
          content,
        });
        break;
      }
      case "assistant": {
        const textParts = msg.content.filter(p => p.type === "text");
        const textContent = textParts.map(p => (p as { type: "text"; text: string }).text).join("\n");
        const toolCallParts = msg.content.filter(p => p.type === "toolCall");
        db.messages.create({
          conversation_id: conversationId,
          role: "assistant",
          content: textContent,
          tool_calls: toolCallParts.length > 0
            ? toolCallParts.map(p => {
                const tc = p as { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> };
                return { id: tc.id, name: tc.name, arguments: JSON.stringify(tc.arguments) };
              })
            : undefined,
        });
        break;
      }
      case "tool": {
        db.messages.create({
          conversation_id: conversationId,
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId,
          tool_name: msg.toolName,
          is_error: msg.isError,
        });
        break;
      }
      case "snip": {
        db.messages.create({
          conversation_id: conversationId,
          role: "snip",
          content: "",
          metadata: { droppedCount: msg.droppedCount, tokensFreed: msg.tokensFreed },
        });
        break;
      }
      case "summary": {
        db.messages.create({
          conversation_id: conversationId,
          role: "summary",
          content: msg.content,
          metadata: { summarizedCount: msg.summarizedCount, tokensFreed: msg.tokensFreed },
        });
        break;
      }
    }
  }

  /**
   * Load all messages from the database for the current conversation
   * and replace the in-memory messages array.
   */
  private loadMessagesFromDatabase(): void {
    const db = this.database!;
    const conversationId = this.conversationId!;

    const dbMessages = db.messages.findByConversationId(conversationId);
    this.messages = dbMessages.map(row => this.dbRowToAgentMessage(row));
  }

  /**
   * Convert a database Message row to an agent Message.
   */
  private dbRowToAgentMessage(row: DbMessage): Message {
    const timestamp = new Date(row.created_at).getTime();

    switch (row.role) {
      case "user":
        return { role: "user", content: row.content, timestamp } satisfies UserMessage;

      case "assistant": {
        const parts: AssistantContentPart[] = [];
        if (row.content) {
          parts.push({ type: "text", text: row.content });
        }
        if (row.tool_calls) {
          try {
            const calls = JSON.parse(row.tool_calls) as Array<{ id: string; name: string; arguments: string }>;
            for (const tc of calls) {
              parts.push({ type: "toolCall", id: tc.id, name: tc.name, arguments: JSON.parse(tc.arguments) });
            }
          } catch {
            // Ignore malformed tool_calls
          }
        }
        return { role: "assistant", content: parts, timestamp } satisfies AssistantMessage;
      }

      case "tool":
        return {
          role: "tool",
          toolCallId: row.tool_call_id ?? "",
          toolName: row.tool_name ?? "unknown",
          content: row.content,
          isError: row.is_error === 1,
          timestamp,
        } satisfies ToolResultMessage;

      case "snip": {
        const meta = row.metadata ? JSON.parse(row.metadata) as { droppedCount: number; tokensFreed: number } : { droppedCount: 0, tokensFreed: 0 };
        return {
          role: "snip",
          droppedCount: meta.droppedCount,
          tokensFreed: meta.tokensFreed,
          timestamp,
        } satisfies SnipMarker;
      }

      case "summary": {
        const meta = row.metadata ? JSON.parse(row.metadata) as { summarizedCount: number; tokensFreed: number } : { summarizedCount: 0, tokensFreed: 0 };
        return {
          role: "summary",
          content: row.content,
          summarizedCount: meta.summarizedCount,
          tokensFreed: meta.tokensFreed,
          timestamp,
        } satisfies SummaryBoundary;
      }

      case "system":
        return { role: "user", content: row.content, timestamp } satisfies UserMessage;

      default:
        return { role: "user", content: row.content, timestamp } satisfies UserMessage;
    }
  }

  // ---- Internal: project sendable messages ----

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

      const charBudget = budget * 4;
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

    let freed = 0;
    let collapsedBlocks = 0;
    const result: SendableMessage[] = [];
    let i = 0;

    while (i < messages.length) {
      if (messages[i]!.role === "tool" && freed < excess) {
        let blockEnd = i;
        while (blockEnd < messages.length && messages[blockEnd]!.role === "tool") {
          blockEnd++;
        }
        const blockSize = blockEnd - i;

        if (blockSize >= COLLAPSE_MIN_BLOCK_SIZE) {
          const block = messages.slice(i, blockEnd) as ToolResultMessage[];
          const blockTokens = block.reduce((s, m) => s + estimateMessageTokens(m), 0);
          const toolNames = block.map(m => m.toolName);
          const summary = `[Collapsed ${blockSize} tool results: ${toolNames.join(", ")}]`;
          const summaryTokens = estimateTokens(summary) + 10;

          freed += blockTokens - summaryTokens;
          collapsedBlocks++;

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

  // ---- Phase 5: Auto-Compaction (LLM-based summarization) ----

  /**
   * Last-resort compaction. Selects the oldest half of messages to summarize.
   *
   * When a `summarizer` callback is configured, calls the LLM to produce a
   * condensed summary of the older messages. When no summarizer is available,
   * falls back to a simple placeholder summary (message metadata only).
   */
  private async applyAutoCompaction(
    messages: SendableMessage[],
    currentTokens: number,
    budget: number,
  ): Promise<{ messages: SendableMessage[]; tokensFreed: number; detail: string }> {
    const excess = currentTokens - budget;
    if (excess <= 0) return { messages, tokensFreed: 0, detail: "" };

    // Select messages to summarize: keep at least MIN_RECENT_MESSAGES
    const keepCount = Math.max(MIN_RECENT_MESSAGES, Math.ceil(messages.length / 2));
    const dropCount = messages.length - keepCount;

    if (dropCount <= 0) {
      return { messages, tokensFreed: 0, detail: "Nothing to compact" };
    }

    const toSummarize = messages.slice(0, dropCount);
    const kept = messages.slice(dropCount);
    const droppedTokens = toSummarize.reduce((s, m) => s + estimateMessageTokens(m), 0);

    // Generate summary text
    let summaryText: string;

    if (this.summarizer) {
      // Use LLM-based summarization
      try {
        summaryText = await this.summarizer(toSummarize);
      } catch (err) {
        // Fallback to placeholder if summarization fails
        summaryText = this.buildFallbackSummary(toSummarize, droppedTokens);
      }
    } else {
      // No summarizer configured — use placeholder
      summaryText = this.buildFallbackSummary(toSummarize, droppedTokens);
    }

    // Create the summary boundary (persisted to conversation history)
    const summaryBoundary: SummaryBoundary = {
      role: "summary",
      content: summaryText,
      summarizedCount: dropCount,
      tokensFreed: droppedTokens,
      timestamp: Date.now(),
    };
    this.messages.push(summaryBoundary);

    if (this.isPersistedMode) {
      this.persistMessage(summaryBoundary);
    }

    // Project the summary as a user message for the LLM
    const summaryMsg: UserMessage = {
      role: "user",
      content: `[Previous conversation summary]\n${summaryText}`,
      timestamp: summaryBoundary.timestamp,
    };

    return {
      messages: [summaryMsg, ...kept],
      tokensFreed: droppedTokens - estimateMessageTokens(summaryMsg),
      detail: this.summarizer
        ? `LLM-summarized ${dropCount} messages (≈${droppedTokens} tokens)`
        : `Fallback-compacted ${dropCount} messages (≈${droppedTokens} tokens)`,
    };
  }

  /**
   * Build a fallback summary when no LLM summarizer is available.
   * Extracts key metadata from the messages being dropped.
   */
  private buildFallbackSummary(messages: SendableMessage[], totalTokens: number): string {
    const userMsgs = messages.filter(m => m.role === "user");
    const assistantMsgs = messages.filter(m => m.role === "assistant");
    const toolMsgs = messages.filter(m => m.role === "tool") as ToolResultMessage[];

    const parts: string[] = [];
    parts.push(`${messages.length} older messages (≈${totalTokens} tokens) were summarized.`);

    if (userMsgs.length > 0) {
      parts.push(`User sent ${userMsgs.length} message(s).`);
      // Include first user message as context hint
      const firstContent = typeof userMsgs[0]!.content === "string"
        ? userMsgs[0]!.content
        : "[complex content]";
      if (firstContent.length <= 200) {
        parts.push(`First user message: "${firstContent}"`);
      } else {
        parts.push(`First user message: "${firstContent.slice(0, 200)}..."`);
      }
    }

    if (assistantMsgs.length > 0) {
      parts.push(`Assistant responded ${assistantMsgs.length} time(s).`);
    }

    if (toolMsgs.length > 0) {
      const toolNames = [...new Set(toolMsgs.map(m => m.toolName))];
      parts.push(`Tools used: ${toolNames.join(", ")} (${toolMsgs.length} call(s)).`);
    }

    return parts.join(" ");
  }

  // ---- Helpers ----

  private insertSnipMarker(droppedCount: number, tokensFreed: number): void {
    const marker: SnipMarker = {
      role: "snip",
      droppedCount,
      tokensFreed,
      timestamp: Date.now(),
    };
    this.messages.unshift(marker);

    if (this.isPersistedMode) {
      this.persistMessage(marker);
    }
  }
}

// Re-export token utilities
export { estimateTokens, estimateMessageTokens, estimateTotalTokens } from "./tokens.js";
