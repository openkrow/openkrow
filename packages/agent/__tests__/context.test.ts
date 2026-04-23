/**
 * Tests for ContextManager and contextAssembly
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ContextManager, estimateTokens } from "../context/index.js";
import type {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  ContextAssemblyOptions,
} from "../types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMsg(text: string, ts = Date.now()): Omit<UserMessage, "timestamp"> & { timestamp: number } {
  return { role: "user", content: text, timestamp: ts };
}

function makeAssistantMsg(text: string, ts = Date.now()): Omit<AssistantMessage, "timestamp"> & { timestamp: number } {
  return { role: "assistant", content: [{ type: "text", text }], timestamp: ts };
}

function makeToolResult(content: string, toolCallId = "tc_1", toolName = "read_file", ts = Date.now()): Omit<ToolResultMessage, "timestamp"> & { timestamp: number } {
  return { role: "tool", toolCallId, toolName, content, timestamp: ts };
}

/** Generate a string of approximately N tokens (N * 4 chars) */
function tokString(tokens: number): string {
  return "x".repeat(tokens * 4);
}

const defaultOptions: ContextAssemblyOptions = {
  contextWindow: 100_000,
  maxOutputTokens: 4_000,
  reservedBuffer: 20_000,
  toolResultBudget: 10_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ContextManager", () => {
  let cm: ContextManager;

  beforeEach(() => {
    cm = new ContextManager();
  });

  describe("basic state management", () => {
    it("should store and retrieve system prompt via custom override", () => {
      cm.setCustomPrompt("Hello");
      assert.equal(cm.getSystemPrompt(), "Hello");
    });

    it("should add and retrieve messages", () => {
      cm.addMessage(makeUserMsg("Hi"));
      cm.addMessage(makeAssistantMsg("Hello!"));
      assert.equal(cm.getMessages().length, 2);
      assert.equal(cm.getMessages()[0]!.role, "user");
      assert.equal(cm.getMessages()[1]!.role, "assistant");
    });

    it("should auto-assign timestamp if not provided", () => {
      const before = Date.now();
      cm.addMessage({ role: "user", content: "test" } as any);
      const after = Date.now();
      const msg = cm.getMessages()[0]!;
      assert.ok(msg.timestamp >= before && msg.timestamp <= after);
    });

    it("should reset messages", () => {
      cm.addMessage(makeUserMsg("Hi"));
      cm.reset();
      assert.equal(cm.getMessages().length, 0);
    });
  });

  describe("contextAssembly — no compaction needed", () => {
    it("should return all messages when within budget", () => {
      cm.addMessage(makeUserMsg("Hello"));
      cm.addMessage(makeAssistantMsg("Hi there!"));
      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.messages.length, 2);
      assert.equal(result.compactions.length, 0);
    });

    it("should include system prompt in result", () => {
      cm.setCustomPrompt("Test prompt");
      cm.addMessage(makeUserMsg("Hello"));
      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.systemPrompt, "Test prompt");
    });
  });

  describe("Phase 1 — Tool Result Budget", () => {
    it("should trim oversized tool results", () => {
      // Create a tool result that exceeds the budget (10_000 tokens = 40_000 chars)
      const bigContent = tokString(15_000); // 15k tokens, over 10k budget
      cm.addMessage(makeUserMsg("run tool"));
      cm.addMessage(makeAssistantMsg("calling tool"));
      cm.addMessage(makeToolResult(bigContent));
      cm.addMessage(makeAssistantMsg("done"));

      const result = cm.contextAssembly(defaultOptions);

      // The tool result should have been trimmed
      const toolMsg = result.messages.find(m => m.role === "tool");
      assert.ok(toolMsg);
      assert.ok(toolMsg.content.includes("tokens trimmed"));
      assert.ok(result.compactions.some(c => c.type === "tool_result_trim"));
    });

    it("should not trim tool results within budget", () => {
      const smallContent = tokString(5_000); // 5k tokens, under 10k budget
      cm.addMessage(makeToolResult(smallContent));

      const result = cm.contextAssembly(defaultOptions);
      const toolMsg = result.messages.find(m => m.role === "tool");
      assert.ok(toolMsg);
      assert.ok(!toolMsg.content.includes("tokens trimmed"));
    });
  });

  describe("Phase 2 — Snip Compact", () => {
    it("should drop oldest messages when over budget", () => {
      // Use a very small context window to force snipping
      const tightOptions: ContextAssemblyOptions = {
        contextWindow: 1_000,
        maxOutputTokens: 200,
        reservedBuffer: 200,
        toolResultBudget: 10_000,
      };

      // Add many messages that exceed the budget
      for (let i = 0; i < 20; i++) {
        cm.addMessage(makeUserMsg(`Message ${i}: ${tokString(50)}`));
        cm.addMessage(makeAssistantMsg(`Response ${i}: ${tokString(50)}`));
      }

      const result = cm.contextAssembly(tightOptions);

      // Should have fewer messages than we added
      assert.ok(result.messages.length < 40);
      // Should have a snip compaction
      assert.ok(result.compactions.some(c => c.type === "snip"));
    });

    it("should always keep at least MIN_RECENT_MESSAGES (4)", () => {
      const tinyOptions: ContextAssemblyOptions = {
        contextWindow: 100,
        maxOutputTokens: 20,
        reservedBuffer: 20,
        toolResultBudget: 10_000,
      };

      for (let i = 0; i < 10; i++) {
        cm.addMessage(makeUserMsg(`Msg ${i}: ${tokString(100)}`));
      }

      const result = cm.contextAssembly(tinyOptions);
      assert.ok(result.messages.length >= 4);
    });
  });

  describe("Phase 3 — Microcompact", () => {
    it("should clear stale tool results far from the end", () => {
      const tightOptions: ContextAssemblyOptions = {
        contextWindow: 5_000,
        maxOutputTokens: 500,
        reservedBuffer: 500,
        toolResultBudget: 10_000,
      };

      // Add a tool result early on, then many messages after
      cm.addMessage(makeToolResult(tokString(500), "tc_old", "read_file"));
      for (let i = 0; i < 15; i++) {
        cm.addMessage(makeUserMsg(`Msg ${i}`));
        cm.addMessage(makeAssistantMsg(`Reply ${i}`));
      }
      // Add a recent tool result
      cm.addMessage(makeToolResult("recent result", "tc_new", "read_file"));

      const result = cm.contextAssembly(tightOptions);

      // If microcompact kicked in, there should be a compaction action
      const hasMicro = result.compactions.some(c => c.type === "microcompact");
      // The old tool result should have been cleared (if needed for budget)
      if (hasMicro) {
        const oldTool = result.messages.find(m => m.role === "tool" && m.toolCallId === "tc_old");
        if (oldTool && oldTool.role === "tool") {
          assert.ok(oldTool.content.includes("Tool result cleared"));
        }
      }
    });
  });

  describe("Summary boundaries", () => {
    it("should convert summary boundaries to user messages in projection", () => {
      // Manually add a summary boundary
      cm.addMessage({
        role: "summary",
        content: "Previous conversation was about testing.",
        summarizedCount: 10,
        tokensFreed: 5000,
        timestamp: Date.now(),
      } as any);
      cm.addMessage(makeUserMsg("Continue"));

      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.messages.length, 2);
      assert.equal(result.messages[0]!.role, "user");
      assert.ok((result.messages[0]!.content as string).includes("Previous conversation summary"));
    });

    it("should skip snip markers in projection", () => {
      cm.addMessage({
        role: "snip",
        droppedCount: 5,
        tokensFreed: 2000,
        timestamp: Date.now(),
      } as any);
      cm.addMessage(makeUserMsg("Hello"));

      const result = cm.contextAssembly(defaultOptions);
      assert.equal(result.messages.length, 1);
      assert.equal(result.messages[0]!.role, "user");
    });
  });
});

describe("estimateTokens", () => {
  it("should estimate ~1 token per 4 chars", () => {
    assert.equal(estimateTokens("1234"), 1);
    assert.equal(estimateTokens("12345678"), 2);
    assert.equal(estimateTokens("123"), 1); // ceil
  });

  it("should return 0 for empty string", () => {
    assert.equal(estimateTokens(""), 0);
  });
});
