import { FC, useEffect, useState } from "react";
import { DatabaseInventory } from "@/types";
import { X } from "lucide-react";

interface ServerDetailModalProps {
  isOpen: boolean;
  server: DatabaseInventory | null; // อาจมาจากลิสต์ (ข้อมูลไม่ครบ)
  insight?: unknown;
  onClose: () => void;
}

const DetailItem: FC<{
  label: string;
  value: string | number | null | undefined;
}> = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-xs text-slate-400">{label}</span>
    <span className="text-sm text-white break-words whitespace-pre-wrap">
      {value ?? "-"}
    </span>
  </div>
);

export const ServerDetailModal: FC<ServerDetailModalProps> = ({
  isOpen,
  server,
  insight,
  onClose,
}) => {
  const [detail, setDetail] = useState<DatabaseInventory | null>(null);
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ปิดด้วย Esc
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  // โหลดรายละเอียดเต็มเมื่อเปิดโมดัล
  useEffect(() => {
    const load = async () => {
      if (!isOpen || !server?.inventoryID) return;
      setLoading(true);
      setErrMsg(null);
      setConnectionError(undefined);
      try {
        const res = await fetch(`/api/inventory/${server.inventoryID}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Failed to load server");

        // ถ้า API แนบ connectionError มาก็เก็บไว้ (แต่อย่าบล็อก UI)
        if (data.connectionError) {
          setConnectionError(String(data.connectionError));
        }

        // เก็บรายละเอียดเต็มสำหรับการแสดงผล
        setDetail({
          ...server,         // คงค่าที่มีจากลิสต์ (เช่น systemName) ไว้
          ...data,           // ทับด้วยข้อมูลเต็มจาก API (purposeNotes/ownerContact ฯลฯ)
        });
      } catch (e: unknown) {
        setErrMsg(String(e));
        // fallback: แสดงเท่าที่มีจาก prop server
        setDetail(server ?? null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen, server?.inventoryID]); 
  if (!isOpen) return null;

  const isInsightView = !!insight;
  const view = detail ?? server; 

  const getInsightDetails = (insight: any) => {
    const fallback = insight?.details || {};
    return [
      { label: "Type", value: insight?.type },
      { label: "Query", value: insight?.query || fallback.query },
      { label: "Session ID", value: insight?.session_id || insight?.spid || fallback.session_id },
      { label: "Start Time", value: insight?.start_time || insight?.timestamp },
      { label: "Duration (ms)", value: insight?.duration || fallback.duration },
      { label: "Count", value: insight?.count || fallback.count },
      { label: "CPU Time", value: insight?.cpu_time || fallback.cpu_time },
      { label: "Wait Type", value: insight?.wait_type || fallback.wait_type },
      { label: "Object Name", value: insight?.object_name || fallback.object_name },
      { label: "Database", value: insight?.database_name || fallback.database_name },
      { label: "Message", value: insight?.message || fallback.message },
    ].filter((i) => i.value !== undefined && i.value !== null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-6 rounded-xl w-full max-w-lg border border-slate-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">
            {isInsightView ? "Insight Details" : `${view?.systemName ?? ""} - Details`}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* แถบแจ้งเตือน/สถานะโหลด */}
        {!isInsightView && (
          <>
            {loading && (
              <div className="mb-3 text-sm text-slate-300 bg-slate-700/50 p-2 rounded">
                Loading details...
              </div>
            )}
            {errMsg && (
              <div className="mb-3 text-sm text-red-300 bg-red-500/10 p-2 rounded">
                {errMsg}
              </div>
            )}
            {connectionError && (
              <div className="mb-3 text-sm text-amber-300 bg-amber-500/10 p-2 rounded">
                Cannot fetch database list: {connectionError}
              </div>
            )}
          </>
        )}

        {isInsightView ? (
          <div className="grid grid-cols-1 gap-4 text-sm text-white max-h-[70vh] overflow-y-auto">
            {getInsightDetails(insight).map((item) => (
              <DetailItem key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        ) : (
          view && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <DetailItem label="Server Name" value={view.systemName} />
                <DetailItem label="Database Type" value={view.databaseType} />
                <DetailItem label="IP Address" value={view.serverHost} />
                <DetailItem
                  label="Port"
                  value={typeof view.port === "number" ? String(view.port) : view.port}
                />
                <DetailItem label="Zone" value={view.zone} />
                <DetailItem label="Owner Contact" value={view.ownerContact} />
                <DetailItem
                  label="Created Date"
                  value={
                    (view as any).createdDate
                      ? new Date((view as any).createdDate).toLocaleDateString()
                      : undefined
                  }
                />
                <DetailItem
                  label="Last Updatad"
                  value={
                    (view as any).updated_at
                      ? new Date((view as any).updated_at).toLocaleDateString()
                      : undefined
                  }
                />
              </div>

              <div className="mt-6">
                <h4 className="text-sm font-medium text-slate-300 mb-2">
                  Purpose Notes
                </h4>
                <div className="bg-slate-700/50 p-4 rounded-lg text-slate-300">
                  {view.purposeNotes || "No notes available"}
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
