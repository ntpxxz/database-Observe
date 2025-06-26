import React, { FC } from "react";
import { PerformanceInsight } from "@/types";
import { X } from "lucide-react";

interface InsightDetailModalProps {
  insight: PerformanceInsight | null;
  onClose: () => void;
}

// Helper component สำหรับแสดงรายละเอียดแต่ละรายการ
const DetailItem: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="py-2">
    <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</dt>
    <dd className="mt-1 text-sm text-slate-200">{value ?? "N/A"}</dd>
  </div>
);

export const InsightDetailModal: FC<InsightDetailModalProps> = ({ insight, onClose }) => {
  if (!insight) return null;

  const { details, title, severity } = insight;

  // ดึง Full Query ออกมา
  const fullQuery = details?.query || details?.query_text || details?.blocked_query || details?.query_1 || "No query text available.";

  return (
    <div 
      className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()} // ป้องกันการปิด Modal เมื่อคลิกที่ตัว Modal เอง
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-slate-100">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-700">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 mb-4">
            <DetailItem label="Severity" value={severity} />
            <DetailItem label="Avg. Duration (ms)" value={details?.mean_exec_time_ms?.toLocaleString()} />
            <DetailItem label="Total Calls" value={details?.calls?.toLocaleString()} />
            <DetailItem label="Session ID" value={details?.session_id} />
            <DetailItem label="Blocking Session" value={details?.blocking_session_id} />
            <DetailItem label="Wait Time (ms)" value={details?.wait_duration_ms?.toLocaleString()} />
          </div>

          {/* Full Query Section */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Full Query Text</h3>
            <pre className="bg-slate-900/70 p-4 rounded-md text-sm text-cyan-300 font-mono overflow-x-auto border border-slate-700">
              <code>
                {fullQuery}
              </code>
            </pre>
          </div>

           {/* แสดงข้อมูลเพิ่มเติมสำหรับ Deadlock */}
           {details?.query_2 && (
             <div className="mt-4">
               <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Blocked Query (In Deadlock)</h3>
               <pre className="bg-slate-900/70 p-4 rounded-md text-sm text-amber-300 font-mono overflow-x-auto border border-slate-700">
                 <code>
                   {details.query_2}
                 </code>
               </pre>
             </div>
           )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 text-right">
            <button
                onClick={onClose}
                className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded-md"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};