import React, { FC, useMemo, useState } from "react";
import { Database, Plus, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { DatabaseInventory } from "@/types";
import { Button } from "@/components/ui/button";

// This component is now "dumb" and only receives props. It doesn't manage its own state.
interface ManagementPanelProps {
  servers: DatabaseInventory[];
  onOpenAddModal: () => void;
  onOpenEditModal: (server: DatabaseInventory) => void;
  onOpenDetailModal: (server: DatabaseInventory) => void;
  onDelete: (id: string) => Promise<void>;
}


export const ManagementPanel: FC<ManagementPanelProps> = ({
  servers,
  onOpenAddModal,
  onOpenEditModal,
  onOpenDetailModal,
  onDelete,
}) => {
  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent row click from firing
    onDelete(id);
  };

  const handleEditClick = (e: React.MouseEvent, server: DatabaseInventory) => {
    e.stopPropagation();
    onOpenEditModal(server);
  };
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  
  const totalPages = Math.ceil(servers.length / rowsPerPage);
  
  const paginatedServers = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return servers.slice(startIndex, startIndex + rowsPerPage);
  }, [servers, currentPage]);
  return (
    <div className="bg-slate-800/50 p-6 rounded-xl border border-white/10">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold flex items-center text-white">
          <Database className="mr-3 text-sky-400" />
          Database Inventory
        </h3>
        <button
          onClick={onOpenAddModal}
          className="flex items-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm"
        >
          <Plus size={16} className="mr-2" /> Add Database
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-slate-300">
          <thead className="text-xs text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-3">System Name</th>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">Database Type</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedServers.map((server) => (
              <tr
                key={server.inventoryID } 
                onClick={() => onOpenDetailModal(server)}
                className="border-b border-slate-700 hover:bg-slate-800/50 cursor-pointer"
              >
                <td className="px-4 py-3 font-semibold">{server.systemName}</td>
                <td className="px-4 py-3">{server.zone}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 text-xs rounded-full bg-slate-700">
                    {server.databaseType}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono">
                  {server.serverHost}:{server.port}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={(e) => handleEditClick(e, server)}
                      className="p-2 text-slate-400 hover:text-sky-400"
                      title="Edit"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={(e) => handleDeleteClick(e, server.inventoryID)}
                      className="p-2 text-slate-400 hover:text-red-400"
                      title="Delete"
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
      {/* Pagination controls */}
      <div className="flex justify-between items-center px-4 py-3 text-sm text-slate-400">
        <span>Total Databases: {servers.length.toLocaleString()}</span>
        <div className="flex items-center gap-4">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              variant="ghost"
              size="sm"
              className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <ChevronLeft size={20} />
            </Button>
            <Button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              variant="ghost"
              size="sm"
              className="p-1 rounded-md hover:bg-slate-700 disabled:text-slate-600 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            >
              <ChevronRight size={20} />
            </Button>
          </div>
        </div>
      </div>

    </div>
  );
};
