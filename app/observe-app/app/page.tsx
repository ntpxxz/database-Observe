"use client";

import React, { FC, useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ManagementPanel } from "@/components/shared/forms/ManagementPanel";
import { ServerDetailView } from "@/components/dashboard/ServerDetailView";
import { AddDatabaseModal } from "@/components/shared/forms/AddDatabaseModal";
import { EditDatabaseModal } from "@/components/shared/forms/EditDatabaseModal";
import { ServerDetailModal } from "@/components/shared/forms/ServerDetailModal";
import { DatabaseInventory, ServerFormData, ServerMetrics } from "@/types";
import { AlertCircle } from "lucide-react";

// Custom Hook for managing all server data and API calls
const useInventoryManager = () => {
  const [servers, setServers] = useState<DatabaseInventory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const API_URL = "/api/inventory";

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Failed to fetch server inventory");
      const data = await res.json();
      const serverList: DatabaseInventory[] = data.data || [];
      setServers(
        serverList.sort((a, b) => a.systemName.localeCompare(b.systemName))
      );
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return { servers, isLoading, error, refreshServers: fetchServers };
};

// Custom Hook for fetching metrics for the selected server
const useServerMetrics = (server: DatabaseInventory | null) => {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
      if (!server?.inventoryID) {
          setMetrics(null);
          return;
      }

      // --- FIX: แก้ไขฟังก์ชัน fetchMetrics ทั้งหมด ---
      const fetchMetrics = async () => {
          setIsLoading(true);
          setError(null);
          try {
              const res = await fetch(`/api/inventory/${server.inventoryID}/metrics`);

              // 1. ตรวจสอบว่า API ตอบกลับมาว่าทำงานสำเร็จหรือไม่
              if (!res.ok) {
                  // ถ้าไม่สำเร็จ ลองอ่าน error message เป็น text ดูก่อน
                  const errorText = await res.text();
                  try {
                      // ลองแปลงเป็น JSON ถ้าทำได้
                      const errorJson = JSON.parse(errorText);
                      throw new Error(errorJson.message || `API Error: ${res.status}`);
                  } catch {
                      // ถ้าแปลงเป็น JSON ไม่ได้ ให้ใช้ errorText ตรงๆ
                      throw new Error(errorText || `API Error: ${res.status}`);
                  }
              }

              // 2. ตรวจสอบว่าการตอบกลับมีเนื้อหาหรือไม่
              const contentType = res.headers.get('content-type');
              if (res.status === 204 || !contentType || !contentType.includes('application/json')) {
                  // ถ้าไม่มีเนื้อหา หรือไม่ใช่ JSON ให้ตั้งค่าเป็น null และจบการทำงาน
                  setMetrics(null); 
                  return;
              }
              
              // 3. ถ้าทุกอย่างถูกต้อง ก็แปลงเป็น JSON ได้อย่างปลอดภัย
              const data: ServerMetrics = await res.json();
              setMetrics(data);

          } catch (err: any) {
              console.error("useServerMetrics Error:", err);
              setError(err.message);
              setMetrics(null);
          } finally {
              setIsLoading(false);
          }
      };
      
      fetchMetrics();

  }, [server]); // Dependency array ยังคงเดิม


  return { metrics, isLoading, error, server };
};

// --- Main Page Component ---
const Home: FC = () => {
  const [modal, setModal] = useState<{
    type: "add" | "edit" | "detail" | null;
    data?: any;
  }>({ type: null, data: null });
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
  } = useServerMetrics(activeServer);

  useEffect(() => {
    if (
      activeServer &&
      !servers.find((s) => s.inventoryID === activeServer.inventoryID)
    ) {
      setActiveServer(null);
    }
  }, [servers, activeServer]);

  const handleAdd = async (data: ServerFormData) => {
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      console.log("Received body:", data);

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.message || "Failed to add server");
      }else {
        alert("Server added successfully!");
      }

      await refreshServers();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleEdit = async (data: DatabaseInventory) => {
    try {
      const res = await fetch(`/api/inventory/${data.inventoryID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.message || "Failed to update server");
      }else {
        alert("Server updated successfully!");
      }
      await refreshServers();
      setModal({ type: null, data: null });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this server?")) return;

    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "DELETE",jj
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.message || "Failed to delete server");
      } else {
        alert("Server deleted successfully!");
      }
      await refreshServers();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <div className="flex font-sans bg-slate-950 text-slate-300 min-h-screen">
      <Sidebar
        servers={servers}
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
          <p className="text-center py-20 text-slate-400">
            Loading Inventory...
          </p>
        ) : activeServer ? (
          // **FIXED**: Pass all required props to the detail view
          <ServerDetailView
            server={activeServer}
            metrics={metrics}
            isLoading={isMetricsLoading}
            error={metricsError}
          />
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
            onDelete={handleDelete}
          />
        )}
      </main>

      {/* Modals are rendered here, controlled by the page's state */}
      <AddDatabaseModal
        isOpen={modal.type === "add"}
        onClose={() => setModal({ type: null })}
        onAdd={handleAdd}
      />
      <EditDatabaseModal
        isOpen={modal.type === "edit"}
        server={modal.data}
        onClose={() => setModal({ type: null })}
        onEdit={handleEdit}
      />
      <ServerDetailModal
        isOpen={modal.type === "detail"}
        server={modal.data}
        onClose={() => setModal({ type: null })}
      />
    </div>
  );
};


export { useInventoryManager, useServerMetrics }; // Export hooks for potential reuse
export { Home as default }; // Export the main component as default   