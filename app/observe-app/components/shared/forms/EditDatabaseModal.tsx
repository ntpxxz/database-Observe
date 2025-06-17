import React, { FC, useState, useEffect } from 'react';
import { DatabaseInventory, DbType } from '@/types';
import { X } from 'lucide-react';

interface EditDatabaseModalProps {
  server: DatabaseInventory;
  onEdit: (data: DatabaseInventory) => Promise<void>;
  onClose: () => void;
}

export const EditDatabaseModal: FC<EditDatabaseModalProps> = ({
  server,
  onEdit,
  onClose,
}) => {
  const [formData, setFormData] = useState({
    systemName: server.systemName,
    serverHost: server.serverHost,
    port: server.port,
    databaseName: server.databaseName,
    databaseType: server.databaseType as DbType,
    connectionUsername: server.connectionUsername,
    credentialReference: server.credentialReference,
    purposeNotes: server.purposeNotes || '',
    ownerContact: server.ownerContact,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({
      systemName: server.systemName,
      serverHost: server.serverHost,
      port: server.port,
      databaseName: server.databaseName,
      databaseType: server.databaseType,
      connectionUsername: server.connectionUsername,
      credentialReference: server.credentialReference,
      purposeNotes: server.purposeNotes || '',
      ownerContact: server.ownerContact,
    });
  }, [server]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'port' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);  
    setError(null);

    try {
      // Construct the full object to send, including the non-editable ID
      const fullData: DatabaseInventory = {
        ...formData,
        inventoryID: server.inventoryID,
      };
      await onEdit(fullData);
      onClose(); // Close the modal on success
    } catch (err) {
      console.error('Failed to update database:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl w-full max-w-md border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Edit Database</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            disabled={isSubmitting}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              System Name
            </label>
            <input
              type="text"
              name="systemName"
              value={formData.systemName}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Server Host
              </label>
              <input
                type="text"
                name="serverHost"
                value={formData.serverHost}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
                required
                disabled={isSubmitting}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">
                Port
              </label>
              <input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
                min="0"
                max="65535"
                className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Database Name
            </label>
            <input
              type="text"
              name="databaseName"
              value={formData.databaseName}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Database Type
            </label>
            <select
              name="databaseType"
              value={formData.databaseType}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
              required
              disabled={isSubmitting}
            >
              <option value="MSSQL">MSSQL</option>
              <option value="POSTGRES">PostgreSQL</option>
              <option value="MYSQL">MySQL</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Username
            </label>
            <input
              type="text"
              name="connectionUsername"
              value={formData.connectionUsername}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Credential Reference
            </label>
            <input
              type="text"
              name="credentialReference"
              value={formData.credentialReference}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Purpose Notes
            </label>
            <textarea
              name="purposeNotes"
              value={formData.purposeNotes}
              onChange={handleChange}
              rows={3}
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300">
              Owner Contact
            </label>
            <input
              type="text"
              name="ownerContact"
              value={formData.ownerContact}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
              required
              disabled={isSubmitting}
            />
          </div>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
       <button
              type="submit" // The onClick handler was removed as it's redundant
              className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating...' : 'Update Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
