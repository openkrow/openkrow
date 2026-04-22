/**
 * @openkrow/llm - Unified multi-provider LLM API
 *
 * Provides a single interface to interact with multiple LLM providers
 * including OpenAI, Anthropic, and Google. Includes smart model routing
 * for primary (user-facing) and background (cheap/fast) tasks.
 */

export { LLMClient, createClient } from "./client.js";
export { ModelRouter, createRouter } from "./router.js";
export { OpenAIProvider } from "./providers/openai.js";
export { AnthropicProvider } from "./providers/anthropic.js";
export { GoogleProvider } from "./providers/google.js";
export type {
  LLMProvider,
  LLMConfig,
  ProviderName,
  ChatMessage,
  ChatResponse,
  ChatOptions,
  StreamEvent,
  ToolDefinition,
  ToolCall,
  ModelInfo,
  IModelRouter,
  ModelRoutingConfig,
  ModelEndpoint,
  BackgroundTask,
} from "./types.js";
