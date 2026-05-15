import { useState, useEffect, useRef } from "react";
import { rpc } from "../mainview/rpc";
import type { SessionInfo } from "../shared/types";

type Props = {
  onSelect: (session: SessionInfo) => void;
  onClose: () => void;
  currentSessionId: string | null;
};

export default function SessionHistory({ onSelect, onClose, currentSessionId }: Props) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rpc.request.listSessions({}).then((res) => {
      if ("sessions" in res) {
        setSessions(res.sessions);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  return (
    <div
      ref={ref}
      className="absolute top-14 right-3 w-72 max-h-96 overflow-y-auto glass-elevated z-50 animate-reveal"
    >
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-text-muted">History</span>
      </div>
      {loading ? (
        <div className="px-4 py-6 text-[11px] text-text-muted text-center font-mono">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="px-4 py-6 text-[11px] text-text-faint text-center font-mono">No sessions yet</div>
      ) : (
        <div className="py-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session)}
              className={`w-full text-left px-4 py-2.5 text-xs hover:bg-surface-200 transition-colors flex items-center justify-between gap-3 ${
                session.id === currentSessionId ? "bg-[#fb923c]/10 text-[#fb923c]" : "text-text-primary"
              }`}
            >
              <span className="truncate">{session.title}</span>
              <span className="font-mono text-[10px] text-text-faint shrink-0">{formatTime(session.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
