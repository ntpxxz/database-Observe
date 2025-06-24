'use client';

import React, { FC, useState, useEffect, useCallback } from 'react';
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
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error('Failed to fetch server inventory');
            const data = await res.json();
            const serverList: DatabaseInventory[] = data.data || [];
            setServers(serverList.sort((a, b) => a.systemName.localeCompare(b.systemName)));
            setError(null);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL]);

    useEffect(() => { fetchServers(); }, [fetchServers]);

    return { servers, isLoading, error, refreshServers: fetchServers };
};

// Custom Hook for fetching metrics for the selected server
// --- Custom Hook for fetching metrics (เวอร์ชันสืบสวน) ---
const useServerMetrics = (server: DatabaseInventory | null) => {
    const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- LOG 3 ---
    // Log นี้บอกเราว่า Hook ได้รับ `server` object ตัวไหนเข้ามาในแต่ละครั้งที่ re-render
    console.log(`%c3. [useServerMetrics Hook] Received server prop: ${server?.systemName ?? 'null'}`, 'color: orange;');

    useEffect(() => {
        const controller = new AbortController();
        const signal = controller.signal;

        if (!server?.inventoryID) {
            setMetrics(null);
            setIsLoading(false);
            setError(null);
            return;
        }
        
        const fetchMetricsForServer = async () => {
            // --- LOG 4 ---
            // Log ยืนยันว่า Effect กำลังจะเริ่มดึงข้อมูลสำหรับ Server ตัวไหน
            console.log(`%c4. [useServerMetrics Effect] Firing effect for: ${server?.systemName}`, 'color: green;');
            
            setIsLoading(true);
            setError(null);
            setMetrics(null);
            try {
                const res = await fetch(`/api/inventory/${server.inventoryID}/metrics`, { signal }); // <--- เพิ่ม signal
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.message || 'Failed to fetch metrics');
                }
                const data: ServerMetrics = await res.json();
                //--- LOG 5 ---
                // Log ยืนยันว่าเราได้ข้อมูล metrics ใหม่มาแล้ว
                console.log(`%c5. [useServerMetrics Success] Fetched and set new metrics for: ${server?.systemName}`, 'color: lightgreen;');
                setMetrics(data);

            } catch (err: any) {
                if (err.name === 'AbortError') {
                    // --- LOG 6 ---
                    // Log นี้จะทำงานเมื่อ fetch ถูกยกเลิก
                    // เช่น เมื่อ user เลือก server ใหม่ก่อนที่ fetch จะเสร็จ
                    console.log(`%c6. [useServerMetrics Aborted] Fetch aborted for previous server: ${server?.systemName}`, 'color: gray;');
                } else {
                    setError(err.message);
                    setMetrics(null);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetricsForServer();
        
        // Cleanup function: จะทำงานเมื่อ user เลือก server ใหม่ก่อนที่ fetch ครั้งเก่าจะเสร็จ
        return () => {
            controller.abort();
        };

    }, [server?.inventoryID]);

   
    const refreshMetrics = useCallback(() => {
        if (server?.inventoryID) {
            // Trigger a re-fetch by updating a dependency
            setError(null);
            setMetrics(null);
            setIsLoading(true);
        }
    }, [server?.inventoryID]);
    return { metrics, isLoading, error, refreshMetrics };
};

// --- Main Page Component ---
const Home: FC = () => {
    const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'detail' | null, data?: any }>({ type: null });
    const { servers, isLoading: isInventoryLoading, error: inventoryError, refreshServers } = useInventoryManager();
    const [activeServer, setActiveServer] = useState<DatabaseInventory | null>(null);
    const { metrics, isLoading: isMetricsLoading, error: metricsError, refreshMetrics } = useServerMetrics(activeServer);
    console.log(`%c2. [Home Component Render] Current activeServer state is: ${activeServer?.systemName ?? 'null'}`, 'color: yellow;');
    // This effect ensures the view updates correctly if the active server is deleted
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
                    console.log(`%c1. [Sidebar] Selected server: ${handleSelectserver.systemName}`, 'color: blue;');
                    setActiveServer(handleSelectserver);
                }
                }
                onRefresh={refreshServers}  
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
                            metrics={metrics}
                            isLoading={isMetricsLoading}
                            error={metricsError}
                            onRefresh={refreshMetrics}
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

