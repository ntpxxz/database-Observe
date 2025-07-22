import React, { FC } from "react";
import { X, ClipboardCopy } from "lucide-react";

interface SQLTuningModalProps {
  isOpen: boolean;
  query: string;
  suggestion: string | null;
  onClose: () => void;
}

export const SQLTuningModal: FC<SQLTuningModalProps> = ({
  isOpen,
  query,
  suggestion,
  onClose,
}) => {
  if (!isOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 w-full max-w-4xl p-6 rounded-lg shadow-lg relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X />
        </button>

        <h2 className="text-xl font-bold text-white mb-6">
          💡 AI SQL Tuning Suggestion
        </h2>

        {/* Query Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-sm font-semibold text-slate-400">Your Query</h3>
            <button
              className="text-xs text-blue-400 hover:text-blue-200"
              onClick={() => copyToClipboard(query)}
            >
              <ClipboardCopy className="inline w-4 h-4 mr-1" />
              Copy
            </button>
          </div>
          <pre className="bg-slate-900 text-cyan-300 p-3 rounded overflow-auto text-sm font-mono border border-slate-700 max-h-40">
            {query}
          </pre>
        </div>

        {/* Suggestion Section */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-sm font-semibold text-slate-400">AI Suggestion</h3>
            {suggestion && (
              <button
                className="text-xs text-green-400 hover:text-green-200"
                onClick={() => copyToClipboard(suggestion)}
              >
                <ClipboardCopy className="inline w-4 h-4 mr-1" />
                Copy
              </button>
            )}
          </div>
          {suggestion ? (
            <pre className="bg-slate-900 text-green-400 p-3 rounded overflow-auto whitespace-pre-wrap break-words text-sm font-mono border border-slate-700 max-h-[400px]">
              {suggestion}
            </pre>
          ) : (
            <p className="text-slate-300 italic">No suggestion received yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
