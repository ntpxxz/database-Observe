import React, { FC } from 'react';
import { X } from 'lucide-react';
import { DatabaseInventory } from '@/types';

interface ServerDetailModalProps {
  server: DatabaseInventory;
  onClose: () => void;
}

export const ServerDetailModal: FC<ServerDetailModalProps> = ({ server, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl w-full max-w-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-white">
            Server Details: {server.systemName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailItem label="System Name" value={server.systemName} />
            <DetailItem label="Database Type" value={server.databaseType} />
            <DetailItem label="Server Host" value={server.serverHost} />
            <DetailItem label="Port" value={server.port.toString()} />
            <DetailItem label="Database Name" value={server.databaseName} />
            <DetailItem label="Username" value={server.connectionUsername} />
            <DetailItem label="Owner Contact" value={server.ownerContact} />
            <DetailItem 
              label="Created Date" 
              value={new Date(server.createdDate).toLocaleDateString()} 
            />
          </div>
          
          <div className="mt-6">
            <h4 className="text-sm font-medium text-slate-300 mb-2">Purpose Notes</h4>
            <div className="bg-slate-700/50 p-4 rounded-lg text-slate-300">
              {server.purposeNotes || 'No notes available'}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailItem: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-sm font-medium text-slate-400">{label}</dt>
    <dd className="mt-1 text-sm text-white">{value || 'N/A'}</dd>
  </div>
);