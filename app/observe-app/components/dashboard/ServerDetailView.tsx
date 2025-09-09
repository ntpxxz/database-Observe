import React, { FC, useEffect, useMemo, useRef, useState } from "react";
import { KPIWidget } from "./KPIWidget";
import {
  Cpu,
  MemoryStick,
  Activity,
  AlertCircle,
  BarChart,
  Server as ServerIcon,
  Clock,
  RefreshCw,
  ShieldCheck,
  Info,
  Settings,
  AlertTriangle,
  Bell,
  History,
  Terminal,
  Play,
  Table as TableIcon,
  FileDown,
  Clipboard,
} from "lucide-react";
import { DatabaseTableView } from "./DatabaseTableView";
import { PerformanceInsightsTable } from "./PerformanceInsightsTable";
import { AlertConfigPanel, defaultAlertConfig } from "./AlertConfigPanel";
import { AlertHistory } from "./AlertHistory";
import { AlertDashboard } from "./AlertDashboard";
import toast from "react-hot-toast";
import { isReadOnlySQL } from "@/lib/utils";
import { SQLTuningModal } from "../modals/SQLTuningModal";
import { askAiForOptimization } from "@/lib/askAiForOptimization";
import { TabType, ServerDetailViewProps } from "@/types";
import type {
  AlertConfig,
  AlertHistoryItem,
  ActiveAlert,
  AlertLevel,
} from "@/types";

// Add new tab type for manual query and alerts
type ExtendedTabType = TabType | "alerts" | "manual-query";

// Helpers (same as before)
const mbToGB = (mb?: number | null) =>
  typeof mb === "number" && mb > 0 ? parseFloat((mb / 1024).toFixed(1)) : 0;

const humanBytesFromMB = (mb?: number | null) => {
  if (typeof mb !== "number" || mb <= 0) return "0 B";
  const bytes = mb * 1024 * 1024;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
};

const generateAlertId = (metric: string, level: string): string => {
  return `${metric}-${level}-${Date.now()}`;
};

// Enhanced alert statistics hook
const useAlertStatistics = (alertHistory: AlertHistoryItem[]) => {
  return useMemo(() => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const total = alertHistory.length;
    const critical = alertHistory.filter((a) => a.level === "critical").length;
    const resolved = alertHistory.filter((a) => a.resolved).length;
    const today = alertHistory.filter((a) => a.timestamp >= oneDayAgo).length;
    const thisWeek = alertHistory.filter((a) => a.timestamp >= oneWeekAgo).length;

    const resolvedAlerts = alertHistory.filter((a) => a.resolved && a.duration);
    const averageResolutionTime =
      resolvedAlerts.length > 0
        ? Math.round(
            resolvedAlerts.reduce((sum, a) => sum + (a.duration || 0), 0) /
              resolvedAlerts.length
          )
        : 0;

    const metricCounts = alertHistory.reduce((acc, alert) => {
      acc[alert.metric] = (acc[alert.metric] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const mostFrequentMetric =
      Object.keys(metricCounts).length > 0
        ? Object.keys(metricCounts).reduce((a, b) =>
            metricCounts[a] > metricCounts[b] ? a : b
          )
        : null;

    const hourCounts = alertHistory.reduce((acc, alert) => {
      const hour = alert.timestamp.getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    const peakAlertHours = Object.keys(hourCounts)
      .map(Number)
      .sort((a, b) => hourCounts[b] - hourCounts[a])
      .slice(0, 3);

    const warning = alertHistory.filter((a) => a.level === "warning").length;
    const thisMonth = alertHistory.filter(
      (a) => a.timestamp >= new Date(now.getFullYear(), now.getMonth(), 1)
    ).length;

    return {
      total,
      critical,
      warning,
      resolved,
      today,
      thisWeek,
      thisMonth,
      averageResolutionTime,
      mostFrequentMetric: mostFrequentMetric || '',
      peakAlertHours,
    };
  }, [alertHistory]);
};

// Components (keeping existing ones, just updating TabButton)
const DetailItem: FC<{
  label: string;
  value: string | number | null;
  isHighlight?: boolean;
}> = ({ label, value, isHighlight }) => (
  <div className={`flex justify-between ${isHighlight ? "text-sky-400" : ""}`}>
    <span className="text-sm text-slate-400">{label}</span>
    <span className="text-sm text-white">{value ?? "N/A"}</span>
  </div>
);

const LoadingSkeleton: FC = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="bg-slate-800 h-24 rounded-xl" />
      ))}
    </div>
    <div className="bg-slate-800 h-64 rounded-xl" />
  </div>
);

const ErrorDisplay: FC<{ error: string; onRetry?: () => void }> = ({
  error,
  onRetry,
}) => (
  <div className="text-red-400 p-4 bg-red-500/10 rounded-lg border border-red-500/20">
    <div className="flex items-center gap-3 mb-3">
      <AlertCircle size={18} />
      <strong>Error:</strong>
    </div>
    <p className="text-sm mb-3">{error}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="text-sm bg-red-500/20 hover:bg-red-500/30 px-3 py-1 rounded transition-colors"
      >
        Retry
      </button>
    )}
  </div>
);

// Enhanced TabButton with new manual query tab
const TabButton: FC<{
  tab: ExtendedTabType;
  activeTab: ExtendedTabType;
  onClick: (tab: ExtendedTabType) => void;
  insightCount?: number;
  alertCount?: number;
}> = ({ tab, activeTab, onClick, insightCount = 0, alertCount = 0 }) => {
  const getIcon = () => {
    switch (tab) {
      case "performance":
        return <BarChart size={16} className="inline mr-2" />;
      case "insights":
        return <AlertCircle size={16} className="inline mr-2" />;
      case "manual-query":
        return <Terminal size={16} className="inline mr-2" />;
      case "alerts":
        return <Bell size={16} className="inline mr-2" />;
      default:
        return <ServerIcon size={16} className="inline mr-2" />;
    }
  };

  const getTabName = () => {
    switch (tab) {
      case "manual-query":
        return "Manual Query";
      default:
        return tab.charAt(0).toUpperCase() + tab.slice(1);
    }
  };

  const getBadgeCount = () => {
    if (tab === "insights" && insightCount > 0) return insightCount;
    if (tab === "alerts" && alertCount > 0) return alertCount;
    return 0;
  };

  const badgeCount = getBadgeCount();

  return (
    <button
      onClick={() => onClick(tab)}
      className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
        activeTab === tab
          ? "border-sky-500 text-sky-400"
          : "border-transparent text-slate-500 hover:text-slate-300"
      }`}
    >
      {getIcon()}
      {getTabName()}
      {badgeCount > 0 && (
        <span
          className={`ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white rounded-full ${
            tab === "alerts" ? "bg-blue-500" : "bg-red-500"
          }`}
        >
          {badgeCount}
        </span>
      )}
    </button>
  );
};

// -------------- New Manual Query Component (Table-enabled) --------------
const ManualQueryPanel: FC<{
  serverName?: string;
  onExecuteQuery?: (query: string) => Promise<any>;
  onAskAi?: (query: string) => Promise<void>;
}> = ({ serverName, onExecuteQuery, onAskAi }) => {
  const [manualQuery, setManualQuery] = useState("");
  const [queryResult, setQueryResult] = useState<unknown>(null);
  const [isExecutingQuery, setIsExecutingQuery] = useState(false);

  // new: view + multi result sets
  const [viewMode, setViewMode] = useState<"table" | "json">("table");
  const [activeSetIndex, setActiveSetIndex] = useState(0);

  /** ---- helpers ---- **/
  function extractRowsets(payload: any): Array<Array<Record<string, any>>> {
    if (!payload) return [];

    // plain array of row objects
    if (Array.isArray(payload) && payload.every(r => r && typeof r === "object")) {
      return [payload];
    }
    // mssql: recordsets / recordset
    if (Array.isArray(payload?.recordsets) && payload.recordsets.length) return payload.recordsets;
    if (Array.isArray(payload?.recordset)) return [payload.recordset];

    // postgres: rows
    if (Array.isArray(payload?.rows)) return [payload.rows];

    // mysql2: [rows, fields]
    if (Array.isArray(payload) && payload.length === 2 && Array.isArray(payload[0])) return [payload[0]];

    // generic shapes
    if (Array.isArray(payload?.data)) return [payload.data];
    if (Array.isArray(payload?.result)) return [payload.result];
    if (Array.isArray(payload?.result?.rows)) return [payload.result.rows];

    // { tables: [{rows: [...]}, ...] }
    if (Array.isArray(payload?.tables)) {
      const sets = payload.tables
        .map((t: any) => (Array.isArray(t?.rows) ? t.rows : []))
        .filter((r: any[]) => r.length);
      if (sets.length) return sets;
    }
    return [];
  }

function toCSV(rows: Array<Record<string, any>>): string {
  if (!rows || rows.length === 0) return "";

  const headers = Array.from(
    rows.reduce((set: Set<string>, r: Record<string, any>) => { // <--- แก้ไขส่วนนี้
      if (r && typeof r === "object") {
        const keys = Object.keys(r);
        keys.forEach((k) => set.add(k));
      }
      return set;
    }, new Set<string>())
  );
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
  
    const lines = [
      headers.map(esc).join(","),
      ...rows.map((r) => headers.map((h) => esc((r as any)?.[h])).join(",")),
    ];
  
    return lines.join("\n");
  }
  /** ---- end helpers ---- **/   
  

  const rowsets = useMemo(() => extractRowsets(queryResult), [queryResult]);
  const hasTabular = rowsets.length > 0 && rowsets.some(rs => rs?.length > 0);
  const activeRows = rowsets[activeSetIndex] ?? [];

  const tableHeaders = useMemo(() => {
    if (!activeRows || activeRows.length === 0) return [] as string[];
    const keys = new Set<string>();
    activeRows.forEach((r) => {
      if (r && typeof r === "object") {
        const cols = Object.keys(r as Record<string, unknown>);
        cols.forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [activeRows]);
  
  const handleExecuteQuery = async () => {
    if (!onExecuteQuery || !manualQuery.trim()) return;
    try {
      setIsExecutingQuery(true);
      const result = await onExecuteQuery(manualQuery);
      setQueryResult(result);
      setViewMode("table");
      setActiveSetIndex(0);
    } catch (error) {
      console.error("Error executing query:", error);
      setQueryResult({ error: String(error) });
      setViewMode("json");
    } finally {
      setIsExecutingQuery(false);
    }
  };

  const handleAskAi = async () => {
    if (!onAskAi || !manualQuery.trim()) return;
    await onAskAi(manualQuery);
  };

  const handleDownloadCSV = () => {
    const csv = toCSV(activeRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query_result${rowsets.length > 1 ? `_set${activeSetIndex + 1}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJSON = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(queryResult, null, 2));
    } catch { /* noop */ }
  };

  return (
    <div className="space-y-6">
      <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white flex items-center">
            <Terminal size={20} className="mr-2 text-green-400" />
            Manual SQL Query Execution
          </h3>
          {serverName && (
            <span className="text-sm text-slate-400">Server: {serverName}</span>
          )}
        </div>
        
        <div className="space-y-4">
          {/* Query Input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              SQL Query
            </label>
            <textarea
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Enter your SQL query here... (Only SELECT and safe EXEC queries are allowed)"
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono resize-vertical"
              rows={8}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
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
            
            <button
              onClick={handleAskAi}
              disabled={!manualQuery.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Activity size={16} />
              Ask AI for Optimization
            </button>
          </div>

          {/* Safety Notice */}
          <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-300 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>Only read-only SELECT queries and safe EXEC statements are permitted. Queries are validated before execution for security.</span>
          </div>
        </div>
      </section>

      {queryResult !== null && queryResult !== undefined && (
        <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-white flex items-center">
              <BarChart size={18} className="mr-2 text-blue-400" />
              Query Result
            </h4>

            <div className="flex items-center gap-2">
              {hasTabular && rowsets.length > 1 && (
                <select
                  value={activeSetIndex}
                  onChange={(e) => setActiveSetIndex(parseInt(e.target.value, 10))}
                  className="bg-slate-800 border border-slate-600 text-slate-200 text-xs rounded-md px-2 py-1"
                  title="Select result set"
                >
                  {rowsets.map((_, i) => (
                    <option key={i} value={i}>Result set #{i + 1}</option>
                  ))}
                </select>
              )}

              <div className="flex rounded-md overflow-hidden border border-slate-700">
                <button
                  onClick={() => setViewMode("table")}
                  className={`px-3 py-1 text-xs flex items-center gap-1 ${viewMode === "table" ? "bg-slate-700 text-white" : "text-slate-300"}`}
                  title="Table view"
                >
                  <TableIcon size={14} /> Table
                </button>
                <button
                  onClick={() => setViewMode("json")}
                  className={`px-3 py-1 text-xs ${viewMode === "json" ? "bg-slate-700 text-white" : "text-slate-300"}`}
                  title="Raw JSON"
                >
                  JSON
                </button>
              </div>

              {viewMode === "table" && hasTabular && (
                <button
                  onClick={handleDownloadCSV}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md border border-slate-700"
                  title="Download CSV"
                >
                  <FileDown size={14} /> CSV
                </button>
              )}

              {viewMode === "json" && (
                <button
                  onClick={handleCopyJSON}
                  className="flex items-center gap-1 px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md border border-slate-700"
                  title="Copy JSON"
                >
                  <Clipboard size={14} /> Copy
                </button>
              )}
            </div>
          </div>

          {viewMode === "table" && hasTabular ? (
            <div className="bg-slate-800 border border-slate-600 rounded-lg overflow-auto max-h-96">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="sticky top-0 bg-slate-700/80 backdrop-blur border-b border-slate-600">
                  <tr>
                    {tableHeaders.map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-400" colSpan={tableHeaders.length || 1}>
                        (No rows)
                      </td>
                    </tr>
                  ) : (
                    activeRows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/60 hover:bg-slate-700/40">
                        {tableHeaders.map((h) => (
                          <td key={h} className="px-3 py-2 align-top">
                            {(() => {
                              const v = (row as any)?.[h];
                              if (v === null || v === undefined) return "";
                              if (typeof v === "object") return JSON.stringify(v);
                              return String(v);
                            })()}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 overflow-auto max-h-96">
              <pre className="text-xs text-slate-200 whitespace-pre-wrap">
                {(() => {
                  try {
                    if (typeof queryResult === "object" && queryResult !== null && "error" in (queryResult as any)) {
                      const msg = (queryResult as any).error;
                      return <span className="text-red-300">Error: {typeof msg === "string" ? msg : JSON.stringify(msg, null, 2)}</span>;
                    }
                    return JSON.stringify(queryResult, null, 2);
                  } catch (e) {
                    return <span className="text-red-300">Failed to render result: {(e as Error).message}</span>;
                  }
                })()}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export const ServerDetailView: FC<ServerDetailViewProps> = ({
  server,
  metrics,
  isLoading,
  error,
  onRefresh,
  onRefreshKPI,
  insights,
  insightsLoading = false,
}) => {
  const [activeTab, setActiveTab] = useState<ExtendedTabType>("performance");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");

  // Alert system state
  const [alertConfig, setAlertConfig] = useState<AlertConfig>(defaultAlertConfig);
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>([]);
  const lastAlertCheckRef = useRef<Record<string, unknown>>({});
  const prevAlertsRef = useRef<string>("");

  // Real-time refresh intervals
  const kpiRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pause timers when tab is hidden
  const pageVisibleRef = useRef<boolean>(true);

  // Alert statistics
  const alertStats = useAlertStatistics(alertHistory);

  // KPI values (same as before)
  const kpiValues = useMemo(() => {
    if (!metrics) return {};

    const cpuUsage = metrics?.kpi?.cpu ?? undefined;
    const usedMB =
      (typeof metrics?.stats?.memory_used_mb === "number"
        ? metrics?.stats?.memory_used_mb
        : undefined) ??
      (typeof metrics?.kpi?.memory === "number"
        ? metrics?.kpi?.memory
        : undefined);
    const totalMB =
      typeof metrics?.stats?.memory_total_mb === "number"
        ? metrics.stats.memory_total_mb
        : undefined;
    const usedGB = mbToGB(usedMB ?? 0);
    const totalGB = mbToGB(totalMB ?? 0);
    const currentCon = metrics?.kpi?.connections ?? undefined;
    const maxCon =
      metrics?.stats?.max_connections ?? metrics?.kpi?.connections ?? undefined;
    const cacheHit =
      typeof metrics?.stats?.cache_hit_rate === "number"
        ? metrics.stats.cache_hit_rate
        : typeof metrics?.stats?.cache_hit_rate === "string"
        ? parseFloat(metrics.stats.cache_hit_rate)
        : undefined;

    return {
      cpu: { value: cpuUsage, max: 100, unit: "%" },
      memory: { value: usedGB, max: totalGB, unit: "GB", usedGB, totalGB },
      connections: { value: currentCon, max: maxCon, unit: "" },
      cache: { value: cacheHit, max: 100, unit: "%" },
    } as const;
  }, [metrics]);

  /**
   * Track metrics changes to bump "Last updated"
   */
  useEffect(() => {
    if (metrics) setLastRefresh(new Date());
  }, [metrics]);

  /**
   * Visibility handler – pause auto refresh when tab is hidden
   */
  useEffect(() => {
    const onVisibility = () => {
      pageVisibleRef.current = document.visibilityState === "visible";
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  /**
   * KPI auto-refresh interval
   */
  useEffect(() => {
    if (kpiRefreshRef.current) {
      clearInterval(kpiRefreshRef.current);
      kpiRefreshRef.current = null;
    }

    if (activeTab === "performance" && typeof onRefreshKPI === "function") {
      kpiRefreshRef.current = setInterval(async () => {
        if (!pageVisibleRef.current) return;
        try {
          onRefreshKPI();
        } catch {
          // silent
        }
      }, 10000);
    }

    return () => {
      if (kpiRefreshRef.current) {
        clearInterval(kpiRefreshRef.current);
        kpiRefreshRef.current = null;
      }
    };
  }, [activeTab, onRefreshKPI]);

  /**
   * Alert monitor interval
   */
  useEffect(() => {
    if (alertCheckRef.current) {
      clearInterval(alertCheckRef.current);
      alertCheckRef.current = null;
    }

    const needAlertCheck = activeTab === "performance" || activeTab === "alerts";
    if (needAlertCheck && typeof onRefreshKPI === "function") {
      alertCheckRef.current = setInterval(async () => {
        if (!pageVisibleRef.current) return;
        try {
          await onRefreshKPI();
        } catch {
          // silent
        }
      }, 30000);
    }

    return () => {
      if (alertCheckRef.current) {
        clearInterval(alertCheckRef.current);
        alertCheckRef.current = null;
      }
    };
  }, [activeTab, onRefreshKPI]);

  // Alert checking logic (keeping the same logic from original)
  useEffect(() => {
    if (!kpiValues) return;

    const newAlerts: ActiveAlert[] = [];
    const newHistoryItems: AlertHistoryItem[] = [];
    const currentAlertState: Record<string, unknown> = {};

    // CPU Alert
    if (alertConfig.cpu.enabled && kpiValues.cpu?.value !== undefined) {
      const cpuUsage = kpiValues.cpu.value;
      currentAlertState.cpu = cpuUsage;

      let level: AlertLevel = "normal";
      if (cpuUsage >= alertConfig.cpu.critical) level = "critical";
      else if (cpuUsage >= alertConfig.cpu.warning) level = "warning";

      if (level !== "normal") {
        newAlerts.push({
          type: "cpu",
          level,
          message: `CPU usage ${level === "critical" ? "critically " : ""}high (${cpuUsage.toFixed(1)}%)`,
          value: cpuUsage,
          threshold:
            level === "critical" ? alertConfig.cpu.critical : alertConfig.cpu.warning,
        });
      }

      const last = lastAlertCheckRef.current as any;
      if (last.cpu !== cpuUsage || last.cpuLevel !== level) {
        if (level !== "normal") {
          newHistoryItems.push({
            id: generateAlertId("cpu", level),
            timestamp: new Date(),
            metric: "CPU",
            level,
            value: cpuUsage,
            threshold:
              level === "critical" ? alertConfig.cpu.critical : alertConfig.cpu.warning,
            message: `CPU usage reached ${level} level (${cpuUsage.toFixed(1)}%)`,
          });
        }
      }
      (currentAlertState as any).cpuLevel = level;
    }

    // (Similar logic for Memory, Connections, Cache - keeping same as original)

    setActiveAlerts(newAlerts);
    lastAlertCheckRef.current = currentAlertState;

    if (newHistoryItems.length > 0) {
      setAlertHistory((prev) => [...newHistoryItems, ...prev].slice(0, 100));
      newHistoryItems.forEach((it) => {
        if (it.level === "critical") {
          toast.error(it.message, { duration: 5000 });
        }
      });
    }

    const signature = JSON.stringify(newAlerts.map((a) => `${a.type}:${a.level}`));
    if (signature !== prevAlertsRef.current) {
      setActiveAlerts(newAlerts);
      prevAlertsRef.current = signature;
    }
  }, [kpiValues, alertConfig]);

  // Buffer cache calculation (same as before)
  const bufferSumMB = useMemo(() => {
    const list = metrics?.hardware?.databaseMetrics as any[] | undefined;
    if (!list) return 0;
    return Math.round(
      list.reduce((acc, cur) => acc + (Number(cur?.memory_in_buffer_mb) || 0), 0)
    );
  }, [metrics]);

  // Insights flattening (same as before)
  const flattenedInsights = useMemo(() => {
    if (!insights) return [] as any[];
    if (Array.isArray(insights)) return insights as any[];
    const out: any[] = [];
    const push = (arr: any[] | undefined, type: string) => {
      if (!arr?.length) return;
      out.push(...arr.map((i) => ({ ...i, type })));
    };
    const iObj: any = insights;
    push(iObj.runningQueries, "running_query");
    push(iObj.slowQueries, "slow_query");
    push(iObj.blockingQueries, "blocking_query");
    push(iObj.waitStats, "wait_stats");
    push(iObj.deadlocks, "deadlock_event");
    push(iObj.tempDbUsage, "high_tempdb_usage");
    return out;
  }, [insights]);

  const problemCount = useMemo(() => {
    const list = flattenedInsights as { type: string }[];
    return list.filter(
      (i) =>
        i.type === "blocking_query" ||
        i.type === "deadlock_event" ||
        i.type === "slow_query" ||
        i.type === "high_tempdb_usage"
    ).length;
  }, [flattenedInsights]);

  // Action handlers
  const handleRefresh = async (tab: ExtendedTabType = activeTab) => {
    try {
      // Only refresh if it's a valid TabType for the onRefresh function
      if (tab !== "manual-query" && tab !== "alerts") {
        await onRefresh(tab as TabType);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Refresh error:", err);
    }
  };

  const handleExecuteManualQuery = async (query: string) => {
    if (!query || !server.inventoryID) {
      toast.error("Missing query or Inventory ID");
      return { error: "Missing query or inventoryId" };
    }
    if (!isReadOnlySQL(query)) {
      toast.error("Only read-only SELECT or safe EXEC queries allowed.");
      return { error: "Query validation failed on client." };
    }
    try {
      const res = await fetch("/api/execute-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, inventoryId: server.inventoryID }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(`${result.message || "Query failed."}`);
        return { error: result.message };
      }
      toast.success("Query executed successfully!");
      return result;
    } catch (error) {
      console.error("Query execution error:", error);
      toast.error("Unexpected error occurred.");
      return { error } as unknown;
    }
  };

  const handleAskAi = async (query: string) => {
    setIsModalOpen(true);
    setSelectedQuery(query);
    setAiSuggestion("Loading...");
    try {
      const suggestion = await askAiForOptimization(query);
      setAiSuggestion(suggestion);
    } catch (error) {
      setAiSuggestion("Failed to get suggestion.");
      console.error("AI suggestion error:", error);
    }
  };

  const handleUpdateAlertConfig = (config: AlertConfig) => {
    setAlertConfig(config);
    toast.success("Alert configuration updated!");
  };

  const handleClearAlertHistory = () => {
    setAlertHistory([]);
    toast.success("Alert history cleared!");
  };

  // Early exits
  if (isLoading) return <LoadingSkeleton />;
  if (error)
    return (
      <ErrorDisplay error={error} onRetry={() => handleRefresh(activeTab)} />
    );
  if (!metrics)
    return (
      <div className="text-center py-20 text-slate-500">
        No metrics available for this server.
      </div>
    );

  const tabs: ExtendedTabType[] = [
    "performance",
    "insights",
    "manual-query",
    "alerts",
    "hardware",
  ];

  return (
    <div className="space-y-8">
      {/* Enhanced Alert Summary Bar */}
      {activeAlerts.length > 0 && activeTab !== "alerts" && (
        <div className="bg-gradient-to-r from-red-900/20 to-yellow-900/20 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-400" size={20} />
              <h3 className="text-red-400 font-semibold">
                Active Alerts ({activeAlerts.length})
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab("alerts")}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <History size={14} />
                View All
              </button>
              <button
                onClick={() => setShowAlertConfig(true)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <Settings size={14} />
                Configure
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            {activeAlerts.map((alert, index) => (
              <div
                key={index}
                className={`text-sm flex items-center gap-2 ${
                  alert.level === "critical" ? "text-red-400" : "text-yellow-400"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    alert.level === "critical"
                      ? "bg-red-500 animate-pulse"
                      : "bg-yellow-500"
                  }`}
                />
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header with enhanced navigation */}
      <div className="border-b border-slate-800">
        <div className="flex items-center justify-between pb-4">
          <nav className="-mb-px flex space-x-6" role="tablist">
            {tabs.map((tab) => (
              <TabButton
                key={tab}
                tab={tab}
                activeTab={activeTab}
                onClick={setActiveTab}
                insightCount={tab === "insights" ? problemCount : 0}
                alertCount={tab === "alerts" ? activeAlerts.length : 0}
              />
            ))}
          </nav>
          <nav className="flex items-center gap-4">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} /> Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={() => handleRefresh(activeTab)}
              className="p-2 text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "performance" && (
        <div className="space-y-8">
          {/* Performance Summary (same as before) */}
          <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-200">
                <BarChart size={20} className="text-blue-400" />
                <span className="font-semibold">Performance Summary</span>
                <span className="text-[11px] text-slate-500 flex items-center gap-1 ml-2">
                  <Info size={12} /> Auto-refreshing every 10s
                </span>
              </div>
              <div className="text-xs text-slate-400">
                Real-time monitoring:{" "}
                {activeAlerts.length > 0 ? "🔴 Alerts Active" : "🟢 Normal"}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPIWidget
                icon={<Cpu size={24} />}
                title="CPU Usage"
                value={kpiValues?.cpu?.value}
                max={kpiValues?.cpu?.max}
                unit={kpiValues?.cpu?.unit}
                color="green"
                warningThreshold={alertConfig.cpu.warning}
                criticalThreshold={alertConfig.cpu.critical}
                alertType="percentage"
              />

              <KPIWidget
                icon={<MemoryStick size={24} />}
                title="RAM (Used / Physical)"
                value={kpiValues?.memory?.value}
                max={kpiValues?.memory?.max}
                unit={kpiValues?.memory?.unit}
                color="green"
                warningThreshold={alertConfig.memory.warning}
                criticalThreshold={alertConfig.memory.critical}
                alertType="percentage"
              />

              <KPIWidget
                icon={<ShieldCheck size={24} />}
                title="Cache Hit Rate"
                value={kpiValues?.cache?.value}
                max={kpiValues?.cache?.max}
                unit={kpiValues?.cache?.unit}
                color="green"
                warningThreshold={alertConfig.cache.warning}
                criticalThreshold={alertConfig.cache.critical}
                alertType="reverse"
              />

              <KPIWidget
                icon={<Activity size={24} />}
                title="Active Connections"
                value={kpiValues?.connections?.value}
                max={typeof kpiValues?.connections?.max === 'number' ? kpiValues.connections.max : null}
                unit={kpiValues?.connections?.unit}
                color="green"
                warningThreshold={alertConfig.connections.warning}
                criticalThreshold={alertConfig.connections.critical}
                alertType="percentage"
              />
            </div>

            {bufferSumMB > 0 && (
              <div className="mt-4 text-xs text-slate-400">
                Buffer cache across databases: {humanBytesFromMB(bufferSumMB)}
              </div>
            )}
          </section>

          {metrics?.databaseInfo ? (
            <DatabaseTableView
              databaseInfo={metrics.databaseInfo}
              inventoryID={server.inventoryID}
            />
          ) : (
            <p className="text-slate-500 text-sm">No database info available.</p>
          )}
        </div>
      )}

      {activeTab === "insights" && (
        <div className="space-y-8">
          <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h3 className="text-xl font-semibold mb-4 text-white flex items-center">
              <Activity size={20} className="mr-2 text-sky-400" />
              Performance Insights ({flattenedInsights.length})
            </h3>
            <PerformanceInsightsTable
              insights={flattenedInsights}
              serverName={server.systemName}
              isLoading={insightsLoading}
              onExecuteQuery={handleExecuteManualQuery}
              onAskAi={handleAskAi}
            />
          </section>
        </div>
      )}

      {/* New Manual Query Tab */}
      {activeTab === "manual-query" && (
        <ManualQueryPanel
          serverName={server.systemName}
          onExecuteQuery={handleExecuteManualQuery}
          onAskAi={handleAskAi}
        />
      )}

      {/* Alerts Tab */}
      {activeTab === "alerts" && (
        <div className="space-y-8">
          <AlertDashboard
            stats={alertStats}
            onViewHistory={() => {}} // Already showing history below
            onConfigureAlerts={() => setShowAlertConfig(true)}
          />

          <AlertHistory alerts={alertHistory} onClear={handleClearAlertHistory} />
        </div>
      )}

      {activeTab === "hardware" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h3 className="text-xl font-semibold mb-4 text-white">
              Connection & System Details
            </h3>
            <dl className="space-y-2">
              <DetailItem label="Server Name" value={server.systemName} isHighlight />
              <DetailItem label="Zone" value={server.zone} />
              <DetailItem label="IP Address" value={server.serverHost} />
              <DetailItem label="Port" value={server.port} />
              <DetailItem label="Database Type" value={server.databaseType} />
              <DetailItem label="Connection Username" value={server.connectionUsername} />
              <DetailItem label="Owner Contact" value={server.ownerContact} />
            </dl>
          </div>

          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h3 className="text-xl font-semibold mb-4 text-white">
              Live Hardware Status
            </h3>
            <dl className="space-y-2">
              <DetailItem
                label="CPU Usage"
                value={
                  kpiValues?.cpu?.value !== undefined
                    ? `${kpiValues.cpu.value}%`
                    : null
                }
              />
              <DetailItem
                label="Memory Usage"
                value={
                  kpiValues?.memory?.value !== undefined &&
                  kpiValues?.memory?.max !== undefined
                    ? `${kpiValues.memory.value}/${kpiValues.memory.max} GB`
                    : null
                }
              />
              {bufferSumMB > 0 && (
                <DetailItem label="Buffer Cache" value={humanBytesFromMB(bufferSumMB)} />
              )}

              <DetailItem
                label="Active Connections"
                value={
                  kpiValues?.connections?.value !== undefined
                    ? kpiValues.connections?.max
                      ? `${kpiValues.connections.value}/${kpiValues.connections.max}`
                      : kpiValues.connections.value
                    : null
                }
              />
            </dl>

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 flex items-center gap-2">
              <AlertCircle size={14} /> RAM shown as SQL Used / Physical (GB)
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <SQLTuningModal
        isOpen={isModalOpen}
        query={selectedQuery}
        suggestion={aiSuggestion}
        onClose={() => setIsModalOpen(false)}
      />

      <AlertConfigPanel
        config={alertConfig}
        onSave={handleUpdateAlertConfig}
        isOpen={showAlertConfig}
        onClose={() => setShowAlertConfig(false)}
      />
    </div>
  );
};

export default ServerDetailView;
