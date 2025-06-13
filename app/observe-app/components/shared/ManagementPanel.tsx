import React, { FC, useState } from 'react';
import { Database, Plus, Edit, Trash2 } from 'lucide-react';
import { DatabaseInventory } from '@/types';
import { ServerFormModal } from './ServerFormModal';
import { ServerDetailModal } from './ServerDetailModal';

interface ManagementPanelProps {
  servers: DatabaseInventory[];
  onAdd: (serverData: Omit<DatabaseInventory, 'inventoryID'>) => Promise<void>;
  onEdit: (serverData: DatabaseInventory) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const ManagementPanel: FC<ManagementPanelProps> = ({ servers, onAdd, onEdit, onDelete }) => {
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [selectedServer, setSelectedServer] = useState<DatabaseInventory | null>(null);
    const [viewingServer, setViewingServer] = useState<DatabaseInventory | null>(null);

    // แก้ไขการจัดการ event handlers
    const handleOpenModal = (e?: React.MouseEvent, server?: DatabaseInventory) => {
        e?.stopPropagation(); // ป้องกันการ bubble ขึ้นไปที่ row
        setSelectedServer(server || null);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setSelectedServer(null);
        setIsModalOpen(false);
    };

    const handleSubmit = async (data: any) => {
        try {
            if (selectedServer?.inventoryID) {
                await onEdit({ ...data, inventoryID: selectedServer.inventoryID });
            } else {
                await onAdd(data);
            }
            handleCloseModal();
        } catch (error) {
            console.error('Failed to submit:', error);
        }
    };

    const handleRowClick = (server: DatabaseInventory) => {
        setViewingServer(server);
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
                    onClick={() => handleOpenModal()}
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
                                            onClick={(e) => handleOpenModal(e, server)} // เพิ่ม event parameter
                                            className="p-2 text-slate-400 hover:text-sky-400" 
                                            title="Edit Database"
                                        >
                                            <Edit size={16} />
                                        </button>
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(String(server.inventoryID));
                                            }} 
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
            {isModalOpen && (
                <ServerFormModal
                    server={selectedServer}
                    onSubmit={handleSubmit}
                    onClose={handleCloseModal} isOpen={true}                />
            )}

            {viewingServer && (
                <ServerDetailModal
                    server={viewingServer}
                    onClose={() => setViewingServer(null)}
                />
            )}
        </div>
    );
};
