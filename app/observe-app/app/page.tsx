"use client";

import React, { FC, useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ManagementPanel } from "@/components/shared/forms/ManagementPanel";
import { ServerDetailView } from "@/components/dashboard/ServerDetailView";
import { AddServerModal } from "@/components/shared/forms/AddServerModal";
import { EditDatabaseModal } from "@/components/shared/forms/EditDatabaseModal";
import { ServerDetailModal } from "@/components/shared/forms/ServerDetailModal";
import { DatabaseInventory, ServerMetrics, ServerFormData, PerformanceInsight } from "@/types";
import { AlertCircle } from "lucide-react";
import { DatabaseTableView } from "@/components/dashboard/DatabaseTableView";

const useInventoryManager = () => {
  const [servers, setServers] = useState<DatabaseInventory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const API_URL = "/api/inventory";

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Failed to fetch server inventory");

      const data = await res.json();
      const zonesData: Record<string, DatabaseInventory[]> = data.zones || {};
      const serverList: DatabaseInventory[] = Object.values(zonesData).flat();

      setServers(serverList.sort((a, b) => a.systemName.localeCompare(b.systemName)));
    } catch (err: unknown) {
      setError(err.message);
      setServers([]);
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return { servers, isLoading, error, refreshServers: fetchServers };
};

const REFRESH_INTERVAL_MS = 60000;

const useDatabaseMetrics = (server: DatabaseInventory | null) => {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!server?.inventoryID) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${server.inventoryID}/metrics`);
      if (!res.ok) throw new Error("Failed to fetch database metrics");

      const json = await res.json();
      setMetrics(json);
    } catch (err: unknown) {
      setError(err.message);
      setMetrics(null);
    } finally {
      setIsLoading(false);
    }
  }, [server?.inventoryID]);

  useEffect(() => {
    if (server) {
      fetchMetrics();
      const intervalId = setInterval(fetchMetrics, REFRESH_INTERVAL_MS);
      return () => clearInterval(intervalId);
    }
  }, [server, fetchMetrics]);

  return { metrics, isLoading, error, refreshMetrics: fetchMetrics };
};

const useHardwareMetrics = (server: DatabaseInventory | null) => {
  const [hardware, setHardware] = useState<unknown>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const fetchHardware = useCallback(async () => {
    if (!server?.inventoryID) return;
    try {
      const res = await fetch(`/api/inventory/${server.inventoryID}/hardware`);
      if (!res.ok) throw new Error("Failed to fetch hardware metrics");
      const json = await res.json();
      setHardware(json);
    } catch (err: unknown) {
      setHardwareError(err.message);
      setHardware(null);
    }
  }, [server?.inventoryID]);

  useEffect(() => {
    if (!server) return;
    fetchHardware();
    const intervalId = setInterval(fetchHardware, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [server, fetchHardware]);

  return { hardware, hardwareError, refreshHardware: fetchHardware };
};

const useQueryInsights = (server: DatabaseInventory | null) => {
  const [insights, setInsights] = useState<PerformanceInsight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!server?.inventoryID) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${server.inventoryID}/query-insight`);
      if (!res.ok) throw new Error("Failed to fetch query insights");

      const json: PerformanceInsight = await res.json();
      setInsights(json);
    } catch (err: unknown) {
      setError(err.message || "Unknown error");
      setInsights(null);
    } finally {
      setLoading(false);
    }
  }, [server?.inventoryID]);

  useEffect(() => {
    if (server) fetchInsights();
  }, [server, fetchInsights]);

  return {
    insights,
    error,
    loading,
    refreshInsights: fetchInsights,
  };
};


const Home: FC = () => {
  const [modal, setModal] = useState<{ type: "add" | "edit" | "detail" | null; data?: any }>({ type: null });
  const [activeServer, setActiveServer] = useState<DatabaseInventory | null>(null);
  const { servers, isLoading: isInventoryLoading, error: inventoryError, refreshServers } = useInventoryManager();
  const { metrics, isLoading: isMetricsLoading, error: metricsError, refreshMetrics } = useDatabaseMetrics(activeServer);
  const { hardware, hardwareError, refreshHardware } = useHardwareMetrics(activeServer);
  const { insights, error: insightError, loading: insightLoading, refreshInsights } = useQueryInsights(activeServer);

  const zones = servers.reduce((acc: Record<string, DatabaseInventory[]>, server) => {
    const zone = server.zone || "Uncategorized";
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(server);
    return acc;
  }, {});

  const mergedMetrics = metrics
    ? { ...metrics, hardware: { ...hardware } ?? {}, hardwareError }
    : { databaseMetrics: {}, hardware: {}, hardwareError: null };

  useEffect(() => {
    if (activeServer && !servers.find((s) => s.inventoryID === activeServer.inventoryID)) {
      setActiveServer(null);
    }
  }, [servers, activeServer]);

  const handleAddServer = async (data: ServerFormData) => {
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to add server: ${errorData.message || response.statusText}`);
        return;
      }

      const newServer = await response.json();
      setActiveServer(newServer as DatabaseInventory);
      alert("Server added successfully!");
    } catch (error: any) {
      alert(`Error adding server: ${error.message || "An unknown error occurred."}`);
    } finally {
      await refreshServers();
      setModal({ type: null });
    }
  };

  const handleEditServer = async (data: DatabaseInventory) => {
    try {
      const response = await fetch(`/api/inventory/${data.inventoryID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(`Failed to update server: ${errorData.message || response.statusText}`);
        return;
      }

      if (activeServer?.inventoryID === data.inventoryID) setActiveServer(data);
    } catch (error: unknown) {
      alert(`Error updating server: ${error.message || "An unknown error occurred."}`);
    } finally {
      await refreshServers();
      setModal({ type: null });
    }
  };

  const handleDeleteServer = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this server?")) {
      try {
        const response = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
        if (!response.ok) {
          const errorData = await response.json();
          alert(`Failed to delete server: ${errorData.message || response.statusText}`);
          return;
        }
        if (activeServer?.inventoryID === id) setActiveServer(null);
      } catch (error: unknown) {
        alert(`Error deleting server: ${error.message || "An unknown error occurred."}`);
      } finally {
        await refreshServers();
      }
    }
  };

  return (
    <div className="flex font-sans bg-slate-950 text-slate-300 min-h-screen">
      <Sidebar
        zones={zones}
        activeServer={activeServer}
        onSelectServer={setActiveServer}
      />
      <main className="flex-1 p-4 md:p-8">
        <h1 className="text-3xl font-bold mb-6 text-white">
          {activeServer ? activeServer.systemName : "Database Inventory"}
        </h1>

        {inventoryError && (
          <div className="text-red-400 p-3 bg-red-500/10 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} />
            {inventoryError}
          </div>
        )}

        {isInventoryLoading ? (
          <p className="text-center py-20 text-slate-400">Loading Inventory...</p>
        ) : activeServer ? (
          <>
           <ServerDetailView
  server={activeServer}
  metrics={mergedMetrics}
  isLoading={isMetricsLoading}
  error={metricsError}
  onRefresh={async (tab) => {
    if (tab === "performance") {
      await Promise.all([refreshMetrics(), refreshServers()]);
    } else if (tab === "insights") {
      await refreshInsights();
    } else if (tab === "hardware") {
      await refreshHardware();
    }
  }}
  insights={insights}
  insightsLoading={insightLoading}
  insightError={insightError}
/>

            {metrics?.databases && (
              <DatabaseTableView
                databases={metrics.databases}
                inventoryID={activeServer?.inventoryID}
              />
            )}
          </>
        ) : (
          <ManagementPanel
            servers={servers}
            onOpenAddModal={() => setModal({ type: "add" })}
            onOpenEditModal={(server) => setModal({ type: "edit", data: server })}
            onOpenDetailModal={(server) => setModal({ type: "detail", data: server })}
            onDelete={handleDeleteServer}
          />
        )}
      </main>

      <AddServerModal
        isOpen={modal.type === "add"}
        onClose={() => setModal({ type: null })}
        onAdd={handleAddServer}
      />
      <EditDatabaseModal
        isOpen={modal.type === "edit"}
        server={modal.data}
        onClose={() => setModal({ type: null })}
        onEdit={handleEditServer}
      />
      <ServerDetailModal
        isOpen={modal.type === "detail"}
        server={modal.data}
        onClose={() => setModal({ type: null })}
      />
    </div>
  );
};

export default Home;
