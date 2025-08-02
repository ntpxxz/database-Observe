'use client';
import React, { FC, useState } from "react";
import {
  Server as ServerIcon,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  List,
} from "lucide-react";
import { DatabaseInventory } from "@/types";

interface SidebarProps {
  zones: Record<string, DatabaseInventory[]>;
  activeServer: DatabaseInventory | null;
  onSelectServer: (server: DatabaseInventory | null) => void;
}

export const Sidebar: FC<SidebarProps> = ({
  zones,
  activeServer,
  onSelectServer,
}) => {
  const [openZones, setOpenZones] = useState<{ [key: string]: boolean }>({});

  const handleSelectServerClick = async (server: DatabaseInventory) => {
    onSelectServer(server);
  };

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
      <h1 className="text-2xl font-bold mb-6 flex items-center text-white">
        <LayoutDashboard className="mr-3 text-sky-400" />
        Observability
      </h1>
      <nav className="flex-grow space-y-2">
        <button
          onClick={() => onSelectServer(null)}
          className={`w-full flex items-center py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${
            !activeServer
              ? "bg-slate-700 text-white"
              : "text-slate-400 hover:bg-slate-800"
          }`}
        >
          <List className="mr-3" />
          Manage Inventory
        </button>
        <div className="border-b border-slate-800 my-4" />
        <h2 className="px-3 text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
          Databases
        </h2>

        {Object.entries(zones || {}).map(([zone, serverList]) => (
          <div key={zone}>
            <button
              onClick={() =>
                setOpenZones((prev) => ({ ...prev, [zone]: !prev[zone] }))
              }
              className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800 text-sm font-semibold text-slate-300"
            >
              <span>{zone}</span>
              {openZones[zone] ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>

            {openZones[zone] &&
              serverList.map((server) => {
                const id = server.inventoryID?.toString?.() ?? "unknown";
                const isActive =
                  activeServer?.inventoryID === server.inventoryID;

                return (
                  <div key={id} className="ml-2">
                    <button
                      onClick={() => handleSelectServerClick(server)}
                      className={`w-full flex items-center py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-sky-700 text-white"
                          : "text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      <span className="flex items-center">
                        <ServerIcon className="mr-2" size={16} />
                        {server.systemName}
                      </span>
                    </button>
                  </div>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
};
