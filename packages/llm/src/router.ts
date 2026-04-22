import type {
  IModelRouter,
  ModelRoutingConfig,
  ModelEndpoint,
  BackgroundTask,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  StreamEvent,
} from "./types.js";
import { LLMClient } from "./client.js";

/**
 * Background task prompts — maps each task type to a system prompt + user message builder.
 */
const BACKGROUND_PROMPTS: Record<
  BackgroundTask["type"],
  { system: string; buildUserMessage: (task: BackgroundTask) => string }
> = {
  summarize: {
    system:
      "You are a conversation summarizer. Produce a concise summary preserving key decisions, file paths mentioned, and the current task state. Output only the summary, no preamble.",
    buildUserMessage: (task) =>
      `Summarize the following conversation:\n\n${(task as { type: "summarize"; content: string }).content}`,
  },
  extract_personality: {
    system:
      "You are a user personality analyzer. Analyze conversations and extract the user's communication style, technical preferences, and notable observations. Output valid JSON matching the UserPersonality schema.",
    buildUserMessage: (task) => {
      const t = task as { type: "extract_personality"; conversations: string[] };
      return `Analyze these conversations and extract/update the user personality profile. Preserve existing observations, add new ones, resolve conflicts.\n\n${t.conversations.join("\n---\n")}`;
    },
  },
  generate_title: {
    system:
      "Generate a short, descriptive title (3-8 words) for a conversation based on the user's first message. Output only the title, nothing else.",
    buildUserMessage: (task) =>
      (task as { type: "generate_title"; firstMessage: string }).firstMessage,
  },
  generate_context: {
    system:
      "You are a project analyzer. Given a file tree and README, generate a concise project context summary including: project name, one-paragraph description, tech stack, key files, and coding conventions. Output valid JSON matching the WorkspaceContext schema.",
    buildUserMessage: (task) => {
      const t = task as { type: "generate_context"; fileTree: string; readme: string };
      return `File tree:\n${t.fileTree}\n\nREADME:\n${t.readme}`;
    },
  },
};

/**
 * ModelRouter — routes LLM requests to the appropriate provider/model
 * based on task type. Primary model for user-facing work, background
 * model for mechanical/cheap tasks.
 */
export class ModelRouter implements IModelRouter {
  private primaryClient: LLMClient;
  private backgroundClient: LLMClient;
  private routingConfig: ModelRoutingConfig;

  constructor(config: ModelRoutingConfig) {
    this.routingConfig = config;
    this.primaryClient = this.createClientFromEndpoint(config.primary);
    this.backgroundClient = this.createClientFromEndpoint(config.background);
  }

  private createClientFromEndpoint(endpoint: ModelEndpoint): LLMClient {
    return new LLMClient({
      provider: endpoint.provider,
      model: endpoint.model,
      apiKey: endpoint.apiKey,
      baseUrl: endpoint.baseUrl,
    });
  }

  /**
   * Send a chat request routed to the primary (strongest) model.
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    return this.primaryClient.chat(messages, options);
  }

  /**
   * Stream a response from the primary model.
   */
  async *stream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<StreamEvent> {
    yield* this.primaryClient.stream(messages, options);
  }

  /**
   * Execute a background task using the cheap/fast model.
   * Returns the text content of the response.
   */
  async background(task: BackgroundTask): Promise<string> {
    const prompt = BACKGROUND_PROMPTS[task.type];
    if (!prompt) {
      throw new Error(`Unknown background task type: ${task.type}`);
    }

    const messages: ChatMessage[] = [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.buildUserMessage(task) },
    ];

    const response = await this.backgroundClient.chat(messages, {
      temperature: 0,
      maxTokens: 2048,
    });

    return response.content;
  }

  /**
   * Get the current routing configuration.
   */
  getConfig(): ModelRoutingConfig {
    return { ...this.routingConfig };
  }

  /**
   * Get the underlying primary LLM client (for advanced usage).
   */
  getPrimaryClient(): LLMClient {
    return this.primaryClient;
  }

  /**
   * Get the underlying background LLM client (for advanced usage).
   */
  getBackgroundClient(): LLMClient {
    return this.backgroundClient;
  }
}

/**
 * Create a ModelRouter with default configuration.
 * Defaults to Anthropic claude-sonnet-4 for primary and claude-3.5-haiku for background.
 */
export function createRouter(config?: Partial<ModelRoutingConfig>): ModelRouter {
  const defaults: ModelRoutingConfig = {
    primary: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    background: { provider: "anthropic", model: "claude-3-5-haiku-20241022" },
  };

  return new ModelRouter({
    primary: config?.primary ?? defaults.primary,
    background: config?.background ?? defaults.background,
  });
}
