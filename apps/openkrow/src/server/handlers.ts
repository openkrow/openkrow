/**
 * Chat endpoint handlers
 */

import { Orchestrator } from "../orchestrator/index.js";
import type {
  ChatRequest,
  ChatResponse,
  ErrorResponse,
} from "./types.js";

/**
 * Handle chat request
 */
export async function handleChat(
  orchestrator: Orchestrator,
  request: ChatRequest,
  workspacePath: string
): Promise<ChatResponse> {
  // Get or create session
  let sessionId = request.sessionId;
  if (!sessionId) {
    const session = orchestrator.getOrCreateSession(workspacePath);
    sessionId = session.id;
  }

  // Get or create conversation
  let conversationId = request.conversationId;
  if (!conversationId) {
    const conversation = orchestrator.getOrCreateConversation(sessionId);
    conversationId = conversation.id;
  }

  // Build model/provider overrides from request
  const overrides = (request.provider || request.model)
    ? { provider: request.provider, model: request.model }
    : undefined;

  // Run chat
  const result = await orchestrator.chat(conversationId, request.message, overrides);

  return {
    response: result.response,
    conversationId,
    sessionId,
    messageId: result.messageId,
  };
}

/**
 * Handle streaming chat request
 */
export async function* handleStreamChat(
  orchestrator: Orchestrator,
  request: ChatRequest,
  workspacePath: string
): AsyncGenerator<string, ChatResponse, unknown> {
  // Get or create session
  let sessionId = request.sessionId;
  if (!sessionId) {
    const session = orchestrator.getOrCreateSession(workspacePath);
    sessionId = session.id;
  }

  // Get or create conversation
  let conversationId = request.conversationId;
  if (!conversationId) {
    const conversation = orchestrator.getOrCreateConversation(sessionId);
    conversationId = conversation.id;
  }

  // Build model/provider overrides from request
  const overrides = (request.provider || request.model)
    ? { provider: request.provider, model: request.model }
    : undefined;

  // Stream chat
  const generator = orchestrator.streamChat(conversationId, request.message, overrides);
  let result: { messageId: string } | undefined;

  while (true) {
    const { value, done } = await generator.next();
    if (done) {
      result = value;
      break;
    }
    yield value;
  }

  return {
    response: "", // Response was streamed
    conversationId,
    sessionId,
    messageId: result?.messageId ?? "",
  };
}

/**
 * Validate chat request
 */
export function validateChatRequest(body: unknown): {
  valid: true;
  data: ChatRequest;
} | {
  valid: false;
  error: ErrorResponse;
} {
  if (!body || typeof body !== "object") {
    return {
      valid: false,
      error: {
        error: "Invalid request body",
        code: "INVALID_BODY",
      },
    };
  }

  const data = body as Record<string, unknown>;

  if (!data.message || typeof data.message !== "string") {
    return {
      valid: false,
      error: {
        error: "Message is required and must be a string",
        code: "INVALID_MESSAGE",
      },
    };
  }

  if (data.message.trim().length === 0) {
    return {
      valid: false,
      error: {
        error: "Message cannot be empty",
        code: "EMPTY_MESSAGE",
      },
    };
  }

  return {
    valid: true,
    data: {
      message: data.message,
      conversationId: typeof data.conversationId === "string" ? data.conversationId : undefined,
      sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined,
      stream: typeof data.stream === "boolean" ? data.stream : false,
      provider: typeof data.provider === "string" ? data.provider : undefined,
      model: typeof data.model === "string" ? data.model : undefined,
    },
  };
}
