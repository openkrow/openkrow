import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  StreamEvent,
  ModelInfo,
} from "../types.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private model: string;

  constructor(config: LLMConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
      baseURL: config.baseUrl,
    });
    this.model = config.model;
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: options?.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool["input_schema"],
      })),
      temperature: options?.temperature,
    });

    const textContent = response.content.find((c) => c.type === "text");
    const toolUseBlocks = response.content.filter(
      (c) => c.type === "tool_use"
    );

    return {
      id: response.id,
      content: textContent?.type === "text" ? textContent.text : "",
      role: "assistant",
      toolCalls: toolUseBlocks
        .filter((tc): tc is Anthropic.ToolUseBlock => tc.type === "tool_use")
        .map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        })),
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason:
        response.stop_reason === "tool_use" ? "tool_calls" : "stop",
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent> {
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options?.maxTokens ?? 4096,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: options?.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool["input_schema"],
      })),
      temperature: options?.temperature,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text_delta", delta: event.delta.text };
      }
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "input_json_delta"
      ) {
        yield {
          type: "tool_call_delta",
          toolCall: { arguments: event.delta.partial_json },
        };
      }
    }

    yield { type: "done" };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "claude-sonnet-4-20250514",
        provider: "anthropic",
        contextWindow: 200000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "claude-opus-4-20250514",
        provider: "anthropic",
        contextWindow: 200000,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "claude-3-5-haiku-20241022",
        provider: "anthropic",
        contextWindow: 200000,
        supportsTools: true,
        supportsStreaming: true,
      },
    ];
  }
}
