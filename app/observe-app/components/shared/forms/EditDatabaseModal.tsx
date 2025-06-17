import React, { FC, useState, useEffect } from 'react';
import { DatabaseInventory, ServerFormData } from '@/types';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';

interface EditDatabaseModalProps {
  isOpen: boolean;
  server: DatabaseInventory | null;
  onClose: () => void;
  onEdit: (data: DatabaseInventory) => Promise<void>;
}

export const EditDatabaseModal: FC<EditDatabaseModalProps> = ({ isOpen, server, onClose, onEdit }) => {
  const [formData, setFormData] = useState<Partial<ServerFormData>>({});
  const [isTesting, setIsTesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (server && isOpen) {
      setFormData({ ...server, password: '' });
      setTestResult(null);
      setIsSubmitting(false);
    }
  }, [server, isOpen]);

  if (!isOpen || !server) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTestResult(null);
    setFormData(prev => ({ ...prev, [name]: name === 'port' ? Number(value) : value }));
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
        const payloadForTest = {
            ...server, // Start with existing data
            ...formData, // Overwrite with any new changes from the form
        };
      const response = await fetch('/api/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadForTest),
      });
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
        const updatedData = { ...server, ...formData };
        await onEdit(updatedData);
        onClose();
    } catch (err: any) {
        alert(`Failed to update database: ${err.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-slate-800 p-6 rounded-xl w-full max-w-md border border-slate-700">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">Edit Database</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white" disabled={isSubmitting || isTesting}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
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
              Zone
            </label>
            <input
              type="text"
              name="zone"
              value={formData.zone}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md bg-slate-700 p-2"
              disabled={isSubmitting}
            />
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
              Passeword
            </label>
            <input
              type="password"
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

          {testResult && (
                    <div className={`p-3 rounded-md text-sm flex items-center gap-2 ${testResult.success ? 'bg-green-500/10 text-green-300' : 'bg-red-500/10 text-red-400'}`}>
                        {testResult.success ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        {testResult.message}
                    </div>
                )}
                <div className="flex justify-between items-center pt-4">
                    <button type="button" onClick={handleTestConnection} disabled={isTesting || isSubmitting} className="px-4 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-50">
                        {isTesting ? 'Testing...' : 'Test Connection'}
                    </button>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600" disabled={isSubmitting || isTesting}>Cancel</button>
                        <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700" disabled={isSubmitting}>
                            {isSubmitting ? 'Updating...' : 'Update'}
                        </button>
                    </div>
                </div>
            </form>
      </div>
    </div>
  );
};
