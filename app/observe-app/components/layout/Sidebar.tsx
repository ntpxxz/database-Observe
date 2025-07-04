import React, { FC, useState } from 'react';
import { Server as ServerIcon, ChevronDown, ChevronRight, LayoutDashboard, List } from 'lucide-react';
import { DatabaseInventory } from '@/types';

interface SidebarProps {
  servers: DatabaseInventory[];
  activeServer: DatabaseInventory | null;
  onSelectServer: (server: DatabaseInventory | null) => void;
}

export const Sidebar: FC<SidebarProps> = ({ servers, activeServer, onSelectServer }) => {
  const [openZones, setOpenZones] = useState<{ [key: string]: boolean }>({});

  const groupedServers = servers.reduce((acc, server) => {
    const zone = server.zone || 'Uncategorized';
    if (!acc[zone]) acc[zone] = [];
    acc[zone].push(server);
    return acc;
  }, {} as { [key: string]: DatabaseInventory[] });

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
        <h1 className="text-2xl font-bold mb-6 flex items-center text-white"><LayoutDashboard className="mr-3 text-sky-400"/> Observability</h1>
        <nav className="flex-grow space-y-2">
            {/* Main Navigation */}
            <button onClick={() => onSelectServer(null)} className={`w-full flex items-center py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${!activeServer ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                <List className="mr-3"/> Manage Inventory
            </button>
            <div className="border-b border-slate-800 my-4"></div>
            <h2 className="px-3 text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Databases</h2>
            {Object.entries(groupedServers).map(([zone, serverList]) => (
                <div key={zone}>
                    <button onClick={() => setOpenZones(p => ({...p, [zone]: !p[zone]}))} className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800 text-sm font-semibold text-slate-300">
                        <span>{zone}</span>
                        {openZones[zone] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {openZones[zone] && (
                        <ul className="pl-4 mt-1 space-y-1">
                            {serverList.map(server => (
                                <li key={server.inventoryID}>
                                    <a href="#" onClick={(e) => { e.preventDefault(); onSelectServer(server); }}
                                        className={`flex items-center py-2 px-3 rounded-lg text-sm relative ${activeServer?.inventoryID === server.inventoryID ? 'bg-sky-500/10 text-sky-300' : 'hover:bg-slate-800/50 text-slate-400'}`}>
                                        {activeServer?.inventoryID === server.inventoryID && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 bg-sky-400 rounded-r-full"></span>}
                                        <ServerIcon size={16} className="mr-3 ml-2"/>{server.systemName}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
        </nav>
    </aside>
  );
};
