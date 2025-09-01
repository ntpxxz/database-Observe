import React, { FC, useState, useEffect, useMemo, JSX } from "react";
import {
  AlertCircle,
  TrendingUp,
  Lock,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Skull,
  Database,
  HelpCircle,
  Activity,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Search,
  X,
  Download,
  Play,
  Terminal,
  Bot,
} from "lucide-react";
import { PerformanceInsight } from "@/types";
import { InsightDetailModal } from "../modals/InsightDetailModal";

interface PerformanceInsightsTableProps {
  insights: any[];
  serverName?: string;
  isLoading?: boolean;
  onExecuteQuery?: (query: string) => Promise<any>;
  onAskAi?: (query: string) => Promise<void>;
}

type SortField = "type" | "query" | "duration" | "count" | "timestamp";
type SortDirection = "asc" | "desc";

interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

interface FilterConfig {
  type: string;
  search: string;
  minDuration: number;
  maxDuration: number;
  minCount: number;
  maxCount: number;
}

const InsightIcon: FC<{ type: string }> = ({ type }) => {
  const iconMap: Record<string, JSX.Element> = {
    slow_query: <TrendingUp size={16} className="text-orange-400 mr-2" />,
    long_running_query: (
      <Hourglass size={16} className="text-yellow-400 mr-2" />
    ),

    blocking_query: <Lock size={16} className="text-red-500 mr-2" />,
    deadlock_event: <Skull size={16} className="text-rose-500 mr-2" />,
    high_tempdb_usage: <Database size={16} className="text-cyan-400 mr-2" />,
    wait_stats: <Activity size={16} className="text-purple-400 mr-2" />,
    error: <AlertCircle size={16} className="text-red-400 mr-2" />,
    running_query: <Play size={16} className="text-green-400 mr-2" />,
  };
  return (
    iconMap[type] ?? <HelpCircle size={16} className="text-slate-500 mr-2" />
  );
};

const INSIGHT_TYPE_MAP: { [key: string]: string } = {
  slow_query: "Slow Query",
  blocking_query: "Blocking Query",
  long_running_query: "Long Running Query",
  deadlock_event: "Deadlock Event",
  high_tempdb_usage: "TempDB Usage",
  wait_stats: "Wait Statistics",
  running_query: "Running Query",
  error: "Error",
};

const truncateText = (text: string, maxLength: number): string =>
  !text || text.length <= maxLength
    ? text
    : text.substring(0, maxLength).trim() + "...";

// Helper function to extract query text from insight object
const extractQueryText = (insight: any): string => {
  const possibleQueryFields = [
    insight.query_text,
    insight.query,
    insight.blocking_query,
    insight.query_1,
    insight.wait_type,
    insight.sql_text,
    insight.statement_text,
    insight.command_text,
    insight.title,
    insight.description,
    insight.message,
    insight.details?.query_text,
    insight.details?.query,
    insight.details?.blocking_query,
    insight.details?.query_1,
    insight.details?.wait_type,
    insight.details?.sql_text,
    insight.details?.statement_text,
    insight.details?.command_text,
  ];

  for (const field of possibleQueryFields) {
    if (field && typeof field === "string" && field.trim() !== "") {
      return field;
    }
  }

  return "[Query not available]";
};

function getNumericValue(insight: any, key: string): number {
  if (!insight || typeof insight !== "object") return 0;
  const numericFallbacks: Record<string, string[]> = {
    duration: [
      "details.mean_exec_time_ms",
      "mean_exec_time_ms",
      "avg_duration_ms",
      "duration_ms",
      "execution_time_ms",
      "wait_time_ms",
      "elapsed_time_ms",
      "details.avg_duration_ms",
      "details.duration_ms",
      "details.mean_exec_time_ms",
    ],

    count: ["execution_count", "count", "calls", "details.execution_count"],
    cpu_time: ["cpu_time", "details.cpu_time"],
    wait_time: ["wait_time_ms", "wait_time", "details.wait_time_ms"],
    logical_reads: ["logical_reads", "details.logical_reads"],
  };

  // Direct check
  const directValue = insight?.[key];
  if (typeof directValue === "number") return directValue;
  if (typeof directValue === "string" && !isNaN(Number(directValue)))
    return Number(directValue);

  // Fallback lookup
  const fallbackKeys = numericFallbacks[key];
  if (fallbackKeys && Array.isArray(fallbackKeys)) {
    for (const path of fallbackKeys) {
      const value = path.split(".").reduce((obj, part) => obj?.[part], insight);
      if (typeof value === "number") return value;
      if (typeof value === "string" && !isNaN(Number(value)))
        return Number(value);
    }
  }

  return 0;
}

// CSV Export function
const exportToCSV = (
  insights: any[],
  filename: string = "performance_insights.csv"
) => {
  const headers = [
    "Type",
    "Query/Description",
    "Duration (ms)",
    "Count/Calls",
    "Session ID",
    "Timestamp",
    "Wait Type",
    "CPU Time",
    "Logical Reads",
  ];

  const csvContent = [
    headers.join(","),
    ...insights.map((insight) => {
      const queryText = extractQueryText(insight).replace(/"/g, '""');
      const duration = getNumericValue(insight, "duration");
      const count = getNumericValue(insight, "count");
      const sessionId = insight.session_id ?? insight.spid ?? "N/A";
      const timestamp =
        insight.timestamp ?? insight.start_time ?? new Date().toISOString();
      const waitType = insight.wait_type ?? "N/A";
      const cpuTime = insight.cpu_time ?? insight.details?.cpu_time ?? 0;
      const logicalReads =
        insight.logical_reads ?? insight.details?.logical_reads ?? 0;

      return [
        `"${INSIGHT_TYPE_MAP[insight.type] || insight.type || "Query"}"`,
        `"${queryText}"`,
        duration,
        count,
        sessionId,
        timestamp,
        `"${waitType}"`,
        cpuTime,
        logicalReads,
      ].join(",");
    }),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const PerformanceInsightsTable: FC<PerformanceInsightsTableProps> = ({
  insights,
  serverName,
  isLoading = false,
  onExecuteQuery,
  onAskAi,
}) => {
  const [selectedInsight, setSelectedInsight] =
    useState<PerformanceInsight | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showManualQuery, setShowManualQuery] = useState(false);
  const [manualQuery, setManualQuery] = useState("");
  const [queryResult, setQueryResult] = useState<unknown>(null);
  const [isExecutingQuery, setIsExecutingQuery] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const ROWS_PER_PAGE = 10;
  const normalizedInsights = useMemo(() => {
    return Array.isArray(insights) ? insights : [];
  }, [insights]); // insights เป็น dependency ถ้า insights เปลี่ยน normalizedInsights จะถูกคำนวณใหม่

  // Sort configuration
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "duration",
    direction: "desc",
  });

  // Filter configuration
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    type: "all",
    search: "",
    minDuration: 0,
    maxDuration: Number.MAX_VALUE,
    minCount: 0,
    maxCount: Number.MAX_VALUE,
  });

  // Get unique types for filter dropdown
  const availableTypes = useMemo(() => {
    const types = new Set(
      normalizedInsights.map((insight) => insight.type || "query")
    );
    return Array.from(types);
  }, [normalizedInsights]);

  // Apply filters and sorting
  const filteredAndSortedInsights = useMemo(() => {
    const filtered = normalizedInsights.filter((insight) => {
      // Type filter
      if (filterConfig.type !== "all" && insight.type !== filterConfig.type) {
        return false;
      }

      // Search filter
      if (filterConfig.search) {
        const queryText = extractQueryText(insight).toLowerCase();
        const searchTerm = filterConfig.search.toLowerCase();
        if (!queryText.includes(searchTerm)) {
          return false;
        }
      }

      // Duration filter
      const duration = getNumericValue(insight, "duration");
      if (
        duration < filterConfig.minDuration ||
        duration > filterConfig.maxDuration
      ) {
        return false;
      }

      // Count filter
      const count = getNumericValue(insight, "count");
      if (count < filterConfig.minCount || count > filterConfig.maxCount) {
        return false;
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: unknown, bValue: unknown;

      switch (sortConfig.field) {
        case "type":
          aValue = a.type || "query";
          bValue = b.type || "query";
          break;
        case "query":
          aValue = extractQueryText(a)?.toLowerCase?.() || "";
          bValue = extractQueryText(b)?.toLowerCase?.() || "";
          break;
        case "duration":
          aValue = getNumericValue(a, "duration");
          bValue = getNumericValue(b, "duration");
          break;
        case "count":
          aValue = getNumericValue(a, "count");
          bValue = getNumericValue(b, "count");
          break;
        case "timestamp":
          aValue = new Date(
            a.timestamp || a.start_time || "1970-01-01"
          ).getTime();
          bValue = new Date(
            b.timestamp || b.start_time || "1970-01-01"
          ).getTime();
          break;
        default:
          return 0;
      }

      // Robust sorting logic
      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortConfig.direction === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        const aNum = typeof aValue === "number" ? aValue : 0;
        const bNum = typeof bValue === "number" ? bValue : 0;
        return sortConfig.direction === "asc" ? aNum - bNum : bNum - aNum;
      }
    });

    return filtered;
  }, [normalizedInsights, filterConfig, sortConfig]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedInsight(null);
  }, [filteredAndSortedInsights, serverName]);

  console.log("Filtered length:", filteredAndSortedInsights.length);

  // Handle sorting
  const handleSort = (field: SortField) => {
    setSortConfig((prev) => ({
      field,
      direction:
        prev.field === field && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  // Handle Execute session

  const handleExecuteQuery = async () => {
    if (!onExecuteQuery || !manualQuery.trim()) {
      
      return;    }

    try {
      setIsExecutingQuery(true);
      const result = await onExecuteQuery(manualQuery);
      setQueryResult(result);
    } catch (error) {
      console.error('Error executing query:', error);
      setQueryResult({ error: String(error) });
    } finally {
      setIsExecutingQuery(false);
    }
  };

  const handleAskAi = async (query: string) => {
    setLoadingSuggestion(true);
    try {
      const res = await fetch("/api/sql-ai-optimize/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setAiSuggestion(data.suggestion);
    } catch (error: unknown) {
      console.error("Error fetching AI suggestion:", error);
      setAiSuggestion("Failed to fetch suggestion.");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown size={14} className="text-slate-500" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp size={14} className="text-blue-400" />
    ) : (
      <ArrowDown size={14} className="text-blue-400" />
    );
  };

  if (isLoading) {
    return (
      <div className="text-slate-500 text-sm text-center py-8 animate-pulse">
        Loading performance data...
      </div>
    );
  }

  if (!insights) {
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
        {insights}
      </div>
    );
  }

  if (!normalizedInsights || normalizedInsights.length === 0) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-green-500/10 text-green-300 rounded-lg text-sm">
          <p>No significant performance issues found. System looks healthy!</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(
    filteredAndSortedInsights.length / ROWS_PER_PAGE
  );
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const currentInsights = filteredAndSortedInsights.slice(
    startIndex,
    startIndex + ROWS_PER_PAGE
  );

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showFilters
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/50"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            <Filter size={16} />
            Filters
          </button>

          <button
            onClick={() => setShowManualQuery(!showManualQuery)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              showManualQuery
                ? "bg-green-500/20 text-green-300 border border-green-500/50"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            }`}
          >
            <Terminal size={16} />
            Manual Query
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => exportToCSV(filteredAndSortedInsights)}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Type
              </label>
              <select
                value={filterConfig.type}
                onChange={(e) =>
                  setFilterConfig((prev) => ({ ...prev, type: e.target.value }))
                }
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
              >
                <option value="all">All Types</option>
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {INSIGHT_TYPE_MAP[type] || type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Search Query
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  placeholder="Search in queries..."
                  value={filterConfig.search}
                  onChange={(e) =>
                    setFilterConfig((prev) => ({
                      ...prev,
                      search: e.target.value,
                    }))
                  }
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-3 py-2 text-sm text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Min Duration (ms)
              </label>
              <input
                type="number"
                value={filterConfig.minDuration}
                onChange={(e) =>
                  setFilterConfig((prev) => ({
                    ...prev,
                    minDuration: Number(e.target.value),
                  }))
                }
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">
              Showing {filteredAndSortedInsights.length} of{" "}
              {normalizedInsights.length} insights
            </span>
            <button
              onClick={() =>
                setFilterConfig({
                  type: "all",
                  search: "",
                  minDuration: 0,
                  maxDuration: 999999,
                  minCount: 0,
                  maxCount: 999999,
                })
              }
              className="flex items-center gap-2 px-3 py-1 bg-slate-600 hover:bg-slate-500 text-slate-200 rounded text-sm transition-colors"
            >
              <X size={14} />
              Clear Filters
            </button>
          </div>
        </div>
      )}

      {showManualQuery && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 space-y-4">
          {/* Query Input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              SQL Query
            </label>
            <textarea
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Enter your SQL query here..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono"
              rows={4}
            />
          </div>

          {/* Execute Button */}
          <div className="flex gap-2">
            <button
              onClick={handleExecuteQuery}
              disabled={isExecutingQuery || !manualQuery.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isExecutingQuery ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Executing...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Execute Query
                </>
              )}
            </button>
          </div>

          {/* Query Result */}
          {queryResult !== null && queryResult !== undefined && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-slate-300 mb-2">
                Query Result:
              </h4>
              <pre className="bg-slate-900 border border-slate-600 rounded-lg p-3 text-xs text-slate-200 overflow-auto max-h-60 whitespace-pre-wrap">
                {(() => {
                  try {
                    if (
                      typeof queryResult === "object" &&
                      queryResult !== null &&
                      "error" in queryResult
                    ) {
                      const errorMessage = (queryResult as any).error;
                      return (
                        <span className="text-red-300">
                          {typeof errorMessage === "string"
                            ? errorMessage
                            : JSON.stringify(errorMessage, null, 2)}
                        </span>
                      );
                    }

                    // JSON.stringify ปกติ
                    return JSON.stringify(queryResult, null, 2);
                  } catch (e) {
                    return (
                      <span className="text-red-300">
                        Failed to render result: {(e as Error).message}
                      </span>
                    );
                  }
                })()}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-400 uppercase bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 font-normal">
                <button
                  onClick={() => handleSort("type")}
                  className="flex items-center gap-1 hover:text-slate-200 transition-colors"
                >
                  Type
                  {renderSortIcon("type")}
                </button>
              </th>
              <th className="px-4 py-3 font-normal">
                <button
                  onClick={() => handleSort("query")}
                  className="flex items-center gap-1 hover:text-slate-200 transition-colors"
                >
                  Query / Insight Title
                  {renderSortIcon("query")}
                </button>
              </th>
              <th className="px-4 py-3 font-normal text-right">
                <button
                  onClick={() => handleSort("duration")}
                  className="flex items-center gap-1 hover:text-slate-200 transition-colors ml-auto"
                >
                  Duration (ms)
                  {renderSortIcon("duration")}
                </button>
              </th>
              <th className="px-4 py-3 font-normal text-right">
                <button
                  onClick={() => handleSort("count")}
                  className="flex items-center gap-1 hover:text-slate-200 transition-colors ml-auto"
                >
                  Count / Calls
                  {renderSortIcon("count")}
                </button>
              </th>
              <th className="px-4 py-3 font-normal text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentInsights.map((insight, index) => {
              // รวบรวมค่าที่เป็นไปได้ทั้งหมดสำหรับ ID ที่ไม่ซ้ำกัน
              const potentialIds = [
                insight.id,
                insight.session_id,
                insight.spid,
              ];

              // ค้นหา ID ที่ไม่ซ้ำกันและถูกต้องตัวแรก โดยกรองค่าที่ไม่พึงประสงค์ออก
              const foundUniqueId = potentialIds.find(
                (id) =>
                  id !== null &&
                  id !== undefined &&
                  id !== "" && // กรองสตริงว่างออก
                  String(id).trim().toLowerCase() !== "n/a" // กรอง "n/a" ทุกรูปแบบ
              );

              // ใช้ ID ที่พบ หรือ fallback ไปใช้ index หากไม่มี ID ที่ถูกต้อง
              const insightId = foundUniqueId
                ? String(foundUniqueId)
                : `insight-${index}`;
              const displayType =
                INSIGHT_TYPE_MAP[insight.type] || insight.type || "Query";
              const queryText = extractQueryText(insight);
              const timeValue = getNumericValue(insight, "duration");
              const durationDisplay =
                typeof timeValue === "number" && timeValue > 1000
                  ? `${(timeValue / 1000).toFixed(2)}s`
                  : `${timeValue}ms`;
              const callCount = getNumericValue(insight, "count");

              return (
                <tr
                  key={insightId}
                  className="border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center text-slate-300 whitespace-nowrap">
                      <InsightIcon type={insight.type || "query"} />
                      {displayType}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3 font-mono text-xs text-slate-300 max-w-md"
                    title={queryText}
                  >
                    {truncateText(queryText, 100)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-amber-300 text-right">
                    {durationDisplay}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-right">
                    {typeof callCount === "number"
                      ? callCount.toLocaleString()
                      : callCount}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          const extracted = extractQueryText(insight);
                          console.log("Sending to AI:", extracted);
                          onAskAi?.(extracted);
                        }}
                        className="text-xs text-green-500 hover:text-sky-200 font-medium py-1 px-2 rounded text-xs hover:bg-sky-500/10 transition-colors"
                      >
                        <Bot />
                      </button>
                      <button
                        onClick={() => {
                          console.log("Selected insight:", insight);
                          setSelectedInsight(insight);
                        }}
                        className="text-sky-300 hover:text-sky-200 font-medium py-1 px-2 rounded text-xs hover:bg-sky-500/10 transition-colors"
                      >
                        Details
                      </button>
                    
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex justify-between items-center px-4 py-3 text-sm text-slate-400 bg-slate-900/30">
          <span>
            Showing {startIndex + 1}-
            {Math.min(
              startIndex + ROWS_PER_PAGE,
              filteredAndSortedInsights.length
            )}{" "}
            of {filteredAndSortedInsights.length} insights
          </span>
          <div className="flex items-center gap-4">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedInsight && (
        <InsightDetailModal
          insight={selectedInsight}
          onClose={() => setSelectedInsight(null)}
          onAskAi={handleAskAi}
          aiSuggestion={aiSuggestion}
          loadingSuggestion={loadingSuggestion}
        />
      )}
    </div>
  );
};
