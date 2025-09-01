'use client';
import React, { FC, useState } from "react";
import {
  Server as ServerIcon,
  ChevronDown,
  ChevronRight,
  Database,
  Server,
} from "lucide-react";
import { DatabaseInventory } from "@/types";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface SidebarProps {
  zones: Record<string, DatabaseInventory[]>;
  activeServer: DatabaseInventory | null;
  onSelectServer: (server: DatabaseInventory | null) => void;
  isLoading?: boolean;
}

export const Sidebar: FC<SidebarProps> = ({
  zones,
  activeServer,
  onSelectServer,
  isLoading = false,
}) => {
  const [openZones, setOpenZones] = useState<{ [key: string]: boolean }>({});
  const router = useRouter();

  const handleSelectServerClick = (server: DatabaseInventory) => {
    console.log('Sidebar: Selecting server:', server.systemName);
    onSelectServer(server);

    // เลือกค่าชื่อ DB จากฟิลด์ที่พบบ่อยใน inventory record
    const anyServer = server as any;
    const dbName: string | undefined =
      anyServer?.databaseName ??
      anyServer?.defaultDb ??
      anyServer?.dbName ??
      anyServer?.db ??
      anyServer?.database ??
      undefined;

    if (!dbName) {
      console.warn("[Sidebar] No database name on selected server. Falling back to /inventory page.", server);
      // ถ้าไม่มีชื่อ DB ให้กลับไปหน้า inventory หลัก (หรือปรับตามที่คุณต้องการ)
      router.push(`/inventory`);
      return;
    }

    // นำทางไปยัง TableListPage
    router.push(`/inventory/${server.inventoryID}/tablelist?db=${encodeURIComponent(dbName)}`);
  };

  const handleManageInventoryClick = () => {
    console.log('Sidebar: Selecting server inventory');
    onSelectServer(null);
    router.push('/inventory');
  };

  const navigationItems = [
    {
      name: "Server Inventory",
      icon: Server,
      onClick: handleManageInventoryClick,
      active: !activeServer,
    },
  ];

  return (
    <aside className="w-68 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out relative">
      {/* Header Section */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center justify-start">
          <Image src="/logo/sql-y.png" alt="Logo" width={150} height={200} />
        </div>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-2">
          {/* Main Navigation */}
          {navigationItems.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={item.onClick}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <item.icon className="mr-3" size={18} />
              {item.name}
            </button>
          ))}

          {/* Divider */}
          <div className="border-b border-slate-800 my-4" />

          {/* Section Title */}
          <h2 className="px-3 text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">
          Database Inventory
          </h2>

          {/* Loading State */}
          {isLoading ? (
            <div className="text-center py-8 text-slate-500 animate-pulse">
              <Database size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Loading servers...</p>
            </div>
          ) : Object.keys(zones || {}).length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Database size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">Loading servers...</p>
            </div>
          ) : (
            Object.entries(zones).map(([zone, serverList]) => (
              <div key={zone} className="space-y-1">
                {/* Zone Header */}
                <button
                  type="button"
                  onClick={() =>
                    setOpenZones((prev) => ({
                      ...prev,
                      [zone]: !prev[zone],
                    }))
                  }
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800 text-sm font-medium text-slate-300 transition-colors"
                >
                  <>
                    <span className="flex items-center">
                      <Database className="mr-2 flex-shrink-0" size={16} />
                      <span className="truncate">{zone}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        ({serverList.length})
                      </span>
                    </span>
                    {openZones[zone] ? (
                      <ChevronDown size={16} className="flex-shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="flex-shrink-0" />
                    )}
                  </>
                </button>

                {/* Server List */}
                {openZones[zone] &&
                  serverList.map((server) => {
                    const id = server.inventoryID?.toString?.() ?? "unknown";
                    const isActive = activeServer?.inventoryID === server.inventoryID;

                    return (
                      <div key={id} className="pl-6">
                        <button
                          type="button"
                          onClick={() => handleSelectServerClick(server)}
                          className={`w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-sky-700 text-white"
                              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          }`}
                        >
                          <ServerIcon className="mr-2 flex-shrink-0" size={16} />
                          <span className="truncate">{server.systemName}</span>
                          {isActive && (
                            <div className="ml-auto w-2 h-2 bg-sky-400 rounded-full flex-shrink-0" />
                          )}
                        </button>
                      </div>
                    );
                  })}
              </div>
            ))
          )}
        </nav>
      </div>

      {/* Resize Handle (optional) */}
      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-slate-600 transition-colors opacity-0 hover:opacity-100" />
    </aside>
  );
};
