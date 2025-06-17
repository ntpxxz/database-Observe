import React, { FC } from 'react';
import { Bot, AlertCircle } from 'lucide-react';
import { PerformanceInsight } from '@/types/index';

interface PerformanceInsightsTableProps {
  insights: PerformanceInsight[] | { error: string } | undefined | null;
  onAnalyze: (query: PerformanceInsight) => void;
}

export const PerformanceInsightsTable: FC<PerformanceInsightsTableProps> = ({ insights, onAnalyze }) => {
    // Case 1: Handle loading or undefined state
    if (!insights) {
        return <p className="text-slate-500 text-sm text-center py-4">Loading performance data...</p>;
    }
    
    // Case 2: Handle error state (e.g., pg_stat_statements is not enabled)
    if (!Array.isArray(insights) && insights.error) {
        return (
            <div className="p-4 bg-amber-500/10 text-amber-300 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                {insights.error}
            </div>
        );
    }
    
    // Case 3: Handle empty data array
    if (!Array.isArray(insights) || insights.length === 0) {
        return <p className="text-slate-400 text-sm text-center py-4">No significant slow queries found. System looks healthy!</p>;
    }

    // Case 4: Render the table with data
    return (
        <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase">
                <tr>
                    <th scope="col" className="px-4 py-3 font-normal">Query</th>
                    <th scope="col" className="px-4 py-3 font-normal text-right">Avg. Duration (ms)</th>
                    <th scope="col" className="px-4 py-3 font-normal text-right">Calls</th>
                    <th scope="col" className="px-4 py-3 font-normal text-center">Analyze</th>
                </tr>
            </thead>
            <tbody>
                {insights.map((q) => (
                    // FIX: Use a stable and unique key from the data, not the array index.
                    <tr key={q.id} className="border-b border-slate-700/50 hover:bg-slate-800/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-300 truncate max-w-lg" title={q.query}>
                            {q.query}
                        </td>
                        <td className="px-4 py-3 font-semibold text-amber-300 text-right">
                            {q.duration}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-right">
                            {q.count.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                            <button 
                                onClick={() => onAnalyze(q)} 
                                className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 font-bold py-1 px-3 rounded-lg flex items-center mx-auto text-xs transition-colors"
                            > 
                                <Bot size={14} className="mr-1"/> AI 
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
