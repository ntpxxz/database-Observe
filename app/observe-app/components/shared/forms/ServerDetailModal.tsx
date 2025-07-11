import { FC } from "react";
import { DatabaseInventory } from "@/types";
import { X } from "lucide-react";

interface ServerDetailModalProps {
  isOpen: boolean;
  server: DatabaseInventory | null;
  onClose: () => void;
}

// Simple DetailItem component definition
const DetailItem: FC<{
  label: string;
  value: string | number | null | undefined;
}> = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-xs text-slate-400">{label}</span>
    <span className="text-sm text-white">{value ?? "-"}</span>
  </div>
);

export const ServerDetailModal: FC<ServerDetailModalProps> = ({
  isOpen,
  server,
  onClose,
}) => {
  if (!isOpen || !server) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl w-full max-w-lg border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">
            {server.systemName} - Details
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
            <DetailItem label="Zone" value={server.zone} />
            <DetailItem label="Database Name" value={server.databaseName} />
            <DetailItem label="Username" value={server.connectionUsername} />
            <DetailItem label="Owner Contact" value={server.ownerContact} />
            <DetailItem
              label="Created Date"
              value={server.createdDate ? new Date(server.createdDate).toLocaleDateString() : undefined}
            />
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-medium text-slate-300 mb-2">
              Purpose Notes
            </h4>
            <div className="bg-slate-700/50 p-4 rounded-lg text-slate-300">
              {server.purposeNotes || "No notes available"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
