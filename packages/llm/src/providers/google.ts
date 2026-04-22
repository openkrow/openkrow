/**
 * Google Generative AI provider
 *
 * Uses raw fetch + SSE for streaming to avoid SDK dependency issues.
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

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiContent {
  role: "user" | "model";
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }>;
}

/**
 * Convert our messages to Gemini format
 */
function convertMessages(context: Context): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
} {
  const systemInstruction = context.systemPrompt
    ? { parts: [{ text: context.systemPrompt }] }
    : undefined;

  const contents: GeminiContent[] = [];

  for (const msg of context.messages) {
    if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : msg.content
            .filter((p) => p.type === "text")
            .map((p) => (p as { type: "text"; text: string }).text)
            .join("\n");
      contents.push({ role: "user", parts: [{ text }] });
    } else if (msg.role === "assistant") {
      const text = msg.content
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join("");
      if (text) {
        contents.push({ role: "model", parts: [{ text }] });
      }
    } else if (msg.role === "tool") {
      // Tool results as user messages for Gemini
      contents.push({
        role: "user",
        parts: [{ text: `Tool result for ${msg.toolCallId}: ${msg.content}` }],
      });
    }
  }

  return { systemInstruction, contents };
}

/**
 * Convert tool definitions to Gemini format
 */
function convertTools(
  tools?: Context["tools"]
): Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }> }> | undefined {
  if (!tools || tools.length === 0) return undefined;

  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

/**
 * Stream from Google Generative AI API
 */
export function streamGoogle(
  model: Model,
  context: Context,
  options?: StreamOptions
): EventStream {
  const stream = new EventStream();

  const { systemInstruction, contents } = convertMessages(context);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens ?? model.maxTokens,
    },
  };

  if (systemInstruction) body.systemInstruction = systemInstruction;

  const tools = convertTools(context.tools);
  if (tools) body.tools = tools;

  // Start streaming in background
  (async () => {
    try {
      const resolved = await resolveCredentials(model.provider, options);
      if (!resolved) {
        stream.error(new Error("Google API key not found. Pass apiKey or oauthCredentials in options."));
        return;
      }

      const url = `${GEMINI_API_URL}/${model.id}:streamGenerateContent?key=${resolved.apiKey}&alt=sse`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...resolved.extraHeaders,
          ...options?.headers,
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        stream.error(new Error(`Google API error ${response.status}: ${errorBody}`));
        return;
      }

      if (!response.body) {
        stream.error(new Error("No response body from Google API"));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const contentParts: ContentPart[] = [];
      let currentText = "";
      let textStarted = false;
      let usage: Usage | undefined;

      while (true) {
        if (options?.signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const chunk = JSON.parse(data);

            // Extract usage
            if (chunk.usageMetadata) {
              usage = {
                inputTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                outputTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
              };
            }

            const parts = chunk.candidates?.[0]?.content?.parts;
            if (!parts) continue;

            for (const part of parts) {
              if (part.text) {
                if (!textStarted) {
                  stream.push({ type: "text_start" });
                  textStarted = true;
                }
                currentText += part.text;
                stream.push({ type: "text_delta", text: part.text });
              } else if (part.functionCall) {
                // End text if started
                if (textStarted && currentText) {
                  contentParts.push({ type: "text", text: currentText });
                  stream.push({ type: "text_end" });
                  currentText = "";
                  textStarted = false;
                }

                const toolCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const args = JSON.stringify(part.functionCall.args ?? {});

                stream.push({
                  type: "tool_call_start",
                  id: toolCallId,
                  name: part.functionCall.name,
                });
                stream.push({
                  type: "tool_call_delta",
                  arguments: args,
                });
                stream.push({ type: "tool_call_end" });

                contentParts.push({
                  type: "tool_call",
                  id: toolCallId,
                  name: part.functionCall.name,
                  arguments: args,
                });
              }
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      }

      // End remaining text
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
