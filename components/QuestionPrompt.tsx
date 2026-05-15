import { useState } from "react";
import { rpc } from "../mainview/rpc";
import type { QuestionRequest } from "../shared/types";

type Props = {
  question: QuestionRequest;
  onDismiss: () => void;
};

export default function QuestionPrompt({ question, onDismiss }: Props) {
  const [selections, setSelections] = useState<string[][]>(
    question.questions.map(() => [])
  );
  const [customInputs, setCustomInputs] = useState<string[]>(
    question.questions.map(() => "")
  );
  const [submitting, setSubmitting] = useState(false);

  const toggleOption = (qIdx: number, label: string, multiple: boolean) => {
    setSelections((prev) => {
      const next = [...prev];
      const current = next[qIdx];
      if (multiple) {
        next[qIdx] = current.includes(label)
          ? current.filter((l) => l !== label)
          : [...current, label];
      } else {
        next[qIdx] = current.includes(label) ? [] : [label];
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const answers = question.questions.map((q, i) => {
      const selected = [...selections[i]];
      if (q.custom !== false && customInputs[i].trim()) {
        selected.push(customInputs[i].trim());
      }
      return selected;
    });
    await rpc.request.replyQuestion({ requestId: question.id, answers });
    onDismiss();
  };

  const handleReject = async () => {
    setSubmitting(true);
    await rpc.request.rejectQuestion({ requestId: question.id });
    onDismiss();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-3">
      <div className="glass-card overflow-hidden animate-reveal">
        {question.questions.map((q, qIdx) => (
          <div key={qIdx} className="px-5 py-4 space-y-3">
            {/* Header */}
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#fb923c]">
              {q.header}
            </div>
            {/* Question */}
            <div className="text-sm text-text-primary leading-relaxed">{q.question}</div>

            {/* Options */}
            <div className="space-y-1.5 pt-1">
              {q.options.map((opt) => {
                const selected = selections[qIdx].includes(opt.label);
                return (
                  <button
                    key={opt.label}
                    onClick={() => toggleOption(qIdx, opt.label, !!q.multiple)}
                    disabled={submitting}
                    className={`w-full text-left px-3.5 py-2.5 text-sm transition-all flex items-start gap-2.5 ${
                      selected
                        ? "glass-card border-[#fb923c]/30 bg-[#fb923c]/10 text-[#fb923c]"
                        : "glass-input text-text-primary hover:border-[var(--surface-500)]"
                    }`}
                  >
                    {/* Indicator */}
                    <span className="mt-0.5 shrink-0">
                      {q.multiple ? (
                        <span className={`inline-flex items-center justify-center w-4 h-4 border ${
                          selected ? "bg-[#fb923c] border-[#fb923c]" : "border-surface-500"
                        }`}>
                          {selected && (
                            <svg className="w-2.5 h-2.5 text-[#0F172A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center justify-center w-4 h-4 border ${
                          selected ? "border-[#fb923c]" : "border-surface-500"
                        }`}>
                          {selected && <span className="w-2 h-2 bg-[#fb923c]" />}
                        </span>
                      )}
                    </span>
                    <div>
                      <div className="font-medium text-[13px]">{opt.label}</div>
                      {opt.description && (
                        <div className="text-[11px] text-text-muted mt-0.5 leading-relaxed">{opt.description}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom input */}
            {q.custom !== false && (
              <input
                type="text"
                value={customInputs[qIdx]}
                onChange={(e) => {
                  setCustomInputs((prev) => {
                    const next = [...prev];
                    next[qIdx] = e.target.value;
                    return next;
                  });
                }}
                placeholder="Type your own answer..."
                disabled={submitting}
                className="w-full glass-input px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-faint outline-none focus:border-[#fb923c] transition-colors"
              />
            )}
          </div>
        ))}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={handleReject}
            disabled={submitting}
            className="px-4 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-50 glass-btn"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selections.every((s, i) => s.length === 0 && !customInputs[i].trim())}
            className="px-5 py-1.5 bg-[#fb923c] text-[#0F172A] text-xs font-display font-semibold tracking-wide hover:bg-[#f97316] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
