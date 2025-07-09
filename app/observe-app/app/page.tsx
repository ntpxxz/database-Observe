"use client";

import React, { FC, useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ManagementPanel } from "@/components/shared/forms/ManagementPanel";
import { ServerDetailView } from "@/components/dashboard/ServerDetailView";
import { AddServerModal } from "@/components/shared/forms/AddServerModal";
import { EditDatabaseModal } from "@/components/shared/forms/EditDatabaseModal";
import { ServerDetailModal } from "@/components/shared/forms/ServerDetailModal";
import { DatabaseInventory, ServerMetrics, ServerFormData} from "@/types";
import { AlertCircle } from "lucide-react";
import { DatabaseTableView } from "@/components/dashboard/DatabaseTableView";


// Custom Hook for managing the server list
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
      const serverList: DatabaseInventory[] = Object.values(zonesData).flat(); // Combines all servers from different zones

      setServers(
        serverList.sort((a, b) => a.systemName.localeCompare(b.systemName))
      );

      console.log("data from API", data);
    } catch (err: any) {
      setError(err.message);
      setServers([]); // Clear servers on error
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]); // Dependency array includes API_URL for useCallback

  useEffect(() => {
    fetchServers();
  }, [fetchServers]); // Effect runs when fetchServers changes (rarely, due to useCallback)
  return { servers, isLoading, error, refreshServers: fetchServers };
};

const REFRESH_INTERVAL_MS = 60000; // 60 seconds

// Custom Hook for managing database metrics
const useDatabaseMetrics = (server: DatabaseInventory | null) => {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!server?.inventoryID) return; // Don't fetch if no server ID is available

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${server.inventoryID}/metrics`);
      if (!res.ok) throw new Error("Failed to fetch database metrics");

      const json = await res.json();
      setMetrics(json);
    } catch (err: any) {
      setError(err.message);
      setMetrics(null); // Clear metrics on error
    } finally {
      setIsLoading(false);
    }
  }, [server?.inventoryID]); // Dependency array includes server.inventoryID

  useEffect(() => {
    if (server) {
      fetchMetrics(); // Fetch immediately when a server is selected
      const intervalId = setInterval(fetchMetrics, REFRESH_INTERVAL_MS); // Set up auto-refresh
      return () => clearInterval(intervalId); // Clear interval on unmount or server change
    }
  }, [server, fetchMetrics]); // Effect runs when server or fetchMetrics changes

  return { metrics, isLoading, error };
};

// Custom Hook for managing hardware metrics
const useHardwareMetrics = (server: DatabaseInventory | null) => {
  const [hardware, setHardware] = useState<any>(null);
  const [hardwareError, setHardwareError] = useState<string | null>(null);

  const fetchHardware = useCallback(async () => {
    if (!server?.inventoryID) return; // Don't fetch if no server ID is available
    try {
      const res = await fetch(`/api/inventory/${server.inventoryID}/hardware`);
      if (!res.ok) throw new Error("Failed to fetch hardware metrics");
      const json = await res.json();
      setHardware(json);
    } catch (err: any) {
      setHardwareError(err.message);
      setHardware(null); // Clear hardware data on error
    }
  }, [server?.inventoryID]); // Dependency array includes server.inventoryID

  useEffect(() => {
    if (!server) return; // Don't run if no server is selected
    fetchHardware(); // Fetch immediately when a server is selected

    const intervalId = setInterval(() => {
      fetchHardware(); // Set up auto-refresh
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId); // Clear interval on unmount or server change
  }, [server, fetchHardware]); // Effect runs when server or fetchHardware changes

  return { hardware, hardwareError, refreshHardware: fetchHardware };
};

const Home: FC = () => {
  const [modal, setModal] = useState<{
    type: "add" | "edit" | "detail" | null;
    data?: any;
  }>({ type: null });
  
  // Use custom hooks to manage state and data fetching
  const {  
    servers,
    isLoading: isInventoryLoading,
    error: inventoryError,
    refreshServers,
  } = useInventoryManager();
  const [activeServer, setActiveServer] = useState<DatabaseInventory | null>(
    null
  );
  const {
    metrics,
    isLoading: isMetricsLoading,
    error: metricsError,
  } = useDatabaseMetrics(activeServer);
  const { hardware, hardwareError } = useHardwareMetrics(activeServer);
  
  // Group servers by zone for the sidebar
  const zones = servers.reduce(
    (acc: Record<string, DatabaseInventory[]>, server) => {
      const zone = server.zone || "Uncategorized";
      if (!acc[zone]) acc[zone] = [];
      acc[zone].push(server);
      return acc;
    },
    {}
  );
  console.log("Zones:", zones);

  // Merge database and hardware metrics into a single object for convenience
  const mergedMetrics = metrics
    ? { ...metrics, hardware: { ...hardware } ?? {}, hardwareError }
    : { databaseMetrics: {}, hardware: {}, hardwareError: null };

  // Effect to clear activeServer if it's no longer found in the fetched servers list (e.g., after deletion)
  useEffect(() => {
    if (
      activeServer &&
      !servers.find((s) => s.inventoryID === activeServer.inventoryID)
    ) {
      setActiveServer(null);
    }
  }, [servers, activeServer]);

  // --- API Interaction Handlers with Improved Error Handling ---

  const handleAddServer = async (data: ServerFormData) => {
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
  
      if (!response.ok) {
        // If the HTTP response is not OK (e.g., 4xx, 5xx status code)
        const errorData = await response.json(); // Attempt to parse error message from response body
        console.error("Failed to add server:", errorData);
        alert(`Failed to add server: ${errorData.message || response.statusText}`);
        return; // Stop execution on server-side error
      }
  
      const newServer = await response.json(); // Assuming the backend returns the newly created server object
  
      setActiveServer(newServer as DatabaseInventory); // Set the newly added server as active
      alert("Server added successfully!");
  
    } catch (error: any) { // Catch network errors or issues with the fetch operation itself
      console.error("Error adding server (network or client-side):", error);
      alert(`Error adding server: ${error.message || "An unknown error occurred."}`);
    } finally {
      // These actions should happen regardless of success or failure (e.g., refreshing list and closing modal)
      await refreshServers(); // Refresh the full server list to include the new server (or reflect failed attempt)
      setModal({ type: null }); // Close the add server modal
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
        console.error("Failed to update server:", errorData);
        alert(`Failed to update server: ${errorData.message || response.statusText}`);
        return;
      }
  
      alert("Server updated successfully!");
      if (activeServer?.inventoryID === data.inventoryID) {
        setActiveServer(data); // Update the active server details if it was the one edited
      }
    } catch (error: any) {
      console.error("Error updating server (network or client-side):", error);
      alert(`Error updating server: ${error.message || "An unknown error occurred."}`);
    } finally {
      await refreshServers(); // Refresh the server list to reflect changes
      setModal({ type: null }); // Close the edit server modal
    }
  };

  const handleDeleteServer = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this server?")) { // Confirmation dialog
      try {
        const response = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
  
        if (!response.ok) {
          const errorData = await response.json();
          console.error("Failed to delete server:", errorData);
          alert(`Failed to delete server: ${errorData.message || response.statusText}`);
          return;
        }
  
        alert("Server deleted successfully!");
        if (activeServer?.inventoryID === id) {
          setActiveServer(null); // Clear the active server if it was deleted
        }
      } catch (error: any) {
        console.error("Error deleting server (network or client-side):", error);
        alert(`Error deleting server: ${error.message || "An unknown error occurred."}`);
      } finally {
        await refreshServers(); 
      }
    }
  };

  // --- Component Render ---
  return (
    <div className="flex font-sans bg-slate-950 text-slate-300 min-h-screen">
      <Sidebar
        zones={zones}
        activeServer={activeServer}
        onSelectServer={(server) => {
          setActiveServer(server);
        }}
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
              onRefresh={async () => {
                await refreshServers();
              }}
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

      {/* Modals for server management */}
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