import React, { FC, useState, useEffect } from "react";
import {
  AlertCircle,
  TrendingUp,
  Lock,
  ChevronLeft,
  ChevronRight,
  // เพิ่ม imports สำหรับ icon ใหม่
  Hourglass,
  Skull,
  Database,
  HelpCircle,
} from "lucide-react";
import { PerformanceInsight } from "@/types";
import { InsightDetailModal } from "./InsightDetailModal";

interface PerformanceInsightsTableProps {
  insights: PerformanceInsight[] | { error: string } | undefined | null;
  serverName?: string;
  isLoading?: boolean;
}

// 1. อัปเดต Icon ให้รองรับ Insight ประเภทใหม่ๆ
const InsightIcon: FC<{ type: string }> = ({ type }) => {
  switch (type) {
    case "slow_query":
      return (
        <TrendingUp size={16} className="text-orange-400 mr-2 flex-shrink-0" />
      );
    case "long_running_query":
      return (
        <Hourglass size={16} className="text-yellow-400 mr-2 flex-shrink-0" />
      );
    case "blocking_query":
      return <Lock size={16} className="text-red-500 mr-2 flex-shrink-0" />;
    case "deadlock_event":
      return <Skull size={16} className="text-rose-500 mr-2 flex-shrink-0" />;
    case "high_tempdb_usage":
      return (
        <Database size={16} className="text-cyan-400 mr-2 flex-shrink-0" />
      );
    case "error":
      return (
        <AlertCircle size={16} className="text-red-400 mr-2 flex-shrink-0" />
      );
    default:
      return (
        <HelpCircle size={16} className="text-slate-500 mr-2 flex-shrink-0" />
      );
  }
};

// 2. สร้าง Mapping เพื่อแสดงชื่อประเภทที่สวยงามและอ่านง่าย
const INSIGHT_TYPE_MAP: { [key: string]: string } = {
  slow_query: "Slow Query",
  blocking_query: "Blocking",
  long_running_query: "Long Running",
  deadlock_event: "Deadlock",
  high_tempdb_usage: "TempDB Usage",
  error: "Error",
};
const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength).trim() + "...";
};

export const PerformanceInsightsTable: FC<PerformanceInsightsTableProps> = ({
  insights,
  serverName,
  isLoading = false,
}) => {
  console.log("[PerformanceInsightsTable] Rendering insights:", insights);
  const [selectedInsight, setSelectedInsight] =
    useState<PerformanceInsight | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 10;

  useEffect(() => {
    setCurrentPage(1);
    setSelectedInsight(null);
  }, [insights, serverName]);

  if (isLoading) {
    return (
      <div className="text-slate-500 text-sm text-center py-8">
        <div className="animate-pulse">Loading performance data...</div>
      </div>
    );
  }

  if (insights === undefined || insights === null) {
    return (
      <p className="text-slate-500 text-sm text-center py-4">
        No data available
      </p>
    );
  }

  if (!Array.isArray(insights) && "error" in insights) {
    return (
      <div className="p-4 bg-red-500/10 text-red-300 rounded-lg text-sm flex items-center gap-2">
        <AlertCircle size={16} />
        {insights.error}
      </div>
    );
  }

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

  return (
    <>
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-slate-500 uppercase">
          <tr>
            <th scope="col" className="px-4 py-3 font-normal">
              Type
            </th>
            <th scope="col" className="px-4 py-3 font-normal">
              Query / Insight Title
            </th>
            <th scope="col" className="px-4 py-3 font-normal text-right">
              Avg. Duration (s) / Wait (s)
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
            // --- [แก้ไข] Logic ทั้งหมดด้านล่างนี้ ---

            const displayType = INSIGHT_TYPE_MAP[insight.type] || "Unknown";

            const queryText =
              insight.details?.query ||
              insight.details?.query_text ||
              insight.details?.blocking_query ||
              insight.details?.query_1 ||
              insight.title ||
              "N/A";

            // 1. รวมค่าเวลาทั้งหมด (หน่วยเป็น ms หรือ µs) มาไว้ในตัวแปรเดียว
            const timeValueInMs =
              insight.details?.mean_exec_time_ms ??            
              insight.details?.total_elapsed_time ??
              insight.details?.wait_duration_ms ??
              null; 


            // 2. คำนวณและจัดรูปแบบในตัวแปรเดียว
            const durationDisplay =
              timeValueInMs !== null
                ? (timeValueInMs / 1000).toFixed(2) // แปลง ms -> s และจัดรูปแบบทศนิยม 2 ตำแหน่ง
                : "N/A"; 

            const callCount = insight.details?.calls;

            return (
              <tr
                key={insight.id}
                className="border-b border-slate-700/50 hover:bg-slate-800/50 cursor-pointer"
                onClick={() => setSelectedInsight(insight)}
              >
                {/* คอลัมน์ที่ 1: Type */}
                <td className="px-4 py-3">
                  <div className="flex items-center text-slate-300 whitespace-nowrap">
                    <InsightIcon type={insight.type} />
                    <span>{displayType}</span>
                  </div>
                </td>
                {/* คอลัมน์ที่ 2: Query / Insight Title */}
                <td
                  className="px-4 py-3 font-mono text-xs text-slate-300 max-w-md"
                  title={queryText}
                >
                  <span>{truncateText(queryText, 100)}</span>
                </td>
                {/* คอลัมน์ที่ 3: Duration */}
                <td className="px-4 py-3 font-semibold text-amber-300 text-right">
                  {durationDisplay}
                </td>
                {/* คอลัมน์ที่ 4: Calls */}
                <td className="px-4 py-3 text-slate-400 text-right">
                  {callCount ? callCount.toLocaleString() : "N/A"}
                </td>
                {/* คอลัมน์ที่ 5: Analyze Button */}
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

      {selectedInsight && (
        <InsightDetailModal
          insight={selectedInsight}
          onClose={() => setSelectedInsight(null)}
        />
      )}
    </>
  );
};
