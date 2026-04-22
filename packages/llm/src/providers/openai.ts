import OpenAI from "openai";
import type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  StreamEvent,
  ModelInfo,
} from "../types.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: config.baseUrl,
    });
    this.model = config.model;
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      tools: options?.tools?.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
    });

    const choice = response.choices[0];
    return {
      id: response.id,
      content: choice.message.content ?? "",
      role: "assistant",
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
      finishReason:
        choice.finish_reason === "tool_calls" ? "tool_calls" : "stop",
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      tools: options?.tools?.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      temperature: options?.temperature,
      max_tokens: options?.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { type: "text_delta", delta: delta.content };
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield {
            type: "tool_call_delta",
            toolCall: {
              id: tc.id,
              name: tc.function?.name,
              arguments: tc.function?.arguments,
            },
          };
        }
      }
    }

    yield { type: "done" };
  }

  async listModels(): Promise<ModelInfo[]> {
    const models = await this.client.models.list();
    return models.data.map((m) => ({
      id: m.id,
      provider: "openai",
      contextWindow: 128000, // Default, varies by model
      supportsTools: true,
      supportsStreaming: true,
    }));
  }
}
