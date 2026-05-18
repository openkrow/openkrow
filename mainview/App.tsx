import { useState, useEffect, useRef } from "react";
import { rpc, onStreamEvent } from "./rpc";
import type { ChatMessage, MessagePart, SessionInfo, QuestionRequest, AgentInfo } from "../shared/types";
import MessageList from "../components/MessageList";
import ChatInput from "../components/ChatInput";
import Sidebar from "../components/Sidebar";
import QuestionPrompt from "../components/QuestionPrompt";
import ThemeToggle from "../components/ThemeToggle";
import { KrowLogo } from "../components/KrowLogo";
import WorkspaceSetup from "../components/WorkspaceSetup";


type AppState = "workspace-setup" | "loading" | "ready" | "error";

export default function App() {
  const [state, setState] = useState<AppState>("workspace-setup");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>({ providerID: "opencode", modelID: "big-pickle" });
  const [activeQuestion, setActiveQuestion] = useState<QuestionRequest | null>(null);
  const [settingsRefreshKey, setSettingsRefreshKey] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>("cofounder");
  const [lastWorkspacePath, setLastWorkspacePath] = useState<string | null>(null);
  const [pendingSetupDetails, setPendingSetupDetails] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  // Load sessions list
  const refreshSessions = async () => {
    const res = await rpc.request.listSessions({});
    if ("sessions" in res) {
      setSessions(res.sessions);
    }
  };

  // Listen to streaming events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onStreamEvent("partUpdated", (payload: { sessionId: string; messageId: string; part: MessagePart; delta?: string; agent?: string; agentColor?: string }) => {
      const { messageId, part, agent, agentColor } = payload;
      if (payload.sessionId !== sessionIdRef.current) return;

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
          return prev.map((m) => m.id === messageId ? { ...m, parts, text, agent: agent ?? m.agent, agentColor: agentColor ?? m.agentColor } : m);
        }
        const text = part.type === "text" ? (part as any).text : "";
        return [...prev, {
          id: messageId,
          role: "assistant" as const,
          text,
          createdAt: Date.now(),
          isLoading: true,
          parts: [part],
          agent,
          agentColor,
        }];
      });
    }));

    unsubs.push(onStreamEvent("messageComplete", (payload: { sessionId: string; messageId: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      setSending(false);
      setMessages((prev) =>
        prev.map((m) => m.id === payload.messageId ? { ...m, isLoading: false } : m)
      );
      // Refresh sessions to update titles
      refreshSessions();
    }));

    unsubs.push(onStreamEvent("sessionStatus", (payload: { sessionId: string; status: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      if (payload.status === "busy") setSending(true);
      else if (payload.status === "idle") setSending(false);
    }));

    unsubs.push(onStreamEvent("sessionError", (payload: { sessionId: string; error: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${payload.error}`, createdAt: Date.now() },
      ]);
    }));

    unsubs.push(onStreamEvent("questionAsked", (payload: QuestionRequest) => {
      if (payload.sessionID !== sessionIdRef.current) return;
      setActiveQuestion(payload);
    }));

    unsubs.push(onStreamEvent("agentSwitched", (payload: { sessionId: string; agent: string; color: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      setActiveAgent(payload.agent);
    }));

    unsubs.push(onStreamEvent("settingsChanged", () => {
      setSettingsRefreshKey((k) => k + 1);
    }));

    unsubs.push(onStreamEvent("downloadProgress", (payload: { message: string }) => {
      setLoadingMessage(payload.message);
    }));

    return () => unsubs.forEach((fn) => fn());
  }, []);

  // Check for last workspace on mount
  useEffect(() => {
    (async () => {
      const res = await rpc.request.getLastWorkspace({});
      if (res.path) {
        setLastWorkspacePath(res.path);
        // Auto-validate the last workspace
        const validation = await rpc.request.validateWorkspace({ path: res.path });
        if (!("error" in validation) && validation.hasAgentsMd) {
          // Valid existing workspace — init directly
          handleWorkspaceReady(res.path, false);
          return;
        }
      }
      // No saved workspace or invalid — show picker
      setState("workspace-setup");
    })();
  }, []);

  const handleWorkspaceReady = async (path: string, isNew: boolean, projectDetails?: string) => {
    setState("loading");
    setLoadingMessage("Starting workspace...");

    try {
      const init = await rpc.request.initWorkspaceWithPath({ path });
      if ("error" in init) {
        setState("error");
        setError(init.error);
        return;
      }

      // Load agents
      const agentsRes = await rpc.request.listAgents({});
      if ("agents" in agentsRes) {
        setAgents(agentsRes.agents);
      }

      const session = await rpc.request.createSession({});
      if ("sessionId" in session) {
        setSessionId(session.sessionId);
        if (session.history && session.history.length > 0) {
          setMessages(session.history);
        }
        setState("ready");
        refreshSessions();

        // If new workspace, send setup prompt
        if (isNew && projectDetails) {
          setSending(true);
          await rpc.request.sendSetupPrompt({ sessionId: session.sessionId, projectDetails });
        }
      } else {
        setState("error");
        setError(session.error);
      }
    } catch (err: any) {
      setState("error");
      setError(err?.message ?? String(err));
    }
  };

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
    setActiveAgent("cofounder");

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

  const handleStopSession = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || !sendingRef.current) return;

    const res = await rpc.request.stopSession({ sessionId: currentSessionId });
    if ("error" in res) {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${res.error}`, createdAt: Date.now() },
      ]);
      return;
    }
    setSending(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sendingRef.current) {
        event.preventDefault();
        void handleStopSession();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNewSession = async () => {
    const res = await rpc.request.newSession({});
    if ("sessionId" in res) {
      setSessionId(res.sessionId);
      setMessages([]);
      setSending(false);
      setActiveQuestion(null);
      setActiveAgent("cofounder");
      refreshSessions();
    }
  };

  const handleSelectSession = async (session: SessionInfo) => {
    const res = await rpc.request.loadSession({ sessionId: session.id });
    if ("sessionId" in res) {
      setSessionId(res.sessionId);
      setMessages(res.history);
      setSending(false);
      setActiveQuestion(null);
    }
  };

  const handleOpenSettings = () => {
    rpc.request.openSettings({});
  };

  // ─── Workspace Setup Screen ───
  if (state === "workspace-setup") {
    return (
      <WorkspaceSetup
        initialPath={null}
        loadingMessage={loadingMessage}
        onWorkspaceReady={(path: string, isNew: boolean, projectDetails?: string) => {
          handleWorkspaceReady(path, isNew, projectDetails);
        }}
      />
    );
  }

  // ─── Loading / Error Screen ───
  if (state !== "ready") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface relative z-10">
        <div className="flex flex-col items-center gap-6 animate-reveal">
          <div className="w-14 h-14 glass-card flex items-center justify-center">
            <KrowLogo className="w-9 h-9 text-text-primary" />
          </div>

          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold text-primary tracking-tight">
              Open<span className="text-[#fb923c]">Krow</span>
            </h1>
          </div>

          {state === "loading" && (
            <div className="flex flex-col items-center gap-3 animate-fade delay-2">
              <span className="font-mono text-[13px] text-[#fb923c] tracking-wider animate-braille" />
              <p className="font-mono text-[11px] text-muted tracking-wide">{loadingMessage}</p>
            </div>
          )}

          {state === "error" && (
            <div className="flex flex-col items-center gap-2 animate-fade">
              <p className="text-red-400/80 text-xs max-w-xs text-center font-mono">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main App Layout ───
  return (
    <div className="flex h-screen bg-surface relative">
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        currentSessionId={sessionId}
        agents={agents}
        activeAgent={activeAgent}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onOpenSettings={handleOpenSettings}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div
          className="flex items-center justify-between px-4 py-2.5 glass-toolbar shrink-0 relative z-10"
          style={{ paddingTop: "1.75rem", WebkitAppRegion: "drag" } as any}
        >
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as any}>
            {activeAgent && (
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: agents.find((a) => a.name === activeAgent)?.color ?? "#6B7280" }}
                />
                <span className="font-mono text-[11px] text-text-muted uppercase tracking-wider">
                  {agents.find((a) => a.name === activeAgent)?.label ?? "Founder"}
                </span>
                {sending && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
            )}
          </div>

          <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: "no-drag" } as any}>
            <ThemeToggle />
          </div>
        </div>

        {/* Messages */}
        <MessageList messages={messages} sending={sending} />

        {/* Question prompt */}
        {activeQuestion && (
          <QuestionPrompt question={activeQuestion} onDismiss={() => setActiveQuestion(null)} />
        )}

        {/* Input */}
        <ChatInput onSend={handleSend} onStop={handleStopSession} disabled={sending || !!activeQuestion} sending={sending} onModelChange={setSelectedModel} refreshKey={settingsRefreshKey} />
      </div>
    </div>
  );
}
