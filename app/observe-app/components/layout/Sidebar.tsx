'use client';
import React, { FC, useState } from "react";
import {
  Server as ServerIcon,
  ChevronDown,
  ChevronRight,
  List,
  Database,
 ArrowLeftToLine,
 PanelLeftOpen,
} from "lucide-react";
import { DatabaseInventory } from "@/types";
import { useRouter } from "next/navigation";

interface SidebarProps {
  zones: Record<string, DatabaseInventory[]>;
  activeServer: DatabaseInventory | null;
  onSelectServer: (server: DatabaseInventory | null) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export const Sidebar: FC<SidebarProps> = ({
  zones,
  activeServer,
  onSelectServer,
  isCollapsed: externalIsCollapsed,
  onToggle: externalOnToggle,
}) => {
  const [openZones, setOpenZones] = useState<{ [key: string]: boolean }>({});
  const [internalIsCollapsed, setInternalIsCollapsed] = useState(false);
  const router = useRouter();

  // Use external state if provided, otherwise use internal state
  const isCollapsed = externalIsCollapsed !== undefined ? externalIsCollapsed : internalIsCollapsed;
  
  const toggleSidebar = () => {
    if (externalOnToggle) {
      externalOnToggle();
    } else {
      setInternalIsCollapsed(!internalIsCollapsed);
    }
  };

  const handleSelectServerClick = async (server: DatabaseInventory) => {
    console.log('Sidebar: Selecting server:', server.systemName);
    onSelectServer(server);
  };

  const handleManageInventoryClick = () => {
    console.log('Sidebar: Selecting manage inventory');
    onSelectServer(null);
    router.push('/inventory');
  };

  // Navigation items for future features
  const navigationItems = [
    {
      name: "Manage Inventory",
      icon: List,
      onClick: handleManageInventoryClick,
      active: !activeServer,
    },
    // Future items (commented for now)
    // {
    //   name: "Monitoring",
    //   icon: Activity,
    //   onClick: () => router.push('/monitoring'),
    //   active: false,
    // },
    // {
    //   name: "Settings", 
    //   icon: Settings,
    //   onClick: () => router.push('/settings'),
    //   active: false,
    // },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-72'} bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out relative`}>
      {/* Header Section */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center">
          {/* Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="p-4 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <ArrowLeftToLine size={18} />}
          </button>

          {/* Logo and Title */}
          <div className="flex items-center justify-start space-x-4 px-4">
                       {!isCollapsed && (
              <h1 className="text-xl font-bold text-white truncate ">
                SQL HUB
              </h1>
            )}
          </div>
          
        </div>
      </div>
      
      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-2">
          {/* Main Navigation */}
          {navigationItems.map((item) => (
            <button
              key={item.name}
              onClick={item.onClick}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-3 py-3' : 'px-3 py-2'} rounded-lg text-sm font-medium transition-colors ${
                item.active
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
              title={isCollapsed ? item.name : undefined}
            >
              <item.icon className={isCollapsed ? "" : "mr-3"} size={18} />
              {!isCollapsed && item.name}
            </button>
          ))}

          {/* Divider */}
          <div className="border-b border-slate-800 my-4" />
          
          {/* Section Title */}
          {!isCollapsed && (
            <h2 className="px-3 text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">
              Database Servers
            </h2>
          )}

          {/* Server List by Zones */}
          {Object.entries(zones || {}).map(([zone, serverList]) => (
            <div key={zone} className="space-y-1">
              {/* Zone Header */}
              <button
                onClick={() =>
                  setOpenZones((prev) => ({ ...prev, [zone]: !prev[zone] }))
                }
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-3 py-3' : 'justify-between px-3 py-2'} rounded-lg hover:bg-slate-800 text-sm font-medium text-slate-300 transition-colors`}
                title={isCollapsed ? `${zone} (${serverList.length})` : undefined}
              >
                {!isCollapsed ? (
                  <>
                    <span className="flex items-center">
                      <Database className="mr-2 flex-shrink-0" size={16} />
                      <span className="truncate">{zone}</span>
                      <span className="ml-2 text-xs text-slate-500">({serverList.length})</span>
                    </span>
                    {openZones[zone] ? (
                      <ChevronDown size={16} className="flex-shrink-0" />
                    ) : (
                      <ChevronRight size={16} className="flex-shrink-0" />
                    )}
                  </>
                ) : (
                  <Database size={1} />
                )}
              </button>

              {/* Server List - Expanded State */}
              {openZones[zone] && !isCollapsed &&
                serverList.map((server) => {
                  const id = server.inventoryID?.toString?.() ?? "unknown";
                  const isActive = activeServer?.inventoryID === server.inventoryID;

                  return (
                    <div key={id} className="pl-6">
                      <button
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

              {/* Server List - Collapsed State */}
              {isCollapsed && 
                serverList.map((server) => {
                  const id = server.inventoryID?.toString?.() ?? "unknown";
                  const isActive = activeServer?.inventoryID === server.inventoryID;

                  return (
                    <div key={id}>
                      <button
                        onClick={() => handleSelectServerClick(server)}
                        className={`w-full flex items-center justify-center px-3 py-3 rounded-lg text-sm font-medium transition-colors relative ${
                          isActive
                            ? "bg-sky-700 text-white"
                            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        }`}
                        title={server.systemName}
                      >
                        <ServerIcon size={18} />
                        {isActive && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 bg-sky-400 rounded-full border-2 border-slate-900" />
                        )}
                      </button>
                    </div>
                  );
                })}
            </div>
          ))}

          {/* No servers message */}
          {Object.keys(zones || {}).length === 0 && (
            <div className="text-center py-8 text-slate-500">
              <Database size={isCollapsed ? 24 : 32} className="mx-auto mb-3 opacity-50" />
              {!isCollapsed && (
                <p className="text-sm">No servers found</p>
              )}
            </div>
          )}
        </nav>
      </div>

      {/* Resize Handle (optional - like Claude.ai) */}
      {!isCollapsed && (
        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-slate-600 transition-colors opacity-0 hover:opacity-100" />
      )}
    </aside>
  );
};