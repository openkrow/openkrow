import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  StreamEvent,
  ModelInfo,
} from "../types.js";

export class GoogleProvider implements LLMProvider {
  readonly name = "google";
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor(config: LLMConfig) {
    const apiKey = config.apiKey ?? process.env.GOOGLE_API_KEY ?? "";
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = config.model;
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const systemMessage = messages.find((m) => m.role === "system");
    const history = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const lastMessage = history.pop();
    if (!lastMessage) {
      throw new Error("No messages provided");
    }

    const chat = model.startChat({
      history,
      systemInstruction: systemMessage
        ? { role: "system", parts: [{ text: systemMessage.content }] }
        : undefined,
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
      },
    });

    const result = await chat.sendMessage(lastMessage.parts);
    const response = result.response;

    return {
      id: `google-${Date.now()}`,
      content: response.text(),
      role: "assistant",
      toolCalls: undefined, // TODO: implement tool calls for Google
      usage: response.usageMetadata
        ? {
            promptTokens: response.usageMetadata.promptTokenCount ?? 0,
            completionTokens:
              response.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined,
      finishReason: "stop",
    };
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent> {
    const model = this.genAI.getGenerativeModel({ model: this.model });

    const systemMessage = messages.find((m) => m.role === "system");
    const history = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const lastMessage = history.pop();
    if (!lastMessage) {
      throw new Error("No messages provided");
    }

    const chat = model.startChat({
      history,
      systemInstruction: systemMessage
        ? { role: "system", parts: [{ text: systemMessage.content }] }
        : undefined,
      generationConfig: {
        temperature: options?.temperature,
        maxOutputTokens: options?.maxTokens,
      },
    });

    const result = await chat.sendMessageStream(lastMessage.parts);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield { type: "text_delta", delta: text };
      }
    }

    yield { type: "done" };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: "gemini-2.0-flash",
        provider: "google",
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
      },
      {
        id: "gemini-2.0-pro",
        provider: "google",
        contextWindow: 1048576,
        supportsTools: true,
        supportsStreaming: true,
      },
    ];
  }
}
