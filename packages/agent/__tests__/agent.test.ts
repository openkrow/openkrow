/**
 * Tests for the Agent agentic loop (run/stream with LLM calls and tool execution).
 *
 * These tests mock the @openkrow/llm stream/complete functions to test the
 * agent's loop logic without making real API calls.
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Agent, ToolRegistry } from "../index.js";
import type { AgentConfig, Tool } from "../types/index.js";
import type {
  AssistantMessage as LLMAssistantMessage,
  StreamEvent,
} from "@openkrow/llm";
import { toLLMMessage, toLLMMessages, extractToolCalls, hasToolCalls } from "../context/convert.js";

// ---------------------------------------------------------------------------
// Conversion helper tests
// ---------------------------------------------------------------------------

describe("Message conversion", () => {
  it("should convert user message to LLM format (strip timestamp)", () => {
    const agentMsg = { role: "user" as const, content: "hello", timestamp: 123 };
    const llmMsg = toLLMMessage(agentMsg);
    assert.deepStrictEqual(llmMsg, { role: "user", content: "hello" });
    assert.strictEqual((llmMsg as any).timestamp, undefined);
  });

  it("should convert assistant message to LLM format", () => {
    const agentMsg = {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "hi" }],
      timestamp: 123,
    };
    const llmMsg = toLLMMessage(agentMsg);
    assert.deepStrictEqual(llmMsg, { role: "assistant", content: [{ type: "text", text: "hi" }] });
  });

  it("should convert tool result message to LLM format", () => {
    const agentMsg = {
      role: "tool" as const,
      toolCallId: "tc_1",
      toolName: "read_file",
      content: "file contents",
      isError: false,
      timestamp: 123,
    };
    const llmMsg = toLLMMessage(agentMsg);
    assert.deepStrictEqual(llmMsg, {
      role: "tool",
      toolCallId: "tc_1",
      content: "file contents",
      isError: false,
    });
    assert.strictEqual((llmMsg as any).toolName, undefined);
  });

  it("should convert array of messages", () => {
    const msgs = [
      { role: "user" as const, content: "hello", timestamp: 1 },
      { role: "assistant" as const, content: [{ type: "text" as const, text: "hi" }], timestamp: 2 },
    ];
    const llmMsgs = toLLMMessages(msgs);
    assert.strictEqual(llmMsgs.length, 2);
    assert.strictEqual((llmMsgs[0] as any).timestamp, undefined);
  });

  it("should extract tool calls from assistant message", () => {
    const msg: LLMAssistantMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "Let me read that file" },
        { type: "tool_call", id: "tc_1", name: "read_file", arguments: '{"path":"foo.txt"}' },
        { type: "tool_call", id: "tc_2", name: "bash", arguments: '{"cmd":"ls"}' },
      ],
    };
    const calls = extractToolCalls(msg);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].name, "read_file");
    assert.strictEqual(calls[1].name, "bash");
  });

  it("should detect tool calls", () => {
    const withTools: LLMAssistantMessage = {
      role: "assistant",
      content: [{ type: "tool_call", id: "tc_1", name: "bash", arguments: "{}" }],
    };
    const withoutTools: LLMAssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
    };
    assert.strictEqual(hasToolCalls(withTools), true);
    assert.strictEqual(hasToolCalls(withoutTools), false);
  });
});

// ---------------------------------------------------------------------------
// Agent constructor tests (no LLM calls)
// ---------------------------------------------------------------------------

describe("Agent construction", () => {
  it("should create an agent with config", () => {
    const agent = new Agent({
      name: "test-agent",
      llm: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    });
    assert.strictEqual(agent.config.name, "test-agent");
    assert.strictEqual(agent.isRunning, false);
    assert.ok(agent.tools instanceof ToolRegistry);
    assert.ok(agent.context);
  });

  it("should register tools", () => {
    const agent = new Agent({
      name: "test-agent",
      llm: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    });
    const builtinCount = agent.tools.getDefinitions().length;
    const tool: Tool = {
      definition: {
        name: "echo",
        description: "Echo input",
        parameters: { type: "object", properties: { text: { type: "string" } } },
      },
      execute: async (args) => ({ success: true, output: String(args.text) }),
    };
    agent.tools.register(tool);
    assert.strictEqual(agent.tools.has("echo"), true);
    assert.strictEqual(agent.tools.getDefinitions().length, builtinCount + 1);
  });

  it("should throw run() without llm config", async () => {
    const agent = new Agent({ name: "test-agent" });
    await assert.rejects(() => agent.run("hello"), /requires LLM config/);
  });

  it("should throw run() with unknown model", async () => {
    const agent = new Agent({
      name: "test-agent",
      llm: { provider: "anthropic", model: "nonexistent-model-xyz" },
    });
    await assert.rejects(() => agent.run("hello"), /not found in the model registry/);
  });

  it("should throw if run() called while already running", async () => {
    const agent = new Agent({
      name: "test-agent",
      llm: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    });
    // Hack: set running flag
    (agent as any)._isRunning = true;
    await assert.rejects(() => agent.run("hello"), /already running/);
  });
});

// ---------------------------------------------------------------------------
// Agent events tests
// ---------------------------------------------------------------------------

describe("Agent events", () => {
  it("should not emit done if agent never started (config error)", async () => {
    const agent = new Agent({ name: "test-agent" });
    let doneEmitted = false;
    agent.on("done", () => { doneEmitted = true; });

    try {
      await agent.run("hello");
    } catch {
      // Expected — no LLM config, error thrown before loop starts
    }
    // done should NOT fire because the agent never entered the running state
    assert.strictEqual(doneEmitted, false);
    assert.strictEqual(agent.isRunning, false);
  });
});
