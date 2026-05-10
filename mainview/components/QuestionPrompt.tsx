import { useState } from "react";
import { rpc } from "../rpc";
import type { QuestionRequest } from "../../shared/types";

type Props = {
  question: QuestionRequest;
  onDismiss: () => void;
};

export default function QuestionPrompt({ question, onDismiss }: Props) {
  // Track selected answers per question index
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
    // Build answers: merge selections with custom input if provided
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
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl overflow-hidden">
        {question.questions.map((q, qIdx) => (
          <div key={qIdx} className="px-4 py-3 space-y-2">
            {/* Header */}
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
              {q.header}
            </div>
            {/* Question */}
            <div className="text-sm text-neutral-200">{q.question}</div>

            {/* Options */}
            <div className="space-y-1 pt-1">
              {q.options.map((opt) => {
                const selected = selections[qIdx].includes(opt.label);
                return (
                  <button
                    key={opt.label}
                    onClick={() => toggleOption(qIdx, opt.label, !!q.multiple)}
                    disabled={submitting}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-start gap-2 ${
                      selected
                        ? "bg-blue-600/20 border border-blue-500/50 text-blue-200"
                        : "bg-neutral-700/50 border border-transparent text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {/* Checkbox / radio indicator */}
                    <span className="mt-0.5 shrink-0">
                      {q.multiple ? (
                        <span className={`inline-block w-3.5 h-3.5 rounded-sm border ${
                          selected ? "bg-blue-500 border-blue-500" : "border-neutral-500"
                        } flex items-center justify-center`}>
                          {selected && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      ) : (
                        <span className={`inline-block w-3.5 h-3.5 rounded-full border ${
                          selected ? "border-blue-500" : "border-neutral-500"
                        } flex items-center justify-center`}>
                          {selected && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                        </span>
                      )}
                    </span>
                    <div>
                      <div className="font-medium">{opt.label}</div>
                      {opt.description && (
                        <div className="text-xs text-neutral-400 mt-0.5">{opt.description}</div>
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
                className="w-full bg-neutral-700/50 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-neutral-500"
              />
            )}
          </div>
        ))}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-700">
          <button
            onClick={handleReject}
            disabled={submitting}
            className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selections.every((s, i) => s.length === 0 && !customInputs[i].trim())}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
