import React, { FC, useState, useEffect } from "react";
import { DatabaseInventory, DbType } from "@/types";
import { X, CheckCircle, AlertTriangle } from "lucide-react";

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: DatabaseInventory) => Promise<void>;
  initialData?: Partial<DatabaseInventory> | null;
}

export const AddServerModal: FC<AddServerModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  initialData,
}) => {
  const getInitialState = (): DatabaseInventory => ({
    systemName: "",
    serverHost: "",
    port: 1433,
    zone: "",
    databaseType: "MSSQL",
    connectionUsername: "",
    credentialReference: "",
    purposeNotes: "",
    ownerContact: "",
    inventoryID: "",
    status: "Active"
  });

  const defaultPorts: Record<DbType, number> = {
    MSSQL: 1433,
    POSTGRES: 5432,
    MYSQL: 3306,
  };

  const [formData, setFormData] =
    useState<DatabaseInventory>(getInitialState());
  const [isTesting, setIsTesting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...getInitialState(), ...initialData });
      setTestResult(null);
      setIsSubmitting(false);
    }
  }, [isOpen, initialData]);
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
    }

    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setTestResult(null);

    if (name === "databaseType") {
      setFormData((prev) => ({
        ...prev,
        databaseType: value as DbType,
        port: defaultPorts[value as DbType],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: name === "port" ? Number(value) : value,
      }));
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // ตรวจสอบค่าที่จำเป็น
    if (
      !formData.serverHost?.trim() ||
      !formData.databaseType ||
      !formData.port ||
      !formData.connectionUsername ||
      !formData.credentialReference
    ) {
      setTestResult({ success: false, message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      setIsTesting(false);
      return;
    }

    try {
      const response = await fetch("/api/connections/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverHost: formData.serverHost.trim(),
          port: formData.port,
          databaseType: formData.databaseType,
          connectionUsername: formData.connectionUsername,
          credentialReference: formData.credentialReference,
        }),
      });

      const result = await response.json();
      setTestResult(result);
      
    } catch (error) {
      console.error("Connection test failed:", error);
      setTestResult({
        success: false,
        message: "เกิดข้อผิดพลาดระหว่างการเชื่อมต่อ",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testResult?.success) {
      alert("Please test the connection successfully before adding.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onAdd(formData);
      setFormData(getInitialState());
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert(`Failed to add server: ${message}`);
    } finally {
      setIsSubmitting(false);
    }
  };
  

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl w-full max-w-md border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">Add New Server</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
            disabled={isSubmitting}
          >
            <X size={20} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 max-h-[80vh] overflow-y-auto pr-2"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Server Name
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
                IP Address
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
              placeholder="e.g., asia-southeast1"
              className="mt-1 block w-full rounded-md bg-slate-700 border-slate-600 text-white p-2"
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
              Password / Credential
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
            <div
              className={`p-3 rounded-md text-sm flex items-center gap-2 ${testResult.success ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-400"}`}
            >
              {testResult.success ? (
                <CheckCircle size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
              {testResult.message}
            </div>
          )}

          <div className="flex justify-between items-center pt-4">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSubmitting}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-slate-500 disabled:opacity-50"
            >
              {isTesting ? "Testing..." : "Test Connection"}
            </button>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!testResult?.success || isSubmitting}
                className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:bg-sky-900 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Adding..." : "Add Server"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
