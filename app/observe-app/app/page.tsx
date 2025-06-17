'use client';

import React, { FC, useState, useEffect, useCallback } from 'react';
import { ManagementPanel } from '@/components/shared/forms/ManagementPanel';
import { AddDatabaseModal } from '@/components/shared/forms/AddDatabaseModal';
import { EditDatabaseModal } from '@/components/shared/forms/EditDatabaseModal';
import { ServerDetailModal } from '@/components/shared/forms/ServerDetailModal';
import { DatabaseInventory, DatabaseInventoryFormData } from '@/types';
import { Sidebar } from '@/components/layout/Sidebar'; 
import { AlertCircle } from 'lucide-react';

// Custom Hook for Server Inventory Management
const useInventoryManager = (onSuccess?: () => void) => {
    const [servers, setServers] = useState<DatabaseInventory[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const API_URL = '/api/inventory'; 
    

    const fetchServers = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(API_URL);
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: 'Failed to fetch servers' }));
                throw new Error(errorData.message);
            }
            const data = await res.json();
            const serverList: DatabaseInventory[] = data.data || [];
            serverList.sort((a, b) => a.systemName.localeCompare(b.systemName));
            setServers(serverList);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [API_URL]);

    useEffect(() => { fetchServers(); }, [fetchServers]);

    const addServer = async (serverData: DatabaseInventoryFormData) => {
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverData) });
        
        if (!response.ok) throw new Error('Failed to add server');
        alert('Server added successfully');
     
        await fetchServers();
        onSuccess?.();
    };

    const editServer = async (serverData: DatabaseInventory) => {
        const response = await fetch(`${API_URL}/${serverData.inventoryID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverData) });
        if (!response.ok) throw new Error('Failed to edit server');
        alert('Server updated successfully');
        await fetchServers();
        onSuccess?.();
    };

    const deleteServer = async (id: string) => {
        if (!window.confirm("Are you sure?")) return;
        const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete server');
        await fetchServers();
    };

    return { servers, isLoading, error, addServer, editServer, deleteServer };
};


// --- Main Page Component ---
const Home: FC = () => {
    // Single state to control all modals and their data
    const [modal, setModal] = useState<{ type: 'add' | 'edit' | 'detail' | null, data?: DatabaseInventory | null }>({ type: null, data: null });
    
    // Custom hook for all backend logic
    const { servers, isLoading, error, addServer, editServer, deleteServer } = useInventoryManager(() => setModal({ type: null, data: null }));
    
    const activeServer = null; // Placeholder for dashboard view

    return (
        <div className="flex font-sans bg-slate-950 text-slate-300 min-h-screen">
            <Sidebar 
                servers={servers}
                activeServerId={activeServer ? activeServer.inventoryID : null}
                activeView="manage" onSelectServer={function (id: string): void {
                    throw new Error('Function not implemented.');
                } } onSetView={function (view: 'dashboard' | 'manage' | 'scan'): void {
                    throw new Error('Function not implemented.');
                } }            />
            <main className="flex-1 p-4 md:p-8">
                <h1 className="text-3xl font-bold mb-6 text-white">Database Inventory</h1>
                {error && <div className="text-red-400 p-3 bg-red-500/10 rounded-lg mb-4 flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
                
                {isLoading ? (
                    <p className="text-center py-20 text-slate-400">Loading Inventory...</p>
                ) : (
                    <ManagementPanel
                        servers={servers}
                        onOpenAddModal={() => setModal({ type: 'add', data: null })}
                        onOpenEditModal={(server) => setModal({ type: 'edit', data: server })}
                        onOpenDetailModal={(server) => setModal({ type: 'detail', data: server})}
                        onDelete={deleteServer}
                    />
                )}
            </main>

            {/* Modals are rendered here, controlled by the page's state */}
            <AddDatabaseModal 
                isOpen={modal.type === 'add'}
                onClose={() => setModal({ type: null })} 
                onAdd={addServer}
            />
            <EditDatabaseModal 
                isOpen={modal.type === 'edit'}
                server={modal.data}
                onClose={() => setModal({ type: null })} 
                onEdit={editServer} 
            />
            <ServerDetailModal 
                isOpen={modal.type === 'detail'}
                server={modal.data}
                onClose={() => setModal({ type: null })} 
            />
        </div>
    );
};

export default Home;
