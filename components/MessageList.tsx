import { useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, MessagePart, ToolPart, ReasoningPart } from "../shared/types";
import { KrowLogo } from "./KrowLogo";

type Props = {
  messages: ChatMessage[];
  sending: boolean;
};

function ToolPartView({ part }: { part: ToolPart }) {
  const { tool, state } = part;
  const title = ("title" in state && state.title) ? state.title : tool;

  const statusColor = state.status === "error" ? "text-red-400" : state.status === "completed" ? "text-emerald-400" : "text-[#fb923c]";
  const statusIcon = state.status === "completed" ? (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ) : state.status === "running" ? (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16 8 8 0 010-16z" />
    </svg>
  ) : state.status === "error" ? (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ) : (
    <span className="w-3 h-3 flex items-center justify-center">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
    </span>
  );

  return (
    <div className="my-1.5 px-3 py-2 glass-input font-mono text-[11px]">
      <div className="flex items-center gap-2">
        <span className={statusColor}>{statusIcon}</span>
        <span className="text-text-primary">{title}</span>
        {"time" in state && "end" in (state as any).time && (
          <span className="ml-auto text-text-faint text-[10px]">
            {(((state as any).time.end - (state as any).time.start) / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {state.status === "completed" && state.output && (
        <details className="mt-1.5">
          <summary className="text-text-muted cursor-pointer hover:text-text-primary transition-colors text-[10px] uppercase tracking-wider">Output</summary>
          <pre className="mt-1.5 text-text-muted whitespace-pre-wrap text-[10px] max-h-40 overflow-y-auto leading-relaxed">{state.output.slice(0, 2000)}</pre>
        </details>
      )}
      {state.status === "error" && (
        <p className="mt-1 text-red-400/80 text-[10px]">{state.error}</p>
      )}
    </div>
  );
}

function ReasoningView({ part }: { part: ReasoningPart }) {
  return (
    <details className="my-1.5">
      <summary className="text-text-muted text-[11px] cursor-pointer hover:text-text-primary transition-colors font-mono uppercase tracking-wider">Thinking...</summary>
      <div className="px-3 py-2 mt-1 text-[11px] text-text-muted italic whitespace-pre-wrap leading-relaxed glass-input">{part.text}</div>
    </details>
  );
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
          pre: ({ children }) => (
            <pre className="glass-input p-3 overflow-x-auto my-2.5 text-[12px] font-mono leading-relaxed">{children}</pre>
          ),
        code: ({ className, children, ...props }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return <code className={`${className} text-[12px]`} {...props}>{children}</code>;
          }
          return <code className="bg-surface-200 px-1.5 py-0.5 text-[12px] font-mono text-[#fb923c]" {...props}>{children}</code>;
        },
        a: ({ children, href }) => (
          <a href={href} className="text-[#fb923c] underline decoration-[#fb923c]/30 hover:decoration-[#fb923c] transition-colors" target="_blank" rel="noreferrer">{children}</a>
        ),
        ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>,
        p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="font-display text-lg font-bold mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="font-display text-base font-bold mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="font-display text-sm font-semibold mt-2.5 mb-1">{children}</h3>,
        table: ({ children }) => <table className="border-collapse my-2.5 text-[12px] w-full">{children}</table>,
        th: ({ children }) => <th className="border border-surface-400 px-2.5 py-1.5 bg-surface-200 font-mono text-[11px] uppercase tracking-wider text-text-muted">{children}</th>,
        td: ({ children }) => <td className="border border-surface-400 px-2.5 py-1.5">{children}</td>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-[#fb923c]/40 pl-3 my-2 text-text-muted italic">{children}</blockquote>,
      }}
    >
      {text}
    </Markdown>
  );
}

function PartsView({ parts }: { parts: MessagePart[] }) {
  return (
    <div className="space-y-0.5">
      {parts.map((part) => {
        switch (part.type) {
          case "text":
            return <div key={part.id}><MarkdownContent text={part.text} /></div>;
          case "reasoning":
            return <ReasoningView key={part.id} part={part} />;
          case "tool":
            return <ToolPartView key={part.id} part={part} />;
          case "step-start":
            return <div key={part.id} className="border-t border-[var(--border-color)] my-3" />;
          case "step-finish":
            return (
              <div key={part.id} className="font-mono text-[10px] text-text-faint mt-1">
                {part.tokens.input}in / {part.tokens.output}out
                {part.tokens.reasoning > 0 && ` / ${part.tokens.reasoning}r`}
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

export default function MessageList({ messages, sending }: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-10 h-10 glass-card flex items-center justify-center animate-breathe">
            <KrowLogo className="w-6 h-6 text-text-primary" />
          </div>
          <p className="text-text-faint text-sm font-mono text-center max-w-md">OpenKrow is an AI agent that sits right on your desktop. Ask it to draft reports, research topics, summarize documents, or write code — in natural language.</p>
        </div>
      )}
      {messages.map((msg) => (
        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] px-4 py-3 text-sm ${
              msg.role === "user"
                ? "glass-card border-[#fb923c]/30 bg-[#fb923c]/[0.06] text-text-primary"
                : "glass-card text-text-primary"
            }`}
          >
            {msg.role === "assistant" && msg.parts && msg.parts.length > 0 ? (
              <PartsView parts={msg.parts} />
            ) : msg.role === "assistant" ? (
              <MarkdownContent text={msg.text} />
            ) : (
              <span className="whitespace-pre-wrap leading-relaxed">{msg.text}</span>
            )}
          </div>
        </div>
      ))}
      {sending && messages[messages.length - 1]?.role !== "assistant" && (
        <div className="flex justify-start">
          <div className="glass-card text-text-muted px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#fb923c]/60 animate-pulse" style={{ animationDelay: "0s" }} />
                <span className="w-1.5 h-1.5 bg-[#fb923c]/60 animate-pulse" style={{ animationDelay: "0.15s" }} />
                <span className="w-1.5 h-1.5 bg-[#fb923c]/60 animate-pulse" style={{ animationDelay: "0.3s" }} />
              </div>
              <span className="font-mono text-[11px] text-text-muted">Thinking...</span>
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
