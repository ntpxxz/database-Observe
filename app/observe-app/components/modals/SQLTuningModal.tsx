import React, { FC } from "react";
import { X } from "lucide-react";

interface SQLTuningModalProps {
  isOpen: boolean;
  query: string;
  suggestion: string | null;
  onClose: () => void;
}

export const SQLTuningModal: FC<SQLTuningModalProps> = ({ isOpen, query, suggestion, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-800 w-full max-w-4xl p-6 rounded-lg shadow-lg relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
          <X />
        </button>

        <h2 className="text-xl font-bold text-white mb-4">AI SQL Tuning Suggestion</h2>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 mb-1">Your Query:</h3>
          <pre className="bg-slate-900 text-cyan-300 p-3 rounded overflow-x-auto text-sm font-mono border border-slate-700">
            {query}
          </pre>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-1">AI Suggestion:</h3>
          {suggestion ? (
            <pre className="bg-slate-900 text-green-400 p-3 rounded overflow-x-auto text-sm font-mono border border-slate-700">
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
