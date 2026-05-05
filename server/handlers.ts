/**
 * Chat endpoint handlers
 */

import type { Orchestrator } from "../orchestrator/index.js";
import type { StreamEvent } from "../agent/index.js";
import type {
  ChatRequest,
  ChatResponse,
  ErrorResponse,
} from "./types.js";

/**
 * Handle chat request (non-streaming)
 */
export async function handleChat(
  orchestrator: Orchestrator,
  request: ChatRequest,
): Promise<ChatResponse> {
  const overrides = (request.provider || request.model)
    ? { provider: request.provider, model: request.model }
    : undefined;

  const result = await orchestrator.chat(request.message, overrides);

  return {
    response: result.response,
    messageId: result.messageId,
  };
}

/**
 * Handle streaming chat request
 */
export async function* handleStreamChat(
  orchestrator: Orchestrator,
  request: ChatRequest,
): AsyncGenerator<StreamEvent, ChatResponse, unknown> {
  const overrides = (request.provider || request.model)
    ? { provider: request.provider, model: request.model }
    : undefined;

  const generator = orchestrator.streamChat(request.message, overrides);
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
    response: "",
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
      stream: typeof data.stream === "boolean" ? data.stream : false,
      provider: typeof data.provider === "string" ? data.provider : undefined,
      model: typeof data.model === "string" ? data.model : undefined,
    },
  };
}
