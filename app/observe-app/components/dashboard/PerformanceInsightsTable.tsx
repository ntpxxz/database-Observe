import React, { FC } from "react";
import {
  Bot,
  AlertCircle,
  TrendingUp,
  Lock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PerformanceInsight } from "@/types";
import { InsightDetailModal } from "./InsightDetailModal";
import { useState, useEffect } from "react";

interface PerformanceInsightsTableProps {
  insights: PerformanceInsight[] | { error: string } | undefined | null;
  serverName?: string; // Add server identifier to track changes
  isLoading?: boolean; // Add explicit loading state
}

// Helper component เพื่อแสดง Icon ตามประเภทของ Insight
const InsightIcon: FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case "slow_query":
      return (
        <TrendingUp size={16} className="text-orange-400 mr-2 flex-shrink-0" />
      );
    case "blocking_query":
      return <Lock size={16} className="text-red-400 mr-2 flex-shrink-0" />;
    default:
      return null;
  }
};

export const PerformanceInsightsTable: FC<PerformanceInsightsTableProps> = ({
  insights,
  serverName,
  isLoading = false,
}) => {
  const [selectedInsight, setSelectedInsight] =
    useState<PerformanceInsight | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 10;

  // Reset all state when server changes or insights change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedInsight(null); // Also reset selected insight
  }, [insights, serverName]); // Include serverName to detect server changes

  // Show loading state explicitly
  if (isLoading) {
    return (
      <div className="text-slate-500 text-sm text-center py-8">
        <div className="animate-pulse">Loading performance data...</div>
      </div>
    );
  }

  // Case 1: Handle loading or undefined state
  if (insights === undefined || insights === null) {
    return (
      <p className="text-slate-500 text-sm text-center py-4">
        No data available
      </p>
    );
  }

  // Case 2: Handle error state (e.g., pg_stat_statements is not enabled)
  if (!Array.isArray(insights) && "error" in insights) {
    return (
      <div className="p-4 bg-red-500/10 text-red-300 rounded-lg text-sm flex items-center gap-2">
        <AlertCircle size={16} />
        {insights.error}
      </div>
    );
  }

  // Case 3: Handle empty data array
  if (!Array.isArray(insights) || insights.length === 0) {
    return (
      <p className="text-slate-400 text-sm text-center py-4">
        No significant performance issues found. System looks healthy!
      </p>
    );
  }

  const totalPages = Math.ceil(insights.length / ROWS_PER_PAGE);
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const endIndex = startIndex + ROWS_PER_PAGE;
  const currentInsights = insights.slice(startIndex, endIndex);

  // Case 4: Render the table with data
  return (
    <>
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-normal">
              Query / Insight Title
            </th>
            <th scope="col" className="px-4 py-3 font-normal text-right">
              Avg. Duration (ms) / Wait (ms)
            </th>
            <th scope="col" className="px-4 py-3 font-normal text-right">
              Calls
            </th>
            <th scope="col" className="px-4 py-3 font-normal text-center">
              Analyze
            </th>
          </tr>
        </thead>
        <tbody>
          {currentInsights.map((insight) => {
            const queryText =
              insight.details?.query ||
              insight.details?.blocked_query ||
              insight.title ||
              "N/A";
            const duration = Math.round(
              insight.details?.mean_exec_time_ms ??
                insight.details?.wait_duration_ms ??
                -1
            );

            const callCount =
              insight.details?.calls ?? insight.details?.totalExecutions;

            return (
              <tr
                key={insight.id}
                className="border-b border-slate-700/50 hover:bg-slate-800/50 cursor-pointer"
                onClick={() => setSelectedInsight(insight)}
              >
                <td
                  className="px-4 py-3 font-mono text-xs text-slate-300 max-w-lg"
                  title={queryText}
                >
                  <div className="flex items-center">
                    <InsightIcon type={insight.type} />
                    <span className="truncate">{queryText}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-amber-300 text-right">
                  {duration !== -1 ? duration.toLocaleString() : "N/A"}
                </td>
                <td className="px-4 py-3 text-slate-400 text-right">
                  {callCount ? callCount.toLocaleString() : "N/A"}
                </td>
                <td className="px-4 py-3 text-center">
                  <button className="text-sky-300 font-bold py-1 px-3 rounded-lg flex items-center mx-auto text-xs">
                    View Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {/* Pagination */}
      <div className="flex justify-between items-center px-4 py-3 text-sm text-slate-400">
        <span>Total Insights: {insights.length.toLocaleString()}</span>
        <div className="flex items-center gap-4">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Modal */}
      {selectedInsight && (
        <InsightDetailModal
          insight={selectedInsight}
          onClose={() => setSelectedInsight(null)}
        />
      )}
    </>
  );
};