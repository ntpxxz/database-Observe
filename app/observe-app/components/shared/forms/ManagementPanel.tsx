// src/components/ManagementPanel.tsx

import React, { FC, useState } from 'react';
import { Database, Plus, Edit, Trash2 } from 'lucide-react';
import { DatabaseInventory } from '@/types';
import { EditDatabaseModal } from './EditDatabaseModal';
import { ServerDetailModal } from './ServerDetailModal';
import { AddDatabaseModal } from './AddDatabaseModal';

interface ManagementPanelProps {
    servers: DatabaseInventory[];
    onAdd: (serverData: Omit<DatabaseInventory, 'inventoryID'>) => Promise<void>;
    onEdit: (serverData: DatabaseInventory) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
    onRefresh?: () => Promise<void>;
}


export const ManagementPanel: FC<ManagementPanelProps> = ({ 
    servers, 
    onAdd, 
    onEdit, 
    onDelete,
    onRefresh
}) => {
    const [selectedServer, setSelectedServer] = useState<DatabaseInventory | null>(null);
    const [viewingServer, setViewingServer] = useState<DatabaseInventory | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);   

    const handleOpenEditModal = (e: React.MouseEvent, server: DatabaseInventory) => {
        e.stopPropagation(); // Prevent row click
        setSelectedServer(server);
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        setSelectedServer(null);
    };

    const handleRowClick = (server: DatabaseInventory) => {
        setViewingServer(server);
    };
    const handleEdit = async (data: DatabaseInventory) => {
        try {
            const response = await fetch(`/api/inventory/${data.inventoryID}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorBody = await response.json();
                throw new Error(errorBody.message || 'Failed to update.');
            }
            
            // เมื่อสำเร็จ ต้องหาวิธีรีเฟรชข้อมูล
            // วิธีที่ง่ายที่สุด (แต่ไม่ดีที่สุด) คือการ reload หน้า
            window.location.reload(); 

        } catch (error) {
            alert(`Operation Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error; // ส่ง error กลับไปให้ modal แสดงผล
        }
    };

    const handleDeleteClick = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('Are you sure you want to delete this database?')) {
            try {
                await onDelete(id);
                window.alert('Database deleted successfully!');
                if (onRefresh) await onRefresh();
            } catch (error) {
                console.error('Failed to delete:', error);
                window.alert('Delete operation failed.');
            }
        }
    };

    return (
        <div className="bg-slate-800/50 p-6 rounded-xl border border-white/10">
            {/* Header section with title and add button */}
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold flex items-center text-white">
                    <Database className="mr-3 text-sky-400" />
                    Database Inventory
                </h3>
                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm transition-colors"
                >
                    <Plus size={16} className="mr-2" />
                    Add Database
                </button>
            </div>

            {/* Table section */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                    <thead className="text-xs text-slate-400 uppercase">
                        <tr>
                            <th className="px-4 py-3">System Name</th>
                            <th className="px-4 py-3">Database Type</th>
                            <th className="px-4 py-3">Connection</th>
                            <th className="px-4 py-3">Database Name</th>
                            <th className="px-4 py-3">Owner</th>
                            <th className="px-4 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {servers.map(server => (
                            <tr 
                                key={server.inventoryID} 
                                className="border-b border-slate-700 hover:bg-slate-800/50 cursor-pointer"
                                onClick={() => handleRowClick(server)}
                            >
                                <td className="px-4 py-3 font-semibold">{server.systemName}</td>
                                <td className="px-4 py-3"><span className="px-2 py-1 text-xs rounded-full bg-slate-700">{server.databaseType}</span></td>
                                <td className="px-4 py-3 font-mono">{server.serverHost}:{server.port}</td>
                                <td className="px-4 py-3">{server.databaseName}</td>
                                <td className="px-4 py-3">{server.ownerContact}</td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-center gap-2">
                                        <button 
                                            onClick={(e) => handleOpenEditModal(e, server)}
                                            className="p-2 text-slate-400 hover:text-sky-400" 
                                            title="Edit Database"
                                        >
                                            <Edit size={16} />
                                        </button>
                                        <button 
                                            onClick={(e) => handleDeleteClick(e, server.inventoryID)} 
                                            className="p-2 text-slate-400 hover:text-red-400" 
                                            title="Delete Database"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modals */}
            {viewingServer && (
                <ServerDetailModal
                    server={viewingServer}
                    onClose={() => setViewingServer(null)}
                />
            )}

            {isAddModalOpen && (
                <AddDatabaseModal
                    // ✅ CORRECTED: Use 'onSubmit' which the modal expects
                    onSubmit={async (data) => {
                        // Use the 'onAdd' function passed from the parent component
                        await onAdd(data);
                        // Refresh data if the function is provided
                        if (onRefresh) await onRefresh();
                    }}
                    onClose={() => setIsAddModalOpen(false)}
                />
            )}

             { isEditModalOpen && selectedServer && (
                <EditDatabaseModal
                    server={selectedServer}
                    // ✅ ส่งฟังก์ชัน handleEdit ที่เราเพิ่งสร้างขึ้นไปให้ modal
                    onEdit={handleEdit}
                    onClose={() => setIsEditModalOpen(false)}
                />
            )}
            
            
        </div>
        
    );
};