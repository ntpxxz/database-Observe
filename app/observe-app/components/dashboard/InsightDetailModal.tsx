'use client'
import React, { FC, useState } from "react";
import { PerformanceInsight } from "@/types";
import { X, Cpu, Clock, User, Clipboard, ClipboardCheck, Bot } from "lucide-react";
import { SQLTuningModal } from "../modals/SQLTuningModal";
interface InsightDetailModalProps {
  insight: PerformanceInsight | null;
  onClose: () => void;
}

const DetailItem: FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => {
  if (!value || value === "N/A" || value === 0 || value === "0") return null;
  return (
    <div className="py-1">
      <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-200">{value}</dd>
    </div>
  );
};

export const InsightDetailModal: FC<InsightDetailModalProps> = ({
  insight,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!insight) return null;

  const details = insight.details || insight;

  const fullQuery =
    details.query ||
    details.query_text ||
    details.blocked_query ||
    details.query_1 ||
    details.query_2 ||
    insight.title ||
    "No query text available.";

  const meanDuration = details?.mean_exec_time_ms;
  const waitTime = details?.wait_duration_ms ?? details?.wait_time_ms;
  const waitTimeText =
    details?.wait_duration_ms &&
    details?.wait_time_ms &&
    details?.wait_duration_ms === details?.wait_time_ms
      ? details?.wait_time_ms?.toLocaleString()
      : waitTime?.toLocaleString();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullQuery);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      alert("Failed to copy query.");
    }
  };
  
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [showSQLTuningModal, setShowSQLTuningModal] = useState(false);


  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-slate-100">{insight.title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-slate-700"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-8">
          {/* Performance Info */}
          <section>
            <div className="flex items-center gap-2 mb-2 text-amber-400">
              <Cpu size={16} />
              <h3 className="text-sm font-semibold uppercase tracking-wider">
                Performance Info
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
              <DetailItem
                label="Avg. Duration (ms)"
                value={meanDuration?.toLocaleString()}
              />
              <DetailItem
                label="Total Calls"
                value={details?.calls?.toLocaleString()}
              />
              <DetailItem label="Severity" value={insight.severity} />
            </div>
          </section>

          {/* Session Info */}
          <section>
            <div className="flex items-center gap-2 mb-2 text-sky-400">
              <User size={16} />
              <h3 className="text-sm font-semibold uppercase tracking-wider">
                Session Info
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
              <DetailItem label="Session ID" value={details?.session_id} />
              <DetailItem
                label="Blocking Session"
                value={details?.blocking_session_id}
              />
            </div>
          </section>

          {/* Wait Info */}
          <section>
            <div className="flex items-center gap-2 mb-2 text-purple-400">
              <Clock size={16} />
              <h3 className="text-sm font-semibold uppercase tracking-wider">
                Wait Info
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
              <DetailItem label="Wait Type" value={details?.wait_type} />
              <DetailItem label="Wait Time (ms)" value={waitTimeText} />
              <DetailItem
                label="Waiting Tasks"
                value={details?.waiting_tasks_count?.toLocaleString()}
              />
              <DetailItem
                label="Resource Wait Time (ms)"
                value={details?.resource_wait_time_ms?.toLocaleString()}
              />
            </div>
          </section>

          {/* Full Query */}
          <section>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Full Query Text
              </h3>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-sm text-cyan-300 hover:text-cyan-100"
              >
                {copied ? (
                  <ClipboardCheck size={16} />
                ) : (
                  <Clipboard size={16} />
                )}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="bg-slate-900/70 p-4 rounded-md text-sm text-cyan-300 font-mono overflow-x-auto border border-slate-700">
              <code>{fullQuery}</code>
            </pre>
          </section>

          {/* Blocked Query (Deadlock) */}
          {details.query_2 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Blocked Query (In Deadlock)
              </h3>
              <pre className="bg-slate-900/70 p-4 rounded-md text-sm text-amber-300 font-mono overflow-x-auto border border-slate-700">
                <code>{details.query_2}</code>
              </pre>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex justify-between">
          <button
            onClick={() => {setShowSQLTuningModal(true)}}
            
            className="bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-4 rounded-md"
          >
           <Bot/> 
          </button>
          <button
            onClick={onClose}
            className="bg-sky-600 hover:bg-sky-500 text-white  py-2 px-4 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
      
      {showSQLTuningModal && (
    <SQLTuningModal
          query={fullQuery}
          onClose={() => setShowSQLTuningModal(false)} isOpen={true} suggestion={null}    />
  )}
    
      
    </div>    
  );
 
  
  
};
