"use client";

import React, { FC, useState, useEffect, useCallback } from "react";
import { ManagementPanel } from "@/components/layout/ManagementPanel";
import { ServerDetailView } from "@/components/dashboard/ServerDetailView";
import { AddServerModal } from "@/components/modals/AddServerModal";
import { EditDatabaseModal } from "@/components/modals/EditDatabaseModal";
import { ServerDetailModal } from "@/components/modals/ServerDetailModal";
import { useServerContext } from "@/app/context/Servercontext";
import {
  Metrics,
  DatabaseInventory,
  PerformanceInsight,
} from "@/types";
import { AlertCircle } from "lucide-react";

// Define hardware metrics interface
interface HardwareMetrics {
  cpuUsage: number;
  databaseMetrics: any[];
  [key: string]: any;
}

const useDatabaseMetrics = (server: DatabaseInventory | null) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setError(message);
      setMetrics(null);
    } finally {
      setIsLoading(false);
    }
  }, [server?.inventoryID]);

  useEffect(() => {
    if (server) {
      fetchMetrics();
    }
  }, [server]);

  return { metrics, isLoading, error, refreshMetrics: fetchMetrics };
};

const useHardwareMetrics = (server: DatabaseInventory | null) => {
  const [hardware, setHardware] = useState<HardwareMetrics | null>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const fetchHardware = useCallback(async () => {
    if (!server?.inventoryID) return;
    try {
      const res = await fetch(`/api/inventory/${server.inventoryID}/hardware`);
      if (!res.ok) throw new Error("Failed to fetch hardware metrics");
      const json = await res.json();
      setHardware(json);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setHardwareError(message);
      setHardware(null);
    }
  }, [server?.inventoryID]);

  useEffect(() => {
    if (!server) return;
    fetchHardware();
  }, [server]);

  return { hardware, hardwareError, refreshHardware: fetchHardware };
};

const useQueryInsights = (server: DatabaseInventory | null) => {
  const [insights, setInsights] = useState<PerformanceInsight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!server?.inventoryID) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inventory/${server.inventoryID}/query-insight`,
      );
      if (!res.ok) throw new Error("Failed to fetch query insights");

      const json: PerformanceInsight[] = await res.json();
      setInsights(json);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setError(message || "Unknown error");
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

const InventoryPage: FC = () => {
  const [modal, setModal] = useState<{
    type: "add" | "edit" | "detail" | null;
    data?: DatabaseInventory;
  }>({ type: null });

  // ใช้ context แทน local state
  const {
    servers,
    activeServer,
    isLoading: isInventoryLoading,
    error: inventoryError,
    refreshServers,
  } = useServerContext();

  // Debug log to check activeServer changes
  useEffect(() => {
    console.log("Active server changed in inventory page:", activeServer?.systemName || "null");
  }, [activeServer]);

  const {
    metrics,
    isLoading: isMetricsLoading,
    error: metricsError,
    refreshMetrics,
  } = useDatabaseMetrics(activeServer);
  const { hardware, refreshHardware } = useHardwareMetrics(activeServer);
  const {
    insights,
    error: insightError,
    loading: insightLoading,
    refreshInsights,
  } = useQueryInsights(activeServer);

  // Create a properly typed merged metrics object
  const mergedMetrics: Metrics | null = metrics
    ? {
        ...metrics,
        hardware: hardware || {
          cpuUsage: 0,
          databaseMetrics: [],
        },
      }
    : null;

  const handleAddServer = async (data: DatabaseInventory) => {
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert(
          `Failed to add server: ${errorData.message || response.statusText}`,
        );
        return;
      }

      alert("Server added successfully!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(
        `Error adding server: ${message || "An unknown error occurred."}`,
      );
    } finally {
      setModal({ type: null })
      await refreshServers();
      
  
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
        alert(
          `Failed to update server: ${errorData.message || response.statusText}`,
        );
        return;
      }
      alert("Server Update successfully!");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      alert(
        `Error updating server: ${message || "An unknown error occurred."}`,
      );
    } finally {     
      setModal({ type: null }); 
      await refreshServers();      
    
      
    }
  };

  const handleDeleteServer = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this server?")) {
      try {
        const response = await fetch(`/api/inventory/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const errorData = await response.json();
          alert(
            `Failed to delete server: ${errorData.message || response.statusText}`,
          );
          return;
        }
        alert("Server deleted successfully!");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        alert(
          `Error deleting server: ${message || "An unknown error occurred."}`,
        );
      } finally {
        await refreshServers();
      }
    }
  };

  return (
    <div className="p-4 md:p-8">
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
        <p className="text-center py-20 text-slate-400">
          Loading Inventory...
        </p>
      ) : activeServer ? (
        <>
          <ServerDetailView
              server={activeServer}
              metrics={mergedMetrics}
              isLoading={isMetricsLoading}
              error={metricsError}
              onRefresh={async (tab: string) => {
                if (tab === "performance") {
                  await Promise.all([refreshMetrics(), refreshServers()]);
                } else if (tab === "insights") {
                  await refreshInsights();
                } else if (tab === "hardware") {
                  await refreshHardware();
                }
              } }
              insights={insights}
              insightsLoading={insightLoading}
              insightError={insightError} onRefreshKPI={function (): Promise<void> {
                throw new Error("Function not implemented.");
              } }          />
        </>
      ) : (
        <ManagementPanel
          servers={servers}
          onOpenAddModal={() => setModal({ type: "add" })}
          onOpenEditModal={(server) =>
            setModal({ type: "edit", data: server })
          }
          onOpenDetailModal={(server) =>
            setModal({ type: "detail", data: server })
          }
          onDelete={handleDeleteServer}
        />
      )}

      <AddServerModal
        isOpen={modal.type === "add"}
        onClose={() => setModal({ type: null })}
        onAdd={handleAddServer}
      />

      <EditDatabaseModal
        isOpen={modal.type === "edit"}
        server={modal.data ?? null}
        onClose={() => setModal({ type: null })}
        onEdit={handleEditServer}
      />

      <ServerDetailModal
        isOpen={modal.type === "detail"}
        server={modal.data ?? null}
        onClose={() => setModal({ type: null })}
      />
    </div>
  );
};

export default InventoryPage;