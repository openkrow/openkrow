import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { MessagePart, QuestionRequest } from "../shared/types";

export type RpcSend = {
  partUpdated: (payload: { sessionId: string; messageId: string; part: MessagePart; delta?: string }) => void;
  messageComplete: (payload: { sessionId: string; messageId: string }) => void;
  sessionStatus: (payload: { sessionId: string; status: "idle" | "busy" | "retry" }) => void;
  sessionError: (payload: { sessionId: string; error: string }) => void;
  questionAsked: (payload: QuestionRequest) => void;
};

/**
 * Listens to opencode SSE events and forwards relevant ones to the webview.
 */
export class EventStream {
  private assistantMessageIds = new Set<string>();
  private client: InstanceType<typeof OpencodeClient>;
  public send: RpcSend;

  constructor(client: InstanceType<typeof OpencodeClient>, send: RpcSend) {
    this.client = client;
    this.send = send;
  }

  async start(): Promise<void> {
    try {
      const events = await this.client.event.subscribe();
      for await (const event of (events as any).stream) {
        this.handleEvent(event as any);
      }
    } catch (err: any) {
      console.error("Event stream error:", err?.message);
    }
  }

  private handleEvent(evt: any): void {
    switch (evt.type) {
      case "message.updated":
        this.onMessageUpdated(evt.properties);
        break;
      case "message.part.updated":
        this.onPartUpdated(evt.properties);
        break;
      case "session.status":
        this.onSessionStatus(evt.properties);
        break;
      case "session.error":
        this.onSessionError(evt.properties);
        break;
      case "question.asked":
        this.onQuestionAsked(evt.properties);
        break;
    }
  }

  private onMessageUpdated(props: any): void {
    const { info } = props;
    if (info.role !== "assistant") return;

    this.assistantMessageIds.add(info.id);
    if (info.time?.completed) {
      this.send.messageComplete({ sessionId: info.sessionID, messageId: info.id });
      this.assistantMessageIds.delete(info.id);
    }
  }

  private onPartUpdated(props: any): void {
    const { part, delta } = props;
    if (!part?.type) return;
    if (!this.assistantMessageIds.has(part.messageID)) return;

    let messagePart: MessagePart | null = null;
    switch (part.type) {
      case "text":
        messagePart = { id: part.id, type: "text", sessionID: part.sessionID, messageID: part.messageID, text: part.text ?? "" };
        break;
      case "reasoning":
        messagePart = { id: part.id, type: "reasoning", sessionID: part.sessionID, messageID: part.messageID, text: part.text ?? "" };
        break;
      case "tool":
        messagePart = { id: part.id, type: "tool", sessionID: part.sessionID, messageID: part.messageID, tool: part.tool, state: part.state };
        break;
      case "step-start":
        messagePart = { id: part.id, type: "step-start", sessionID: part.sessionID, messageID: part.messageID };
        break;
      case "step-finish":
        messagePart = { id: part.id, type: "step-finish", sessionID: part.sessionID, messageID: part.messageID, tokens: part.tokens };
        break;
    }

    if (messagePart) {
      this.send.partUpdated({ sessionId: part.sessionID, messageId: part.messageID, part: messagePart, delta: delta ?? undefined });
    }
  }

  private onSessionStatus(props: any): void {
    const { sessionID, status } = props;
    this.send.sessionStatus({ sessionId: sessionID, status: status.type });
  }

  private onSessionError(props: any): void {
    const { sessionID, error } = props;
    const errorMsg = error?.data?.message ?? error?.name ?? "Unknown error";
    this.send.sessionError({ sessionId: sessionID ?? "", error: errorMsg });
  }

  private onQuestionAsked(props: any): void {
    this.send.questionAsked({
      id: props.id,
      sessionID: props.sessionID,
      questions: props.questions,
    });
  }
}
