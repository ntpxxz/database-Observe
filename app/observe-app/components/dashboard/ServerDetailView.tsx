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
  Database,
} from "lucide-react";
import { DatabaseTableView } from "./DatabaseTableView";

interface ServerDetailViewProps {
  server: DatabaseInventory;
  metrics: ServerMetrics | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
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
}) => {
  const [activeTab, setActiveTab] = useState<"performance" | "hardware">(
    "performance"
  );
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  console.log("Metrics object received by ServerDetailView:", metrics);
  const serverStatus = useMemo(() => {
    if (!metrics?.kpi) return "unknown";
    const { cpu = 0, memory = 0 } = metrics.kpi;
    if (cpu > 90 || memory > 90) return "critical";
    if (cpu > 70 || memory > 70) return "warning";
    return "healthy";
  }, [metrics]);

  const handleRefresh = async () => {
    try {
      await onRefresh();
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to refresh data:", err);
    }
  };
  const totalMemoryInMb = useMemo(() => {
    if (!metrics?.hardware?.ram?.databaseMetrics) {
      return null;
    }
    return metrics.hardware.ram.databaseMetrics.reduce(
      (sum, db) => sum + db.memory_in_buffer_mb,
      0
    );
  }, [metrics]);

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
      {/* 
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
        className={`px-3 py-1 rounded-full text-xs font-medium bg-${
          serverStatus === "healthy" ? "green" : "red"
        }-500/10 text-${serverStatus === "healthy" ? "green" : "red"}-400`}
          >
        {serverStatus.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 flex items-center gap-1">
        <Clock size={12} />
        Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
        onClick={handleRefresh}
        disabled={isLoading}
        className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
        title="Refresh data"
          >
        <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div> 
      
      */}

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
        </nav>
        <nav className="flex items-center gap-4">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock size={12} />
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          </button>
        </nav>


      </div>
      </div>
      {activeTab === "performance" && (
        <div className="space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPIWidget
              icon={<Cpu size={24} />}
              title="CPU Pressure"
              value={
                metrics.hardware.kpi?.cpu !== undefined
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
                metrics.hardware.stats?.cache_hit_rate !== undefined
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
          </section>{" "}         
            
            {metrics?.databaseInfo && (
            <DatabaseTableView
              databaseInfo={metrics.databaseInfo || []}
            />
            )}
            {!metrics?.databaseInfo && (
              <div className="text-slate-500 text-sm">
                No database information available.
              </div>
            )}  
          </div>
       
      )}

      {activeTab === "hardware" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* System Details */}
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
              <DetailItem label="Server Host" value={server.serverHost} />
              <DetailItem label="Port" value={server.port} />
              <DetailItem label="Database Name" value={server.databaseName} />
              <DetailItem label="Database Type" value={server.databaseType} />
              <DetailItem
                label="Connection Username"
                value={server.connectionUsername}
              />
              <DetailItem label="Owner Contact" value={server.ownerContact} />
            </dl>
          </div>

          {/* Hardware Status */}
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <h3 className="text-xl font-semibold mb-4 text-white">
              Live Hardware Status
            </h3>
            {metrics.hardwareError ? (
              <div className="text-amber-400 text-sm p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <AlertCircle size={16} className="inline mr-2" />
                Could not retrieve live hardware data.
              </div>
            ) : (
              <dl className="space-y-2">
                <DetailItem
                  label="CPU Usage"
                  value={`${metrics.hardware.kpi.cpu}%`}
                />
                <DetailItem
                  label="Memory Usage"
                  value={
                    totalMemoryInMb !== null
                      ? Math.round(totalMemoryInMb)
                      : null
                  }
                />
                <DetailItem
                  label="Disk I/O"
                  value={`${metrics.hardware.kpi.disk_iops}`}
                />
                <DetailItem
                  label="Active Connections"
                  value={metrics.data.kpi.connections}
                />
              </dl>
            )}

            {/* Purpose Notes */}
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
    </div>
  );
};
