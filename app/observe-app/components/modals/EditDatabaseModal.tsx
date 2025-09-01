import React, { FC, useState, useEffect } from "react";
import { DatabaseInventory } from "@/types";
import { X, CheckCircle, AlertTriangle } from "lucide-react";

interface EditDatabaseModalProps {
  isOpen: boolean;
  server: DatabaseInventory | null;
  onClose: () => void;
  onEdit: (data: DatabaseInventory) => Promise<void>;
}

const defaultPorts = {
  MSSQL: 1433,
  POSTGRES: 5432,
  MYSQL: 3306,
};

export const EditDatabaseModal: FC<EditDatabaseModalProps> = ({
  isOpen,
  server,
  onClose,
  onEdit,
}) => {
  const [formData, setFormData] = useState<DatabaseInventory | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: string; 
  } | null>(null);

  useEffect(() => {
    if (isOpen && server) {
      const initialData: DatabaseInventory = {
        ...server,
        systemName: server.systemName || "",
        serverHost: server.serverHost || "",
        port: server.port || defaultPorts[server.databaseType || "MSSQL"],
        zone: server.zone || "",
        databaseType: server.databaseType || "MSSQL",
        connectionUsername: server.connectionUsername || "",
        credentialReference: "", // 🛠️ สำคัญมาก: ให้กรอกใหม่เสมอ
        purposeNotes: server.purposeNotes || "",
        ownerContact: server.ownerContact || "",
        inventoryID: server.inventoryID,
      };
      setFormData(initialData);
      setTestResult(null);
      setIsSubmitting(false);
    }
  }, [isOpen, server]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    if (!formData) return;
    setTestResult(null);

    setFormData((prev) => ({
      ...prev!,
      [name]: name === "port" ? Number(value) : value,
    }));
  };

  const handleTestConnection = async () => {
    if (!formData) return;
    setIsTesting(true);
    setTestResult(null);

    const {
      serverHost,
      port,
      databaseType,
      connectionUsername,
      credentialReference,
    } = formData;

    if (
      !serverHost ||
      !port ||
      !databaseType ||
      !connectionUsername ||
      !credentialReference
    ) {
      setTestResult({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      setIsTesting(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/connections/test?host=${encodeURIComponent(
          formData.serverHost,
        )}&port=${formData.port}&user=${encodeURIComponent(
          formData.connectionUsername,
        )}&pass=${encodeURIComponent(formData.credentialReference)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serverHost,
            port,
            databaseType,
            connectionUsername,
            credentialReference,
          }),
        },
      );
    
        const result = await response.json();
        setTestResult(result);
      } catch (error) {
        setTestResult({
          success: false,
          message: "เกิดข้อผิดพลาดระหว่างการเชื่อมต่อ",
          details: error instanceof Error ? error.message : String(error), // ✅ ไม่มี error แล้ว
        });
      } finally {
        setIsTesting(false);
      }
    }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    if (!testResult?.success) {
      alert("กรุณาทดสอบการเชื่อมต่อให้ผ่านก่อน");
      return;
    }

    setIsSubmitting(true);
    try {
      const dataToSubmit = {
        ...formData,
        serverHost: formData.serverHost.trim(),
        credentialReference: formData.credentialReference,
        port: Number(formData.port),
      };

      await onEdit(dataToSubmit);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`เกิดข้อผิดพลาด: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen || !formData) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl w-full max-w-md border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Edit Database</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            disabled={isSubmitting || isTesting}
          >
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 max-h-[80vh] overflow-y-auto pr-2"
        >
          <div>
            <label className="block text-sm text-slate-300">System Name</label>
            <input
              name="systemName"
              value={formData.systemName ?? ""}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300">IP Address</label>
              <input
                name="serverHost"
                value={formData.serverHost ?? ""}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Port</label>
              <input
                type="number"
                name="port"
                value={formData.port ?? ""}
                onChange={handleChange}
                min={0}
                max={65535}
                required
                disabled={isSubmitting}
                className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-300">Zone</label>
            <input
              name="zone"
              value={formData.zone ?? ""}
              onChange={handleChange}
              className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300">
              Database Type
            </label>
            <select
              name="databaseType"
              value={formData.databaseType}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
            >
              <option value="MSSQL">MSSQL</option>
              <option value="POSTGRES">PostgreSQL</option>
              <option value="MYSQL">MySQL</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300">Username</label>
            <input
              name="connectionUsername"
              value={formData.connectionUsername ?? ""}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300">
              Password / Credential
            </label>
            <input
              type="password"
              name="credentialReference"
              value={formData.credentialReference ?? ""}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300">
              Purpose Notes
            </label>
            <textarea
              name="purposeNotes"
              value={formData.purposeNotes ?? ""}
              onChange={handleChange}
              rows={3}
              className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
              disabled={isSubmitting}
            />
          </div>
          <div>
            <label className="block text-sm text-slate-300">
              Owner Contact
            </label>
            <input
              name="ownerContact"
              value={formData.ownerContact ?? ""}
              onChange={handleChange}
              className="mt-1 w-full rounded bg-slate-700 p-2 text-white"
              required
              disabled={isSubmitting}
            />
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-md text-sm flex items-center gap-2 ${
                testResult.success
                  ? "bg-green-500/10 text-green-300"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {testResult.success ? (
                <CheckCircle size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
              {testResult.message}
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSubmitting}
              className="px-4 py-2 rounded bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-50"
            >
              {isTesting ? "Testing..." : "Test Connection"}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600"
                disabled={isSubmitting || isTesting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-sky-600 text-white hover:bg-sky-700"
                disabled={!testResult?.success || isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Update"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
