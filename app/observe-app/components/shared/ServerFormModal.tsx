import React, { FC, useState, useEffect } from 'react';
import { DatabaseInventory, DbType } from '@/types';
import { X } from 'lucide-react';

interface ServerFormModalProps {
  // Prop สำหรับควบคุมการแสดงผลโดยตรงจาก Parent Component
  isOpen: boolean; 
  server: DatabaseInventory | null;
  onSubmit: (data: DatabaseInventory | Omit<DatabaseInventory, 'inventoryID' >) => Promise<void>;
  onClose: () => void;
}

export const ServerFormModal: FC<ServerFormModalProps> = ({ isOpen, server, onClose }) => {
  const isEditing = !!(server && server.inventoryID);

  // ฟังก์ชันสำหรับสร้างข้อมูลฟอร์มเริ่มต้น
  const getInitialFormData = () => ({
    systemName: '',
    serverHost: '',
    port: 1433,
    databaseName: '',
    databaseType: 'MSSQL' as DbType,
    connectionUsername: '',
    credentialReference: '',
    purposeNotes: '',
    ownerContact: ''
  });

  const [formData, setFormData] = useState(getInitialFormData());

  // อัปเดตข้อมูลในฟอร์มทุกครั้งที่ Modal ถูกเปิด
  useEffect(() => {
    if (isOpen) {
      if (isEditing && server) {
        // ถ้าเป็นการแก้ไข, ให้ใช้ข้อมูลของ server นั้น
        setFormData({
          systemName: server.systemName,
          serverHost: server.serverHost,
          port: server.port,
          databaseName: server.databaseName,
          databaseType: server.databaseType as DbType,
          connectionUsername: server.connectionUsername,
          credentialReference: server.credentialReference,
          purposeNotes: server.purposeNotes,
          ownerContact: server.ownerContact
        });
      } else {
        // ถ้าเป็นการเพิ่มใหม่, ให้รีเซ็ตฟอร์มเป็นค่าว่าง
        setFormData(getInitialFormData());
      }
    }
  }, [isOpen, server, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: name === 'port' ? Number(value) : value }));
  };

  const handleSubmit = async (formdata: Omit<DatabaseInventory, 'inventoryID'>) => {
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formdata),
    });
    if (!res.ok) throw new Error('Failed to add');
    // อาจจะ refresh รายการใหม่หลังเพิ่ม
  };
  


  // ใช้ prop `isOpen` ในการควบคุมการแสดงผลโดยตรง
  if (!isOpen) {
      return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl w-full max-w-md border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Database' : 'Add Database'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(formData); }} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
          {/* Form Fields Go Here... */}
            <div>
                <label className="block text-sm font-medium text-slate-300">System Name</label>
                <input type="text" name="systemName" value={formData.systemName} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Server Host</label>
                <input type="text" name="serverHost" value={formData.serverHost} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Port</label>
                <input type="number" name="port" value={formData.port} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Database Name</label>
                <input type="text" name="databaseName" value={formData.databaseName} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Database Type</label>
                <select name="databaseType" value={formData.databaseType} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2">
                    <option value="MSSQL">MSSQL</option>
                    <option value="POSTGRES">PostgreSQL</option>
                    <option value="MYSQL">MySQL</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Connection Username</label>
                <input type="text" name="connectionUsername" value={formData.connectionUsername} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Credential Reference</label>
                <input type="text" name="credentialReference" value={formData.credentialReference} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Purpose Notes</label>
                <textarea name="purposeNotes" value={formData.purposeNotes} onChange={handleChange} rows={3} className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-300">Owner Contact</label>
                <input type="text" name="ownerContact" value={formData.ownerContact} onChange={handleChange} required className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"/>
            </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 text-white hover:bg-slate-600">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700">{isEditing ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};



