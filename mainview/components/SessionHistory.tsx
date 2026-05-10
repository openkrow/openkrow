import { useState, useEffect, useRef } from "react";
import { rpc } from "../rpc";
import type { SessionInfo } from "../../shared/types";

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
      className="absolute top-12 right-3 w-72 max-h-96 overflow-y-auto bg-neutral-850 border border-neutral-700 rounded-lg shadow-2xl z-50"
      style={{ backgroundColor: "#1a1a1a" }}
    >
      <div className="px-3 py-2 border-b border-neutral-700">
        <span className="text-xs font-medium text-neutral-400">Chat History</span>
      </div>
      {loading ? (
        <div className="px-3 py-4 text-xs text-neutral-500 text-center">Loading...</div>
      ) : sessions.length === 0 ? (
        <div className="px-3 py-4 text-xs text-neutral-500 text-center">No sessions yet</div>
      ) : (
        <div className="py-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelect(session)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-neutral-800 transition-colors flex items-center justify-between gap-2 ${
                session.id === currentSessionId ? "bg-neutral-800 text-white" : "text-neutral-300"
              }`}
            >
              <span className="truncate">{session.title}</span>
              <span className="text-[10px] text-neutral-500 shrink-0">{formatTime(session.updatedAt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
