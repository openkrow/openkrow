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
    // Set default model immediately
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
    <div className="shrink-0 border-t border-neutral-800 px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-neutral-800 rounded-xl border border-neutral-700 focus-within:border-neutral-600 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Message Krow..."
            rows={1}
            className="w-full bg-transparent text-neutral-200 px-4 pt-3 pb-10 text-sm resize-none outline-none placeholder:text-neutral-500"
          />
          {/* Bottom bar with model selector and send */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            {/* Model selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowModels(!showModels)}
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-neutral-700 transition-colors text-[11px] text-neutral-400"
              >
                <span>{selectedModel?.name ?? currentModel ?? "Model"}</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showModels && (
                <div className="absolute bottom-full left-0 mb-1 w-64 max-h-72 overflow-y-auto bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50">
                  {models.map((model) => {
                    const isSelected = `${model.providerID}/${model.id}` === currentModel;
                    return (
                      <button
                        key={`${model.providerID}/${model.id}`}
                        onClick={() => handleSelectModel(model)}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-neutral-700 transition-colors ${
                          isSelected ? "text-white bg-neutral-700" : "text-neutral-300"
                        }`}
                      >
                        <span className="text-neutral-500">{model.providerName}/</span>
                        {model.name}
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
              className="p-1.5 rounded-md bg-white text-neutral-900 hover:bg-neutral-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
