import { useState, useEffect } from "react";
import { rpc } from "../mainview/rpc";
import type { SessionInfo, AgentInfo } from "../shared/types";

type Props = {
  sessions: SessionInfo[];
  currentSessionId: string | null;
  agents: AgentInfo[];
  activeAgent: string | null;
  onSelectSession: (session: SessionInfo) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
};

export default function Sidebar({
  sessions,
  currentSessionId,
  agents,
  activeAgent,
  onSelectSession,
  onNewSession,
  onOpenSettings,
}: Props) {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  // Group sessions by date
  const grouped = sessions.reduce<{ today: SessionInfo[]; yesterday: SessionInfo[]; older: SessionInfo[] }>(
    (acc, s) => {
      const d = new Date(s.updatedAt);
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      if (d.toDateString() === now.toDateString()) acc.today.push(s);
      else if (d.toDateString() === yesterday.toDateString()) acc.yesterday.push(s);
      else acc.older.push(s);
      return acc;
    },
    { today: [], yesterday: [], older: [] }
  );

  return (
    <div className="w-[240px] h-full flex flex-col bg-surface-100 border-r border-[var(--border-color)] shrink-0 select-none">
      {/* Header area — draggable for window controls */}
      <div
        className="px-4 pt-7 pb-2 flex items-center justify-between"
        style={{ WebkitAppRegion: "drag" } as any}
      >
        <span className="font-display text-xs font-bold text-text-primary tracking-tight">
          Open<span className="text-[#fb923c]">Krow</span>
        </span>
        <button
          onClick={onNewSession}
          className="p-1 glass-btn text-text-muted hover:text-[#fb923c]"
          title="New chat"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {grouped.today.length > 0 && (
          <SessionGroup label="Today" sessions={grouped.today} currentSessionId={currentSessionId} onSelect={onSelectSession} />
        )}
        {grouped.yesterday.length > 0 && (
          <SessionGroup label="Yesterday" sessions={grouped.yesterday} currentSessionId={currentSessionId} onSelect={onSelectSession} />
        )}
        {grouped.older.length > 0 && (
          <SessionGroup label="Previous" sessions={grouped.older} currentSessionId={currentSessionId} onSelect={onSelectSession} />
        )}
        {sessions.length === 0 && (
          <p className="text-[11px] text-text-faint font-mono px-2 py-4 text-center">No conversations yet</p>
        )}
      </div>

      {/* Agent roster */}
      <div className="px-3 py-2 border-t border-[var(--border-color)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-faint mb-2">Agents</p>
        <div className="space-y-0.5">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className={`flex items-center gap-2 px-2 py-1.5 text-[11px] rounded-none ${
                activeAgent === agent.name ? "bg-surface-200" : ""
              }`}
              title={agent.description}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: agent.color, opacity: activeAgent === agent.name ? 1 : 0.5 }}
              />
              <span className={`truncate ${activeAgent === agent.name ? "text-text-primary font-medium" : "text-text-muted"}`}>
                {agent.label}
              </span>
              {activeAgent === agent.name && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="px-3 py-2 border-t border-[var(--border-color)] flex items-center gap-1">
        <button
          onClick={onOpenSettings}
          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-[11px] text-text-muted hover:text-text-primary transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}

function SessionGroup({
  label,
  sessions,
  currentSessionId,
  onSelect,
}: {
  label: string;
  sessions: SessionInfo[];
  currentSessionId: string | null;
  onSelect: (s: SessionInfo) => void;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-faint px-2 mb-1">{label}</p>
      <div className="space-y-px">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => onSelect(session)}
            className={`w-full text-left px-2 py-1.5 text-[12px] transition-colors truncate ${
              session.id === currentSessionId
                ? "bg-surface-200 text-text-primary font-medium"
                : "text-text-muted hover:bg-surface-200 hover:text-text-primary"
            }`}
          >
            {session.title}
          </button>
        ))}
      </div>
    </div>
  );
}
