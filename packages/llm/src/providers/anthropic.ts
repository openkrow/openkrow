/**
 * Anthropic Messages API provider
 *
 * Uses raw fetch + SSE parsing instead of the SDK's streaming to have
 * full control over the event stream.
 */

import type {
  Model,
  Context,
  StreamOptions,
  AssistantMessage,
  ContentPart,
  Usage,
} from "../types.js";
import { EventStream } from "../utils/event-stream.js";
import { resolveCredentials } from "../resolve-credentials.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
}

/**
 * Convert our messages to Anthropic format
 */
function convertMessages(context: Context): {
  system?: string;
  messages: AnthropicMessage[];
} {
  let system: string | undefined = context.systemPrompt;

  const messages: AnthropicMessage[] = [];

  for (const msg of context.messages) {
    if (msg.role === "user") {
      const content = typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((p) => p.type === "text")
            .map((p) => (p as { type: "text"; text: string }).text)
            .join("\n");
      messages.push({ role: "user", content });
    } else if (msg.role === "assistant") {
      const text = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("");
      messages.push({ role: "assistant", content: text });
    } else if (msg.role === "tool") {
      // Tool results go as user messages with tool_result content blocks
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId,
            content: msg.content,
            is_error: msg.isError ?? false,
          },
        ],
      });
    }
  }

  return { system, messages };
}

/**
 * Convert tool definitions to Anthropic format
 */
function convertTools(
  tools?: Context["tools"]
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Record<string, unknown>,
  }));
}

/**
 * Parse Server-Sent Events from a ReadableStream
 */
async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) break;

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    let currentEvent = "";
    let currentData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6);
      } else if (line === "" && currentData) {
        yield { event: currentEvent, data: currentData };
        currentEvent = "";
        currentData = "";
      }
    }
  }
}

/**
 * Stream from Anthropic Messages API
 */
export function streamAnthropic(
  model: Model,
  context: Context,
  options?: StreamOptions
): EventStream {
  const stream = new EventStream();

  const { system, messages } = convertMessages(context);

  const body: Record<string, unknown> = {
    model: model.id,
    max_tokens: options?.maxTokens ?? model.maxTokens,
    stream: true,
    messages,
  };

  if (system) body.system = system;
  if (options?.temperature !== undefined) body.temperature = options.temperature;

  const tools = convertTools(context.tools);
  if (tools) body.tools = tools;

  const baseUrl = model.baseUrl ?? ANTHROPIC_API_URL;

  // Start streaming in background
  (async () => {
    try {
      const resolved = await resolveCredentials(model.provider, options);
      if (!resolved) {
        stream.error(new Error("Anthropic API key not found. Pass apiKey or oauthCredentials in options."));
        return;
      }

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": resolved.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          ...resolved.extraHeaders,
          ...options?.headers,
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        stream.error(new Error(`Anthropic API error ${response.status}: ${errorBody}`));
        return;
      }

      if (!response.body) {
        stream.error(new Error("No response body from Anthropic API"));
        return;
      }

      const reader = response.body.getReader();
      const contentParts: ContentPart[] = [];
      let currentText = "";
      let currentToolCallId = "";
      let currentToolCallName = "";
      let currentToolCallArgs = "";
      let usage: Usage | undefined;

      for await (const sse of parseSSE(reader, options?.signal)) {
        try {
          const data = JSON.parse(sse.data);

          switch (sse.event) {
            case "content_block_start": {
              if (data.content_block?.type === "text") {
                stream.push({ type: "text_start" });
                currentText = "";
              } else if (data.content_block?.type === "thinking") {
                stream.push({ type: "thinking_start" });
              } else if (data.content_block?.type === "tool_use") {
                currentToolCallId = data.content_block.id ?? "";
                currentToolCallName = data.content_block.name ?? "";
                currentToolCallArgs = "";
                stream.push({
                  type: "tool_call_start",
                  id: currentToolCallId,
                  name: currentToolCallName,
                });
              }
              break;
            }

            case "content_block_delta": {
              if (data.delta?.type === "text_delta") {
                const text = data.delta.text ?? "";
                currentText += text;
                stream.push({ type: "text_delta", text });
              } else if (data.delta?.type === "thinking_delta") {
                stream.push({ type: "thinking_delta", text: data.delta.thinking ?? "" });
              } else if (data.delta?.type === "input_json_delta") {
                const args = data.delta.partial_json ?? "";
                currentToolCallArgs += args;
                stream.push({ type: "tool_call_delta", arguments: args });
              }
              break;
            }

            case "content_block_stop": {
              // Determine what block just ended
              if (currentText) {
                contentParts.push({ type: "text", text: currentText });
                stream.push({ type: "text_end" });
                currentText = "";
              } else if (currentToolCallName) {
                contentParts.push({
                  type: "tool_call",
                  id: currentToolCallId,
                  name: currentToolCallName,
                  arguments: currentToolCallArgs,
                });
                stream.push({ type: "tool_call_end" });
                currentToolCallId = "";
                currentToolCallName = "";
                currentToolCallArgs = "";
              }
              break;
            }

            case "message_delta": {
              if (data.usage) {
                usage = {
                  inputTokens: 0,
                  outputTokens: data.usage.output_tokens ?? 0,
                  totalTokens: data.usage.output_tokens ?? 0,
                };
              }
              break;
            }

            case "message_start": {
              if (data.message?.usage) {
                const u = data.message.usage;
                usage = {
                  inputTokens: u.input_tokens ?? 0,
                  outputTokens: u.output_tokens ?? 0,
                  totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
                  cacheReadTokens: u.cache_read_input_tokens,
                  cacheWriteTokens: u.cache_creation_input_tokens,
                };
              }
              break;
            }

            case "message_stop": {
              // Handle any remaining text
              if (currentText) {
                contentParts.push({ type: "text", text: currentText });
                stream.push({ type: "text_end" });
              }
              break;
            }
          }
        } catch {
          // Skip unparseable SSE data
        }
      }

      const message: AssistantMessage = {
        role: "assistant",
        content: contentParts.length > 0 ? contentParts : [{ type: "text", text: "" }],
        usage,
      };

      stream.end(message);
    } catch (err) {
      stream.error(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return stream;
}
