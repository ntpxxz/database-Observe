import React, { FC, useState, useMemo } from "react";
import { DatabaseInventory, ServerMetrics } from "@/types";
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
  TrendingUp,
} from "lucide-react";
import { DatabaseTableView } from "./DatabaseTableView";
import { PerformanceInsightsTable } from "./PerformanceInsightsTable";
import { QueryTrendChart } from "../ui/QueryTrendChart";
import { DiskUsageChart } from "../ui/DiskUsageChart";
import toast from "react-hot-toast";
import { isReadOnlySQL } from "@/lib/utils";
import { SQLTuningModal } from "../modals/SQLTuningModal";
import { askAiForOptimization } from "@/lib/askAiForOptimization";
interface ServerDetailViewProps {
  server: DatabaseInventory;
  metrics: ServerMetrics | null;
  isLoading: boolean;
  error: string | null;
  insights?: any | null;
  insightsLoading?: boolean;
  insightError?: string | null;
  onRefresh: (tab: "performance" | "insights" | "hardware") => void;
}

interface DetailItemProps {
  label: string;
  value: string | number | null;
  isHighlight?: boolean;
}

const DetailItem: FC<DetailItemProps> = ({ label, value, isHighlight }) => (
  <div className={`flex justify-between ${isHighlight ? "text-sky-400" : ""}`}>
    <span className="text-sm text-slate-400">{label}</span>
    <span className="text-sm text-white">
      {value !== null && value !== undefined ? value : "N/A"}
    </span>
  </div>
);

const LoadingSkeleton: FC = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-slate-800 h-24 rounded-xl"></div>
      ))}
    </div>
    <div className="bg-slate-800 h-64 rounded-xl"></div>
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

export const ServerDetailView: FC<ServerDetailViewProps> = ({
  server,
  metrics,
  isLoading,
  error,
  onRefresh,
  insights,
  insightsLoading,
  insightError,
}) => {
  const [activeTab, setActiveTab] = useState<
    "performance" | "insights" | "hardware"
  >("performance");

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<string>("");
  const [aiSuggestion, setAiSuggestion] = useState<string>("");
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  
  const serverStatus = useMemo(() => {
    if (!metrics?.kpi) return "unknown";
    const { cpu = 0, memory = 0 } = metrics.kpi;
    if (cpu > 90 || memory > 90) return "critical";
    if (cpu > 70 || memory > 70) return "warning";
    return "healthy";
  }, [metrics]);

  const totalMemoryInMb = useMemo(() => {
    if (!metrics?.hardware?.ram?.databaseMetrics) return null;
    return metrics.hardware.ram.databaseMetrics.reduce(
      (sum, db) => sum + db.memory_in_buffer_mb,
      0,
    );
  }, [metrics]);

  const getInsightsSummary = useMemo(() => {
    if (!insights) return { total: 0, critical: 0, warning: 0 };

    const critical =
      (insights.blockingQueries?.length || 0) +
      (insights.deadlocks?.length || 0);
    const warning =
      (insights.slowQueries?.length || 0) + (insights.tempDbUsage?.length || 0);
    const total =
      critical +
      warning +
      (insights.runningQueries?.length || 0) +
      (insights.waitStats?.length || 0);

    return { total, critical, warning };
  }, [insights]);

  const handleRefresh = async (
    tab: "performance" | "insights" | "hardware",
  ) => {
    try {
      console.log("The tab", tab);
      await onRefresh(activeTab);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to refresh data:", err);
    }
  };

  const handleKillSession = async (sessionId: string) => {
    try {
      const res = await fetch(
        `/api/inventory/${server?.InventoryID}/kill-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Kill session failed");
      }

      const result = await res.json();
      toast.success(`✅ Session ${sessionId} killed successfully`);
      handleRefresh(tab); // Refresh insights after kill
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`❌ Failed to kill session ${sessionId}: ${err.message}`);
    }
  };

  const handleExecuteManualQuery = async (query: string) => {
    if (!query || !server?.inventoryID) {
      toast.error("❌ Missing query or Inventory ID");
      return { error: "Missing query or inventoryId" };
    }
    if (!isReadOnlySQL(query)) {
      toast.error(
        "❌ Only single-statement read-only SELECT or safe EXEC queries are allowed.",
      );
      return { error: "Query validation failed on client." };
    }

    try {
      const res = await fetch(`/api/execute-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, inventoryId: server.inventoryID }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(`❌ ${result.message || "Query execution failed."}`);
        return { error: result.message };
      }

      toast.success("✅ Query executed successfully!");
      return result;
    } catch (error) {
      console.error("❌ Query execution failed:", error);
      toast.error("Unexpected error occurred. See console for details.");
      return { error };
    }
  };

  const handleAskAi = async (query: string) => {
    setIsModalOpen(true);
    setSelectedQuery(query);
    setAiSuggestion("Loading...");

    try {
      const suggestion = await askAiForOptimization(query);
      setAiSuggestion(suggestion);
    } catch (err) {
      setAiSuggestion("❌ Failed to get suggestion.");
    }
  };

  const flattenedInsights = useMemo(() => {
    if (!insights || typeof insights !== "object") return [];

    return [
      ...(insights.runningQueries ?? []).map((i) => ({
        ...i,
        type: "running_query",
      })),
      ...(insights.slowQueries ?? []).map((i) => ({
        ...i,
        type: "slow_query",
      })),
      ...(insights.blockingQueries ?? []).map((i) => ({
        ...i,
        type: "blocking_query",
      })),
      ...(insights.waitStats ?? []).map((i) => ({ ...i, type: "wait_stats" })),
      ...(insights.deadlocks ?? []).map((i) => ({
        ...i,
        type: "deadlock_event",
      })),
      ...(insights.tempDbUsage ?? []).map((i) => ({
        ...i,
        type: "high_tempdb_usage",
      })),
    ];
  }, [insights]);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={handleRefresh} />;
  if (!metrics)
    return (
      <div className="text-center py-20 text-slate-500">
        No metrics available for this server.
      </div>
    );

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-800">
        <div className="flex items-center justify-between pb-4">
          <nav className="-mb-px flex space-x-6" role="tablist">
            <button
              onClick={() => setActiveTab("performance")}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "performance"
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <BarChart size={16} className="inline mr-2" />
              Performance
            </button>

            <button
              onClick={() => setActiveTab("insights")}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "insights"
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <AlertCircle size={16} className="inline mr-2" />
              Query Insights
              {getInsightsSummary.total > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                  {getInsightsSummary.total}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("hardware")}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "hardware"
                  ? "border-sky-500 text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              <ServerIcon size={16} className="inline mr-2" />
              Hardware
            </button>

            {/**<button
                onClick={() => setActiveTab("trends")}
                className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "trends"
                    ? "border-sky-500 text-sky-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
               >
                <TrendingUp size={16} className="inline mr-2" />
                Trends
               </button>**/}
          </nav>
          <nav className="flex items-center gap-4">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock size={12} />
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
            <button
              onClick={() => handleRefresh(activeTab)}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw
                size={16}
                className={isLoading ? "animate-spin" : ""}
              />
            </button>
          </nav>
        </div>
      </div>

      {activeTab === "performance" && (
        <div className="space-y-8">
          <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <div>
              {" "}
              <div>
                <h3 className="text-xl font-semibold mb-4 text-white flex items-center">
                  <BarChart size={20} className="mr-2 text-blue-400" />
                  Performance Summary
                </h3>{" "}
              </div>{" "}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KPIWidget
                icon={<Cpu size={24} />}
                title="CPU Pressure"
                value={
                  metrics.hardware.kpi?.cpu
                    ? Math.round(metrics.hardware.kpi.cpu)
                    : null
                }
                unit="%"
                color="sky"
              />

              <KPIWidget
                icon={<MemoryStick size={24} />}
                title="Memory in Buffer"
                value={
                  totalMemoryInMb !== null ? Math.round(totalMemoryInMb) : null
                }
                unit="MB"
                color="violet"
              />

              <KPIWidget
                icon={<ShieldCheck size={24} />}
                title="Cache Hit Rate"
                value={
                  metrics.hardware.stats?.cache_hit_rate
                    ? Math.round(metrics.hardware.stats.cache_hit_rate)
                    : null
                }
                unit="%"
                color="green"
              />

              <KPIWidget
                icon={<Activity size={24} />}
                title="Active Connections"
                value={metrics.kpi?.connections}
                unit=""
                color="amber"
              />
            </div>
          </section>

          {metrics?.databaseInfo ? (
            <DatabaseTableView
              databaseInfo={metrics.databaseInfo}
              inventoryID={""}
            />
          ) : (
            <p className="text-slate-500 text-sm">
              No database information available.
            </p>
          )}
        </div>
      )}

      {activeTab === "insights" && (
        <div className="space-y-6">
          {insightsLoading ? (
            <div className="text-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto"></div>
              <p className="text-slate-400 mt-4">Loading query insights...</p>
            </div>
          ) : insightError ? (
            <ErrorDisplay error={insightError} onRetry={handleRefresh} />
          ) : (
            <div className="space-y-6">
              {flattenedInsights.length > 0 ? (
                <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                  <h3 className="text-xl font-semibold mb-4 text-white flex items-center">
                    <Activity size={20} className="mr-2 text-sky-400" />
                    Performance Insights ({flattenedInsights.length})
                  </h3>

                  <PerformanceInsightsTable
                    insights={flattenedInsights}
                    serverName={server?.systemName}
                    isLoading={insightsLoading}
                    onKillSession={handleKillSession}
                    onExecuteQuery={handleExecuteManualQuery}
                    onAskAi={handleAskAi}
                  />
                </section>
              ) : (
                <div className="text-center py-20">
                  <ShieldCheck
                    size={48}
                    className="mx-auto text-green-400 mb-4"
                  />

                  <h3 className="text-lg font-medium text-white mb-2">
                    All Clear!
                  </h3>
                  <p className="text-slate-400">
                    No significant performance issues found. System looks
                    healthy!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "hardware" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h3 className="text-xl font-semibold mb-4 text-white">
              Connection & System Details
            </h3>
            <dl className="space-y-2">
              <DetailItem
                label="System Name"
                value={server.systemName}
                isHighlight
              />

              <DetailItem label="Zone" value={server.zone} />
              <DetailItem label="IP Address" value={server.serverHost} />
              <DetailItem label="Port" value={server.port} />
              <DetailItem label="Database Type" value={server.databaseType} />
              <DetailItem
                label="Connection Username"
                value={server.connectionUsername}
              />

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
                  metrics.hardware.kpi?.cpu
                    ? `${Math.round(metrics.hardware.kpi.cpu)}%`
                    : null
                }
              />

              <DetailItem
                label="Memory Usage"
                value={
                  totalMemoryInMb !== null
                    ? `${Math.round(totalMemoryInMb)} MB`
                    : null
                }
              />

              <DetailItem
                label="Disk I/O"
                value={metrics.hardware.kpi?.disk_iops}
              />

              <DetailItem
                label="Active Connections"
                value={metrics.kpi?.connections}
              />
            </dl>
            <div className="mt-6 pt-4 border-t border-slate-800">
              <h4 className="text-sm font-medium text-slate-400 mb-3">
                Purpose Notes
              </h4>
              <div className="bg-slate-800/50 p-4 rounded-lg text-slate-300 text-sm leading-relaxed">
                {server.purposeNotes || (
                  <span className="italic text-slate-500">
                    No notes provided.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/**{activeTab === "trends" && (
         <div className="space-y-8">
            <QueryTrendChart serverId={server.id} />
            <DiskUsageChart serverId={server.id} />
          </div>
         )}**/}
      <SQLTuningModal
        isOpen={isModalOpen}
        query={selectedQuery}
        suggestion={aiSuggestion}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};
