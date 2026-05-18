import { useState, useEffect, useRef } from "react";
import { rpc } from "../mainview/rpc";
import type { ModelInfo } from "../shared/types";

type Props = {
  onSend: (text: string) => void;
  onStop?: () => void;
  disabled: boolean;
  sending?: boolean;
  onModelChange: (model: { providerID: string; modelID: string } | null) => void;
  refreshKey?: number;
};

export default function ChatInput({ onSend, onStop, disabled, sending, onModelChange, refreshKey }: Props) {
  const [input, setInput] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>("opencode/big-pickle");
  const [showModels, setShowModels] = useState(false);
  const currentModelRef = useRef<string | null>(currentModel);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    currentModelRef.current = currentModel;
  }, [currentModel]);

  useEffect(() => {
    const publishModel = (value: string | null) => {
      if (!value) {
        onModelChange(null);
        return;
      }

      const [providerID, ...modelParts] = value.split("/");
      const modelID = modelParts.join("/");
      if (providerID && modelID) {
        onModelChange({ providerID, modelID });
      }
    };

    publishModel(currentModelRef.current);
    rpc.request.getProviders({}).then((res) => {
      if ("models" in res) {
        setModels(res.models);
        const selected = currentModelRef.current;
        if (selected && !res.models.some((model) => `${model.providerID}/${model.id}` === selected)) {
          setCurrentModel(null);
          onModelChange(null);
        }
      }
    });
  }, [refreshKey]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModels(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  const handleSelectModel = (model: ModelInfo) => {
    const value = `${model.providerID}/${model.id}`;
    currentModelRef.current = value;
    setCurrentModel(value);
    onModelChange({ providerID: model.providerID, modelID: model.id });
    setShowModels(false);
  };

  const selectedModel = models.find((m) => `${m.providerID}/${m.id}` === currentModel);

  return (
    <div className="shrink-0 px-4 py-3 relative z-10">
      <div className="max-w-3xl mx-auto">
        <div className="relative glass-card focus-within:border-[#fb923c] transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message your team..."
            rows={1}
            className="w-full bg-transparent text-text-primary px-4 pt-3.5 pb-11 text-sm resize-none outline-none placeholder:text-text-faint leading-relaxed"
          />
          {/* Bottom bar */}
          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
            {/* Model selector */}
            <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowModels(!showModels)}
                  className="flex items-center gap-1.5 px-2.5 py-1 glass-btn font-mono text-[11px] text-text-muted"
                >
                <span className="truncate max-w-[140px]">{selectedModel?.name ?? currentModel ?? "Model"}</span>
                <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showModels && (
                <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto glass-elevated z-50 py-1">
                  {models.map((model) => {
                    const isSelected = `${model.providerID}/${model.id}` === currentModel;
                    return (
                      <button
                        key={`${model.providerID}/${model.id}`}
                        onClick={() => handleSelectModel(model)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-surface-200 transition-colors flex items-center gap-2 ${
                          isSelected ? "text-[#fb923c] bg-[#fb923c]/10" : "text-text-primary"
                        }`}
                      >
                        <span className="text-text-muted font-mono text-[10px]">{model.providerName}/</span>
                        <span className="truncate">{model.name}</span>
                        {isSelected && (
                          <svg className="w-3 h-3 ml-auto text-[#fb923c] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Send / Stop button */}
            {sending ? (
              <button
                onClick={onStop}
                className="p-1.5 bg-red-500/80 text-white hover:bg-red-500 transition-all"
                title="Stop generating (Esc)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="0" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || disabled}
                className="p-1.5 bg-[#fb923c] text-[#0F172A] hover:bg-[#f97316] transition-all disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
