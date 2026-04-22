/**
 * @openkrow/llm — Unified multi-provider LLM API
 *
 * The LLM package provides a single interface to interact with multiple
 * LLM providers (Anthropic, OpenAI, Google, xAI, Groq, DeepSeek, etc.).
 *
 * Main API:
 *   stream(model, context, options?)  → AssistantMessageEventStream
 *   complete(model, context, options?) → Promise<AssistantMessage>
 *
 * Tool definitions are passed through to providers but tool call execution
 * is the agent package's responsibility.
 */

// --- Top-level API ---
export { stream, complete, getTextContent } from "./stream.js";

// --- API Registry ---
export {
  registerApiProvider,
  getApiProvider,
  hasApiProvider,
  getRegisteredApis,
  clearApiProviders,
} from "./api-registry.js";

// --- Model Registry ---
export {
  getModel,
  getModelById,
  getModels,
  getProviders,
  getAllModels,
  calculateCost,
} from "./models.js";

// --- Env API Keys (optional fallback — prefer passing apiKey or oauthCredentials) ---
export { resolveApiKey } from "./env-api-keys.js";

// --- Credential Resolution ---
export { resolveCredentials } from "./resolve-credentials.js";
export type { ResolvedCredentials } from "./resolve-credentials.js";

// --- Event Stream ---
export { EventStream } from "./utils/event-stream.js";

// --- OAuth ---
export {
  registerOAuthProvider,
  getOAuthProvider,
  getOAuthProviderIds,
  getOAuthApiKey,
  isExpired,
  loginGitHubCopilot,
  refreshGitHubCopilotToken,
  buildCopilotHeaders,
  getGitHubCopilotBaseUrl,
  loginAnthropic,
  refreshAnthropicToken,
} from "./utils/oauth/index.js";

export type {
  OAuthCredentials,
  OAuthAuthInfo,
  OAuthPrompt,
  OAuthLoginCallbacks,
  OAuthProviderInterface,
} from "./utils/oauth/index.js";

// --- Provider registration (auto-registers on import) ---
export { registerBuiltInApiProviders } from "./providers/register-builtins.js";

// --- Provider stream functions (for direct use) ---
export { streamAnthropic } from "./providers/anthropic.js";
export { streamOpenAICompletions } from "./providers/openai.js";
export { streamGoogle } from "./providers/google.js";

// --- Types ---
export type {
  // Core
  KnownApi,
  KnownProvider,
  Model,
  LLMConfig,

  // Messages
  TextContent,
  ThinkingContent,
  ImageContent,
  ToolCallContent,
  ContentPart,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,

  // Context & Options
  Context,
  StreamOptions,
  OAuthCredentialsInput,
  ToolDefinition,

  // Events
  StreamEvent,
  TextStartEvent,
  TextDeltaEvent,
  TextEndEvent,
  ThinkingStartEvent,
  ThinkingDeltaEvent,
  ThinkingEndEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
  DoneEvent,
  ErrorEvent,

  // Usage
  Usage,

  // Provider
  ApiProvider,
  AssistantMessageEventStream,
  EnvApiKeyMap,
} from "./types.js";
