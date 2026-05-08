/**
 * Krow RPC Schema — defines typed communication between bun process and webview.
 */

// Part types matching opencode SDK event definitions
export type TextPart = {
  id: string;
  type: "text";
  sessionID: string;
  messageID: string;
  text: string;
};

export type ReasoningPart = {
  id: string;
  type: "reasoning";
  sessionID: string;
  messageID: string;
  text: string;
};

export type ToolPartState =
  | { status: "pending"; input: Record<string, unknown> }
  | { status: "running"; input: Record<string, unknown>; title?: string; time: { start: number } }
  | { status: "completed"; input: Record<string, unknown>; output: string; title: string; time: { start: number; end: number } }
  | { status: "error"; input: Record<string, unknown>; error: string; time: { start: number; end: number } };

export type ToolPart = {
  id: string;
  type: "tool";
  sessionID: string;
  messageID: string;
  tool: string;
  state: ToolPartState;
};

export type StepStartPart = {
  id: string;
  type: "step-start";
  sessionID: string;
  messageID: string;
};

export type StepFinishPart = {
  id: string;
  type: "step-finish";
  sessionID: string;
  messageID: string;
  tokens: { input: number; output: number; reasoning: number };
};

export type MessagePart = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  isLoading?: boolean;
  parts?: MessagePart[];
};

export type ModelInfo = {
  id: string;
  name: string;
  providerID: string;
  providerName: string;
};

export type SessionInfo = {
  id: string;
  title: string;
  updatedAt: number;
};

export type QuestionOption = {
  label: string;
  description: string;
};

export type QuestionInfo = {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
};

export type QuestionRequest = {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
};

export type KrowRPCSchema = {
  bun: {
    requests: {
      initWorkspace: {
        params: {};
        response: { path: string } | { error: string };
      };
      createSession: {
        params: {};
        response: { sessionId: string; history: ChatMessage[] } | { error: string };
      };
      newSession: {
        params: {};
        response: { sessionId: string } | { error: string };
      };
      listSessions: {
        params: {};
        response: { sessions: SessionInfo[] } | { error: string };
      };
      loadSession: {
        params: { sessionId: string };
        response: { sessionId: string; history: ChatMessage[] } | { error: string };
      };
      sendMessage: {
        params: { sessionId: string; text: string; model?: { providerID: string; modelID: string } };
        response: { success: boolean } | { error: string };
      };
      getProviders: {
        params: {};
        response: { models: ModelInfo[]; currentModel: string | null } | { error: string };
      };
      replyQuestion: {
        params: { requestId: string; answers: string[][] };
        response: { success: boolean } | { error: string };
      };
      rejectQuestion: {
        params: { requestId: string };
        response: { success: boolean } | { error: string };
      };
    };
    messages: {};
  };
  webview: {
    requests: {};
    messages: {
      workspaceReady: { path: string };
      workspaceError: { error: string };
      partUpdated: { sessionId: string; messageId: string; part: MessagePart; delta?: string };
      messageComplete: { sessionId: string; messageId: string };
      sessionStatus: { sessionId: string; status: "idle" | "busy" | "retry" };
      sessionError: { sessionId: string; error: string };
      questionAsked: QuestionRequest;
    };
  };
};
