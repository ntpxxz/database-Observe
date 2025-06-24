import React, { FC, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { PerformanceInsight } from '@/types/index';

interface InsightDetailModalProps {
  insight: PerformanceInsight;
  onClose: () => void;
}

export const InsightDetailModal: FC<InsightDetailModalProps> = ({ insight, onClose }) => {
  const [copied, setCopied] = useState(false);

  // ดึงคำสั่ง SQL ที่เกี่ยวข้องออกมา
  const blockingQuery = insight.details?.blocking_query;
  const blockedQuery = insight.details?.blocked_query;
  const slowQuery = insight.details?.query;

  const handleCopy = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000); // Reset icon after 2 seconds
  };
  
  const renderQueryBlock = (title: string, queryText: string | undefined) => {
    if (!queryText || queryText.startsWith('N/A')) return null;

    return (
        <div className="mt-4">
            <div className="flex justify-between items-center mb-1">
                <h4 className="text-sm font-semibold text-slate-400">{title}</h4>
                <button
                    onClick={() => handleCopy(queryText)}
                    className="text-slate-400 hover:text-white transition-colors p-1 rounded-md"
                    title="Copy Query"
                >
                    {copied ? <Check size={16} className="text-green-400"/> : <Copy size={16}/>}
                </button>
            </div>
            <pre className="bg-slate-900/70 p-3 rounded-md text-xs text-slate-300 font-mono overflow-auto max-h-60">
                <code>{queryText.trim()}</code>
            </pre>
        </div>
    );
  }

  return (
    // Modal Overlay
    <div 
        className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4"
        onClick={onClose}
    >
      {/* Modal Content */}
      <div 
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()} // Prevent closing modal when clicking inside
      >
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h3 className="text-lg font-bold text-white">Performance Insight Details</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto">
            <p className="text-md text-slate-300 mb-4">{insight.message}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                <div className="bg-slate-700/50 p-3 rounded-lg">
                    <span className="text-slate-400 block">Severity</span>
                    <span className="font-bold text-white capitalize">{insight.severity}</span>
                </div>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                    <span className="text-slate-400 block">Insight Type</span>
                    <span className="font-bold text-white capitalize">{(insight.type ?? 'unknown').replace('_', ' ')}</span>
                </div>
            </div>

            {/* Render query blocks based on insight type */}
            {insight.type === 'blocking_query' && (
                <>
                    {renderQueryBlock('Blocking Query (ตัวที่บล็อก)', blockingQuery)}
                    {renderQueryBlock('Blocked Query (ตัวที่ถูกบล็อก)', blockedQuery)}
                </>
            )}

            {insight.type === 'slow_query' && (
                renderQueryBlock('Slow Query', slowQuery)
            )}
            
        </div>
      </div>
    </div>
  );
};