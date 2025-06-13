import React, { FC } from 'react';
import { Bot } from 'lucide-react';
import { PerformanceInsight } from '@/types/index';

interface PerformanceInsightsTableProps {
  insights: PerformanceInsight[] | { error: string };
  onAnalyze: (query: PerformanceInsight) => void;
}

export const PerformanceInsightsTable: FC<PerformanceInsightsTableProps> = ({ insights, onAnalyze }) => {
    if (typeof insights === 'object' && 'error' in insights) {
        return <div className="p-4 bg-amber-500/10 text-amber-300 rounded-lg text-sm">{insights.error}</div>;
    }
    if (!Array.isArray(insights) || insights.length === 0) {
        return <p className="text-slate-400 text-sm">No significant slow queries found. System looks healthy!</p>;
    }

    return (
        <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-400 uppercase">
                <tr>
                    <th scope="col" className="px-4 py-3">Query</th>
                    <th scope="col" className="px-4 py-3">Avg. Duration</th>
                    <th scope="col" className="px-4 py-3">Calls</th>
                    <th scope="col" className="px-4 py-3 text-center">Analyze</th>
                </tr>
            </thead>
            <tbody>
                {insights.map((q, index) => (
                    <tr key={index} className="border-b border-slate-700 hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-mono text-xs truncate max-w-lg" title={q.query}>{q.query}</td>
                        <td className="px-4 py-3 font-semibold text-amber-300">{q.duration} ms</td>
                        <td className="px-4 py-3">{q.count}</td>
                        <td className="px-4 py-3 text-center">
                            <button onClick={() => onAnalyze(q)} className="bg-sky-500/20 hover:bg-sky-500/40 text-sky-300 font-bold py-1 px-3 rounded-lg flex items-center mx-auto text-xs"> 
                                <Bot size={14} className="mr-1"/> AI 
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

