import type {
  LLMProvider,
  LLMConfig,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  StreamEvent,
  ModelInfo,
} from "./types.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { GoogleProvider } from "./providers/google.js";

/**
 * Unified LLM client that delegates to provider-specific implementations.
 */
export class LLMClient implements LLMProvider {
  readonly name: string;
  private provider: LLMProvider;

  constructor(private config: LLMConfig) {
    this.name = config.provider;
    this.provider = this.createProvider(config);
  }

  private createProvider(config: LLMConfig): LLMProvider {
    switch (config.provider) {
      case "openai":
        return new OpenAIProvider(config);
      case "anthropic":
        return new AnthropicProvider(config);
      case "google":
        return new GoogleProvider(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    return this.provider.chat(messages, options);
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent> {
    yield* this.provider.stream(messages, options);
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.provider.listModels();
  }
}

/**
 * Factory function to create a new LLM client.
 */
export function createClient(config: LLMConfig): LLMClient {
  return new LLMClient(config);
}
