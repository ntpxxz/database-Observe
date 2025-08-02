import React, { FC, useState, useMemo } from "react";
import { DatabaseInventory, Metrics, PerformanceInsight} from "@/types";
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
} from "lucide-react";
import { DatabaseTableView } from "./DatabaseTableView";
import { PerformanceInsightsTable } from "./PerformanceInsightsTable";
import toast from "react-hot-toast";
import { isReadOnlySQL } from "@/lib/utils";
import { SQLTuningModal } from "../modals/SQLTuningModal";
import { askAiForOptimization } from "@/lib/askAiForOptimization";
import TableList from "./TableList";

// Types
type TabType = "performance" | "insights" | "hardware";
type ServerStatus = "healthy" | "warning" | "critical" | "unknown";

interface InsightItem {
  type: string;
  [key: string]: any;
}

interface ServerDetailViewProps {
  server: DatabaseInventory;
  metrics: Metrics | null;
  isLoading: boolean;
  error: string | null;
  insights?: PerformanceInsight | null; 
  insightsLoading?: boolean;
  insightError?: string | null;
  onRefresh: (tab: TabType) => void;
}

interface DetailItemProps {
  label: string;
  value: string | number | null;
  isHighlight?: boolean;
}

// Components
const DetailItem: FC<DetailItemProps> = ({ label, value, isHighlight = false }) => (
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

const TabButton: FC<{
  tab: TabType;
  activeTab: TabType;
  onClick: (tab: TabType) => void;
  insightCount?: number;
}> = ({ tab, activeTab, onClick, insightCount = 0 }) => {
  const getIcon = () => {
    switch (tab) {
      case "performance":
        return <BarChart size={16} className="inline mr-2" />;
      case "insights":
        return <AlertCircle size={16} className="inline mr-2" />;
      case "hardware":
        return <ServerIcon size={16} className="inline mr-2" />;
      default:
        return null;
    }
  };

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
      {tab.charAt(0).toUpperCase() + tab.slice(1)}
      {tab === "insights" && insightCount > 0 && (
        <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
          {insightCount}
        </span>
      )}
    </button>
  );
};

export const ServerDetailView: FC<ServerDetailViewProps> = ({
  server,
  metrics,
  isLoading,
  error,
  onRefresh,
  insights,
  insightsLoading = false,
  insightError,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("performance");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");



  const totalMemoryInMb = useMemo(() => {
    if (!metrics?.hardware?.databaseMetrics) return null;
    return metrics.hardware.databaseMetrics.reduce(
      (sum, db) => sum + (db.memory_in_buffer_mb || 0),
      0
    );
  }, [metrics]);

  const flattenedInsights = useMemo((): InsightItem[] => {
    if (!insights) return [];
    
    // ถ้า insights เป็น array (กรณีเก่า)
    if (Array.isArray(insights)) {
      return insights.map((insight) => ({ ...insight, type: "performance_insight" }));
    }
    
    // ถ้า insights เป็น single object ที่มี properties ต่างๆ
    const result: InsightItem[] = [];
    
    if ((insights as any).runningQueries) {
      result.push(...(insights as any).runningQueries.map((i: any) => ({ ...i, type: "running_query" })));
    }
    if ((insights as any).slowQueries) {
      result.push(...(insights as any).slowQueries.map((i: any) => ({ ...i, type: "slow_query" })));
    }
    if ((insights as any).blockingQueries) {
      result.push(...(insights as any).blockingQueries.map((i: any) => ({ ...i, type: "blocking_query" })));
    }
    if ((insights as any).waitStats) {
      result.push(...(insights as any).waitStats.map((i: any) => ({ ...i, type: "wait_stats" })));
    }
    if ((insights as any).deadlocks) {
      result.push(...(insights as any).deadlocks.map((i: any) => ({ ...i, type: "deadlock_event" })));
    }
    if ((insights as any).tempDbUsage) {
      result.push(...(insights as any).tempDbUsage.map((i: any) => ({ ...i, type: "high_tempdb_usage" })));
    }
    
    return result;
  }, [insights]);

  const getInsightsSummary = useMemo(() => {
    if (!insights) return { total: 0, critical: 0, warning: 0 };
    
    const critical = ((insights as any).blockingQueries?.length || 0) + ((insights as any).deadlocks?.length || 0);
    const warning = ((insights as any).slowQueries?.length || 0) + ((insights as any).tempDbUsage?.length || 0);
    const total = critical + warning +
      ((insights as any).runningQueries?.length || 0) +
      ((insights as any).waitStats?.length || 0);
    
    return { total, critical, warning };
  }, [insights]);

  const handleRefresh = async (tab: TabType = activeTab) => {
    try {
      await onRefresh(tab);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Refresh error:", err);
    }
  };

  const handleExecuteManualQuery = async (query: string) => {
    if (!query || !server.inventoryID) {
      toast.error("❌ Missing query or Inventory ID");
      return { error: "Missing query or inventoryId" };
    }

    if (!isReadOnlySQL(query)) {
      toast.error("❌ Only read-only SELECT or safe EXEC queries allowed.");
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
        toast.error(`❌ ${result.message || "Query failed."}`);
        return { error: result.message };
      }

      toast.success("✅ Query executed successfully!");
      return result;
    } catch (error) {
      console.error("Query execution error:", error);
      toast.error("Unexpected error occurred.");
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      setAiSuggestion("❌ Failed to get suggestion.");
    }
  };

  const renderPerformanceTab = () => (
    <div className="space-y-8">
      <section className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h3 className="text-xl font-semibold mb-4 text-white flex items-center">
          <BarChart size={20} className="mr-2 text-blue-400" />
          Performance Summary
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPIWidget 
            icon={<Cpu size={24} />} 
            title="CPU Pressure" 
            value={metrics?.kpi?.cpu ?? undefined} 
            unit="%" 
            color="sky" 
          />
          <KPIWidget 
            icon={<MemoryStick size={24} />} 
            title="Memory in Buffer" 
            value={metrics?.kpi?.memory ?? undefined} 
            unit="MB" 
            color="violet" 
          />
          <KPIWidget 
            icon={<ShieldCheck size={24} />} 
            title="Cache Hit Rate" 
            value={metrics?.stats?.cache_hit_rate ?? undefined} 
            unit="%" 
            color="green" 
          />
          <KPIWidget 
            icon={<Activity size={24} />} 
            title="Active Connections" 
            value={metrics?.kpi?.connections} 
            unit="" 
            color="amber" 
          />
        </div>
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
  );

  const renderInsightTab = () => {
    if (insightsLoading) {
      return (
        <div className="text-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto" />
          <p className="text-slate-400 mt-4">Loading query insights...</p>
        </div>
      );
    }

    if (insightError) {
      return <ErrorDisplay error={insightError} onRetry={() => handleRefresh("insights")} />;
    }

    return (
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
    );
  };

  const renderHardwareTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h3 className="text-xl font-semibold mb-4 text-white">Connection & System Details</h3>
        <dl className="space-y-2">
          <DetailItem label="System Name" value={server.systemName} isHighlight />
          <DetailItem label="Zone" value={server.zone} />
          <DetailItem label="IP Address" value={server.serverHost} />
          <DetailItem label="Port" value={server.port} />
          <DetailItem label="Database Type" value={server.databaseType} />
          <DetailItem label="Connection Username" value={server.connectionUsername} />
          <DetailItem label="Owner Contact" value={server.ownerContact} />
        </dl>
      </div>
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
        <h3 className="text-xl font-semibold mb-4 text-white">Live Hardware Status</h3>
        <dl className="space-y-2">
          <DetailItem label="CPU Usage" value={metrics?.kpi?.cpu ?? null} />
          <DetailItem 
            label="Memory Usage" 
            value={totalMemoryInMb ? `${Math.round(totalMemoryInMb)} MB` : null} 
          />
          {/*<DetailItem label="Disk I/O" value={metrics?.kpi?disk_iops ?? null} />*/}
          <DetailItem label="Active Connections" value={metrics?.kpi?.connections ?? null} />
        </dl>
        <div className="mt-6 pt-4 border-t border-slate-800">
          <h4 className="text-sm font-medium text-slate-400 mb-3">Purpose Notes</h4>
          <div className="bg-slate-800/50 p-4 rounded-lg text-slate-300 text-sm">
            {server.purposeNotes || (
              <span className="italic text-slate-500">No notes provided.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Early returns
  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} onRetry={() => handleRefresh(activeTab)} />;
  if (!metrics) {
    return (
      <div className="text-center py-20 text-slate-500">
        No metrics available for this server.
      </div>
    );
  }

  const tabs: TabType[] = ["performance", "insights", "hardware"];

  return (
    <div className="space-y-8">
      {/* Tab Header */}
      <div className="border-b border-slate-800">
        <div className="flex items-center justify-between pb-4">
          <nav className="-mb-px flex space-x-6" role="tablist">
            {tabs.map((tab) => (
              <TabButton
                key={tab}
                tab={tab}
                activeTab={activeTab}
                onClick={setActiveTab}
                insightCount={tab === "insights" ? getInsightsSummary.total : 0}
              />
            ))}
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
              title="Refresh"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "performance" && renderPerformanceTab()}
      {activeTab === "insights" && renderInsightTab()}
      {activeTab === "hardware" && renderHardwareTab()}

      <SQLTuningModal
        isOpen={isModalOpen}
        query={selectedQuery}
        suggestion={aiSuggestion}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};