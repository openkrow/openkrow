import { useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, MessagePart, ToolPart, ReasoningPart } from "../../shared/types";

type Props = {
  messages: ChatMessage[];
  sending: boolean;
};

function ToolPartView({ part }: { part: ToolPart }) {
  const { tool, state } = part;
  const statusIcon = state.status === "completed" ? "✓" : state.status === "running" ? "⟳" : state.status === "error" ? "✗" : "…";
  const title = ("title" in state && state.title) ? state.title : tool;

  return (
    <div className="my-1 px-3 py-1.5 bg-neutral-700/50 rounded-lg text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className={state.status === "error" ? "text-red-400" : state.status === "completed" ? "text-green-400" : "text-yellow-400"}>
          {statusIcon}
        </span>
        <span className="text-neutral-300">{title}</span>
      </div>
      {state.status === "completed" && state.output && (
        <details className="mt-1">
          <summary className="text-neutral-500 cursor-pointer">Output</summary>
          <pre className="mt-1 text-neutral-400 whitespace-pre-wrap text-[11px] max-h-40 overflow-y-auto">{state.output.slice(0, 2000)}</pre>
        </details>
      )}
      {state.status === "error" && (
        <p className="mt-1 text-red-400 text-[11px]">{state.error}</p>
      )}
    </div>
  );
}

function ReasoningView({ part }: { part: ReasoningPart }) {
  return (
    <details className="my-1">
      <summary className="text-neutral-500 text-xs cursor-pointer">Thinking...</summary>
      <div className="px-3 py-1 text-xs text-neutral-400 italic whitespace-pre-wrap">{part.text}</div>
    </details>
  );
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <pre className="bg-neutral-900 rounded-md p-3 overflow-x-auto my-2 text-xs">{children}</pre>,
        code: ({ className, children, ...props }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return <code className={`${className} text-xs`} {...props}>{children}</code>;
          }
          return <code className="bg-neutral-700 px-1 py-0.5 rounded text-xs" {...props}>{children}</code>;
        },
        a: ({ children, href }) => <a href={href} className="text-blue-400 underline" target="_blank" rel="noreferrer">{children}</a>,
        ul: ({ children }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
        p: ({ children }) => <p className="my-1">{children}</p>,
        table: ({ children }) => <table className="border-collapse my-2 text-xs w-full">{children}</table>,
        th: ({ children }) => <th className="border border-neutral-600 px-2 py-1 bg-neutral-700">{children}</th>,
        td: ({ children }) => <td className="border border-neutral-600 px-2 py-1">{children}</td>,
      }}
    >
      {text}
    </Markdown>
  );
}

function PartsView({ parts }: { parts: MessagePart[] }) {
  return (
    <div className="space-y-1">
      {parts.map((part) => {
        switch (part.type) {
          case "text":
            return <div key={part.id}><MarkdownContent text={part.text} /></div>;
          case "reasoning":
            return <ReasoningView key={part.id} part={part} />;
          case "tool":
            return <ToolPartView key={part.id} part={part} />;
          case "step-start":
            return <div key={part.id} className="border-t border-neutral-700 my-2" />;
          case "step-finish":
            return (
              <div key={part.id} className="text-[10px] text-neutral-600">
                tokens: {part.tokens.input}in / {part.tokens.output}out
                {part.tokens.reasoning > 0 && ` / ${part.tokens.reasoning}thinking`}
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
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <p className="text-neutral-600 text-sm">Send a message to start.</p>
        </div>
      )}
      {messages.map((msg) => (
        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white whitespace-pre-wrap"
                : "bg-neutral-800 text-neutral-200"
            }`}
          >
            {msg.role === "assistant" && msg.parts && msg.parts.length > 0 ? (
              <PartsView parts={msg.parts} />
            ) : msg.role === "assistant" ? (
              <MarkdownContent text={msg.text} />
            ) : (
              <span className="whitespace-pre-wrap">{msg.text}</span>
            )}
          </div>
        </div>
      ))}
      {sending && messages[messages.length - 1]?.role !== "assistant" && (
        <div className="flex justify-start">
          <div className="bg-neutral-800 text-neutral-400 rounded-xl px-4 py-2.5 text-sm">
            Thinking...
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
