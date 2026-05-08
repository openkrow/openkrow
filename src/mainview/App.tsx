import { useState, useEffect } from "react";
import { rpc, onStreamEvent } from "./rpc";
import type { ChatMessage, MessagePart, SessionInfo, QuestionRequest } from "../shared/types";
import MessageList from "./components/MessageList";
import ChatInput from "./components/ChatInput";
import SessionHistory from "./components/SessionHistory";
import QuestionPrompt from "./components/QuestionPrompt";

type AppState = "loading" | "ready" | "error";

export default function App() {
  const [state, setState] = useState<AppState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>({ providerID: "opencode", modelID: "big-pickle" });
  const [showHistory, setShowHistory] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<QuestionRequest | null>(null);

  // Listen to streaming events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onStreamEvent("partUpdated", (payload: { sessionId: string; messageId: string; part: MessagePart; delta?: string }) => {
      const { messageId, part } = payload;

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === messageId);
        if (existing) {
          const parts = [...(existing.parts ?? [])];
          const partIdx = parts.findIndex((p) => p.id === part.id);
          if (partIdx >= 0) {
            parts[partIdx] = part;
          } else {
            parts.push(part);
          }
          const text = parts
            .filter((p) => p.type === "text")
            .map((p) => (p as any).text)
            .join("");
          return prev.map((m) => m.id === messageId ? { ...m, parts, text } : m);
        }
        const text = part.type === "text" ? (part as any).text : "";
        return [...prev, {
          id: messageId,
          role: "assistant" as const,
          text,
          createdAt: Date.now(),
          isLoading: true,
          parts: [part],
        }];
      });
    }));

    unsubs.push(onStreamEvent("messageComplete", (payload: { messageId: string }) => {
      setSending(false);
      setMessages((prev) =>
        prev.map((m) => m.id === payload.messageId ? { ...m, isLoading: false } : m)
      );
    }));

    unsubs.push(onStreamEvent("sessionStatus", (payload: { status: string }) => {
      if (payload.status === "idle") setSending(false);
    }));

    unsubs.push(onStreamEvent("sessionError", (payload: { error: string }) => {
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${payload.error}`, createdAt: Date.now() },
      ]);
    }));

    unsubs.push(onStreamEvent("questionAsked", (payload: QuestionRequest) => {
      setActiveQuestion(payload);
    }));

    return () => unsubs.forEach((fn) => fn());
  }, []);

  // Auto-initialize workspace on mount
  useEffect(() => {
    (async () => {
      try {
        const init = await rpc.request.initWorkspace({});
        if ("error" in init) {
          setState("error");
          setError(init.error);
          return;
        }
        const session = await rpc.request.createSession({});
        if ("sessionId" in session) {
          setSessionId(session.sessionId);
          if (session.history && session.history.length > 0) {
            setMessages(session.history);
          }
          setState("ready");
        } else {
          setState("error");
          setError(session.error);
        }
      } catch (err: any) {
        setState("error");
        setError(err?.message ?? String(err));
      }
    })();
  }, []);

  const handleSend = async (text: string) => {
    if (!sessionId || sending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);

    const res = await rpc.request.sendMessage({
      sessionId,
      text,
      ...(selectedModel ? { model: selectedModel } : {}),
    });
    if ("error" in res) {
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${res.error}`, createdAt: Date.now() },
      ]);
    }
  };

  const handleNewSession = async () => {
    const res = await rpc.request.newSession({});
    if ("sessionId" in res) {
      setSessionId(res.sessionId);
      setMessages([]);
    }
  };

  const handleSelectSession = async (session: SessionInfo) => {
    setShowHistory(false);
    const res = await rpc.request.loadSession({ sessionId: session.id });
    if ("sessionId" in res) {
      setSessionId(res.sessionId);
      setMessages(res.history);
    }
  };

  if (state !== "ready") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-neutral-200 font-sans gap-6">
        <h1 className="text-4xl font-light tracking-tight">Krow</h1>
        {state === "loading" && <p className="text-neutral-400 text-sm">Starting...</p>}
        {state === "error" && <p className="text-red-400 text-xs max-w-xs text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-200 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 shrink-0" style={{ paddingTop: "1.75rem" }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium">Krow</h1>
        </div>
        <div className="flex items-center gap-1">
          {/* History button */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-1.5 rounded-md hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-neutral-200"
            title="Chat history"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {/* New session button */}
          <button
            onClick={handleNewSession}
            className="p-1.5 rounded-md hover:bg-neutral-800 transition-colors text-neutral-400 hover:text-neutral-200"
            title="New chat"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <SessionHistory onSelect={handleSelectSession} onClose={() => setShowHistory(false)} currentSessionId={sessionId} />
      )}

      {/* Messages */}
      <MessageList messages={messages} sending={sending} />

      {/* Question prompt */}
      {activeQuestion && (
        <QuestionPrompt question={activeQuestion} onDismiss={() => setActiveQuestion(null)} />
      )}

      {/* Input with model selector */}
      <ChatInput onSend={handleSend} disabled={sending || !!activeQuestion} onModelChange={setSelectedModel} />
    </div>
  );
}
