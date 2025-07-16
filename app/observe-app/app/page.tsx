'use client';

import React, { FC, useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { ManagementPanel } from '@/components/shared/forms/ManagementPanel';
import { ServerDetailView } from '@/components/dashboard/ServerDetailView';
import { AddDatabaseModal } from '@/components/shared/forms/AddDatabaseModal';
import { EditDatabaseModal } from '@/components/shared/forms/EditDatabaseModal';
import { ServerDetailModal } from '@/components/shared/forms/ServerDetailModal';
import { DatabaseInventory, ServerMetrics, ServerFormData } from '@/types';
import { AlertCircle } from 'lucide-react';

// Custom Hook for managing the server list
const useInventoryManager = () => {
    const [servers, setServers] = useState<DatabaseInventory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const API_URL = '/api/inventory';

    const fetchServers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Failed to fetch server inventory');
            const data = await res.json();
            const serverList: DatabaseInventory[] = data.data || [];
            setServers(serverList.sort((a, b) => a.systemName.localeCompare(b.systemName)));
        } catch (err: any) {
            setError(err.message);
            setServers([]);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL]);

    useEffect(() => { fetchServers(); }, [fetchServers]);
    return { servers, isLoading, error, refreshServers: fetchServers };
};

let REFRESH_INTERVAL_MS = 60000; // 60 seconds

const useDatabaseMetrics = (server: DatabaseInventory | null) => {
    const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMetrics = useCallback(async () => {
        if (!server?.inventoryID) return;

        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/${server.inventoryID}/database`);
            if (!res.ok) throw new Error('Failed to fetch database metrics');
            const json = await res.json();
            setMetrics(json);
        } catch (err: any) {
            setError(err.message);
            setMetrics(null);
        } finally {
            setIsLoading(false);
        }
    }, [server?.inventoryID]);

    useEffect(() => {
        if (server) fetchMetrics();
    }, [server, fetchMetrics]);

    return { metrics, isLoading, error };
};

const useHardwareMetrics = (server: DatabaseInventory | null) => {
    const [hardware, setHardware] = useState<any>(null);
    const [hardwareError, setHardwareError] = useState<string | null>(null);

    const fetchHardware = useCallback(async () => {
        if (!server?.inventoryID) return;
        try {
            const res = await fetch(`/api/inventory/${server.inventoryID}/hardware`);
            if (!res.ok) throw new Error('Failed to fetch hardware metrics');
            const json = await res.json();
            setHardware(json);
        } catch (err: any) {
            setHardwareError(err.message);
            setHardware(null);
        }
    }, [server?.inventoryID]);

    useEffect(() => {
        if (!server) return;
        fetchHardware();

        const intervalId = setInterval(() => {
            fetchHardware();
        }, REFRESH_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [server, fetchHardware]);

    return { hardware, hardwareError, refreshHardware: fetchHardware };
};

const Home: FC = () => {
    const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'detail' | null, data?: any }>({ type: null });
    const { servers, isLoading: isInventoryLoading, error: inventoryError, refreshServers } = useInventoryManager();
    const [activeServer, setActiveServer] = useState<DatabaseInventory | null>(null);
    const { metrics, isLoading: isMetricsLoading, error: metricsError } = useDatabaseMetrics(activeServer);
    const { hardware, hardwareError } = useHardwareMetrics(activeServer);

    const mergedMetrics = metrics ? { ...metrics, hardware: { ...hardware } ?? {}, hardwareError } : { databaseMetrics: {}, hardware: {}, hardwareError: null };

    useEffect(() => {
        if (activeServer && !servers.find(s => s.inventoryID === activeServer.inventoryID)) {
            setActiveServer(null);
        }
    }, [servers, activeServer]);

    const handleAddServer = async (data: ServerFormData) => {
        await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        try {
            setActiveServer(data as DatabaseInventory);
            alert("Server added successfully");
        } catch (error) {
            console.error("Error adding active server:", error);
        }
        await refreshServers();
        setModal({ type: null });
    };

    const handleEditServer = async (data: DatabaseInventory) => {
        await fetch(`/api/inventory/${data.inventoryID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        alert("Server updated successfully");
        try {
            if (activeServer?.inventoryID === data.inventoryID) {
                setActiveServer(data);
            }
        } catch (error) {
            console.error("Error updating active server:", error);
        }
        await refreshServers();
        setModal({ type: null });
    };

    const handleDeleteServer = async (id: string) => {
        if (window.confirm("Are you sure?")) {
            await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
            if (activeServer?.inventoryID === id) setActiveServer(null);
            try {
                alert("Server deleted successfully");
            } catch (error) {
                console.error("Error deleting active server:", error);
            }
            await refreshServers();
        }
    };

    return (
        <div className="flex font-sans bg-slate-950 text-slate-300 min-h-screen">
            <Sidebar 
                servers={servers} 
                activeServer={activeServer}
                onSelectServer={handleSelectserver => {
                    setActiveServer(handleSelectserver);
                }}
            />
            <main className="flex-1 p-4 md:p-8">
                <h1 className="text-3xl font-bold mb-6 text-white">
                    {activeServer ? activeServer.systemName : 'Database Inventory'}
                </h1>
                {inventoryError && <div className="text-red-400 p-3 bg-red-500/10 rounded-lg"><AlertCircle size={16} className="inline mr-2"/>{inventoryError}</div>}
                {isInventoryLoading ? (
                    <p className="text-center py-20 text-slate-400">Loading Inventory...</p>
                ) : (
                    activeServer ? (
                        <ServerDetailView 
                                server={activeServer}
                                metrics={mergedMetrics}
                                isLoading={isMetricsLoading}
                                error={metricsError} 
                                onRefresh={async () => {
                                    if (activeServer) {
                                      await refreshServers();
                                    }
                                }}
                                                        />
                    ) : (
                        <ManagementPanel
                            servers={servers}
                            onOpenAddModal={() => setModal({ type: 'add' })}
                            onOpenEditModal={(server) => setModal({ type: 'edit', data: server })}
                            onOpenDetailModal={(server) => setModal({ type: 'detail', data: server })}
                            onDelete={handleDeleteServer}
                        />
                    )
                )}
            </main>

            <AddDatabaseModal isOpen={modal.type === 'add'} onClose={() => setModal({ type: null })} onAdd={handleAddServer} />
            <EditDatabaseModal isOpen={modal.type === 'edit'} server={modal.data} onClose={() => setModal({ type: null })} onEdit={handleEditServer} />
            <ServerDetailModal isOpen={modal.type === 'detail'} server={modal.data} onClose={() => setModal({ type: null })} />
        </div>
    );
};

export default Home;
