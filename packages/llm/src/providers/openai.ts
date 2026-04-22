/**
 * OpenAI Chat Completions API provider
 *
 * Also works with OpenAI-compatible APIs (xAI, Groq, DeepSeek, OpenRouter, etc.)
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
import { buildCopilotHeaders } from "../utils/oauth/github-copilot.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/**
 * Convert our messages to OpenAI format
 */
function convertMessages(context: Context): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  if (context.systemPrompt) {
    messages.push({ role: "system", content: context.systemPrompt });
  }

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
      const textParts = msg.content.filter((p) => p.type === "text");
      const toolCalls = msg.content.filter((p) => p.type === "tool_call");

      const message: OpenAIMessage = {
        role: "assistant",
        content: textParts.map((p) => (p as { type: "text"; text: string }).text).join("") || null,
      };

      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls.map((tc) => {
          const t = tc as { type: "tool_call"; id: string; name: string; arguments: string };
          return {
            id: t.id,
            type: "function" as const,
            function: { name: t.name, arguments: t.arguments },
          };
        });
      }

      messages.push(message);
    } else if (msg.role === "tool") {
      messages.push({
        role: "tool",
        content: msg.content,
        tool_call_id: msg.toolCallId,
      });
    }
  }

  return messages;
}

/**
 * Convert tool definitions to OpenAI format
 */
function convertTools(
  tools?: Context["tools"]
): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Parse SSE lines from a streaming response
 */
async function* parseSSELines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) break;

    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        if (data) yield data;
      }
    }
  }
}

/**
 * Stream from OpenAI Chat Completions API
 */
export function streamOpenAICompletions(
  model: Model,
  context: Context,
  options?: StreamOptions
): EventStream {
  const stream = new EventStream();

  const messages = convertMessages(context);

  const body: Record<string, unknown> = {
    model: model.id,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (options?.maxTokens) body.max_tokens = options.maxTokens;
  if (options?.temperature !== undefined) body.temperature = options.temperature;

  const tools = convertTools(context.tools);
  if (tools) body.tools = tools;

  const baseUrl = model.baseUrl
    ? `${model.baseUrl.replace(/\/$/, "")}/chat/completions`
    : OPENAI_API_URL;

  // Start streaming in background
  (async () => {
    try {
      const resolved = await resolveCredentials(model.provider, options);
      if (!resolved) {
        stream.error(
          new Error(`API key not found for provider "${model.provider}". Pass apiKey or oauthCredentials in options.`)
        );
        return;
      }

      // Build headers — inject Copilot-specific headers when needed
      const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.apiKey}`,
      };

      if (model.provider === "github-copilot") {
        Object.assign(requestHeaders, buildCopilotHeaders(messages));
      }

      if (resolved.extraHeaders) {
        Object.assign(requestHeaders, resolved.extraHeaders);
      }

      if (options?.headers) {
        Object.assign(requestHeaders, options.headers);
      }

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        stream.error(new Error(`OpenAI API error ${response.status}: ${errorBody}`));
        return;
      }

      if (!response.body) {
        stream.error(new Error("No response body from OpenAI API"));
        return;
      }

      const reader = response.body.getReader();
      const contentParts: ContentPart[] = [];
      let currentText = "";
      let textStarted = false;
      let usage: Usage | undefined;

      // Track tool calls by index
      const toolCallsMap: Map<number, { id: string; name: string; arguments: string }> = new Map();

      for await (const data of parseSSELines(reader, options?.signal)) {
        try {
          const chunk = JSON.parse(data);

          // Handle usage in final chunk
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens ?? 0,
              outputTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens: chunk.usage.total_tokens ?? 0,
            };
          }

          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            if (!textStarted) {
              stream.push({ type: "text_start" });
              textStarted = true;
            }
            currentText += delta.content;
            stream.push({ type: "text_delta", text: delta.content });
          }

          // Tool calls
          if (delta.tool_calls) {
            // End text if it was started
            if (textStarted && currentText) {
              contentParts.push({ type: "text", text: currentText });
              stream.push({ type: "text_end" });
              currentText = "";
              textStarted = false;
            }

            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;

              if (tc.id) {
                // New tool call
                toolCallsMap.set(idx, {
                  id: tc.id,
                  name: tc.function?.name ?? "",
                  arguments: tc.function?.arguments ?? "",
                });
                stream.push({
                  type: "tool_call_start",
                  id: tc.id,
                  name: tc.function?.name ?? "",
                });
              } else if (tc.function?.arguments) {
                // Continue existing tool call
                const existing = toolCallsMap.get(idx);
                if (existing) {
                  existing.arguments += tc.function.arguments;
                }
                stream.push({
                  type: "tool_call_delta",
                  arguments: tc.function.arguments,
                });
              }
            }
          }

          // Check for finish_reason
          const finishReason = chunk.choices?.[0]?.finish_reason;
          if (finishReason) {
            // End current text block
            if (textStarted && currentText) {
              contentParts.push({ type: "text", text: currentText });
              stream.push({ type: "text_end" });
              currentText = "";
              textStarted = false;
            }

            // End all tool calls
            for (const [, tc] of toolCallsMap) {
              contentParts.push({
                type: "tool_call",
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              });
              stream.push({ type: "tool_call_end" });
            }
          }
        } catch {
          // Skip unparseable chunks
        }
      }

      // Handle remaining text
      if (textStarted && currentText) {
        contentParts.push({ type: "text", text: currentText });
        stream.push({ type: "text_end" });
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
