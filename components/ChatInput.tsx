import { useState, useEffect, useRef } from "react";
import { rpc } from "../mainview/rpc";
import type { ModelInfo } from "../shared/types";

type Props = {
  onSend: (text: string) => void;
  disabled: boolean;
  onModelChange: (model: { providerID: string; modelID: string } | null) => void;
  refreshKey?: number;
};

export default function ChatInput({ onSend, disabled, onModelChange, refreshKey }: Props) {
  const [input, setInput] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>("opencode/big-pickle");
  const [showModels, setShowModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onModelChange({ providerID: "opencode", modelID: "big-pickle" });
    rpc.request.getProviders({}).then((res) => {
      if ("models" in res) {
        setModels(res.models);
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
    setCurrentModel(`${model.providerID}/${model.id}`);
    onModelChange({ providerID: model.providerID, modelID: model.id });
    setShowModels(false);
  };

  const selectedModel = models.find((m) => `${m.providerID}/${m.id}` === currentModel);

  return (
    <div className="shrink-0 px-4 py-3 relative z-10">
      <div className="max-w-3xl mx-auto">
        <div className="relative glass-card !rounded-2xl focus-within:border-surface-500 transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message Krow..."
            rows={1}
            className="w-full bg-transparent text-text-primary px-4 pt-3.5 pb-11 text-sm resize-none outline-none placeholder:text-text-faint leading-relaxed"
          />
          {/* Bottom bar */}
          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between">
            {/* Model selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowModels(!showModels)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-ghost-hover transition-colors font-mono text-[11px] text-text-muted border border-transparent hover:border-ghost-border"
              >
                <span className="truncate max-w-[140px]">{selectedModel?.name ?? currentModel ?? "Model"}</span>
                <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showModels && (
                <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto glass-card !rounded-xl shadow-2xl z-50 py-1">
                  {models.map((model) => {
                    const isSelected = `${model.providerID}/${model.id}` === currentModel;
                    return (
                      <button
                        key={`${model.providerID}/${model.id}`}
                        onClick={() => handleSelectModel(model)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-ghost-hover transition-colors flex items-center gap-2 ${
                          isSelected ? "text-ember-light bg-ember-subtle" : "text-text-primary"
                        }`}
                      >
                        <span className="text-text-muted font-mono text-[10px]">{model.providerName}/</span>
                        <span className="truncate">{model.name}</span>
                        {isSelected && (
                          <svg className="w-3 h-3 ml-auto text-ember-light shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || disabled}
              className="p-1.5 rounded-full bg-ember text-obsidian hover:bg-ember-light transition-all shadow-[0_0_20px_var(--color-ember-glow)] hover:shadow-[0_0_30px_var(--color-ember-glow)] disabled:opacity-20 disabled:shadow-none disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
