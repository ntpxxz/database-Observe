'use client';
import React, { FC, useState } from 'react';
import { Server as ServerIcon, ChevronDown, ChevronRight, Home } from 'lucide-react';
import { DatabaseInventory } from '@/types';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  servers: DatabaseInventory[];
  activeServerId?: number | null;
  onSelectServer?: (id: number) => void;
}

export const Sidebar: FC<SidebarProps> = ({ servers, activeServerId, onSelectServer }) => {
  const [isServerExpanded, setIsServerExpanded] = useState(true);
  const pathname = usePathname();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home }
  ];

  return (
    <aside className="flex h-screen w-64 flex-col bg-gray-800">
      <div className="flex h-16 items-center px-4">
        <h1 className="text-xl font-bold text-white">DB Observer</h1>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md 
              ${pathname === item.href 
                ? 'bg-gray-900 text-white' 
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}
          >
            <item.icon className="mr-3 h-5 w-5" />
            {item.name}
          </Link>
        ))}

        {/* Servers Section */}
        <div className="pt-4">
          <button 
            onClick={() => setIsServerExpanded(!isServerExpanded)}
            className="w-full flex items-center justify-between py-2 px-2 text-gray-300 hover:bg-gray-700 rounded-md"
          >
            <div className="flex items-center">
              <ServerIcon className="mr-3 h-5 w-5" />
              <span className="font-medium">Servers</span>
            </div>
            {isServerExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {isServerExpanded && servers && servers.length > 0 && (
            <div className="mt-1 pl-2">
              {servers.map((server) => (
                <button
                  key={server.inventoryID}
                  onClick={() => onSelectServer?.(server.inventoryID)}
                  className={`w-full flex items-center px-3 py-2 text-sm rounded-lg transition-colors
                    ${activeServerId === server.inventoryID 
                      ? 'bg-sky-500/10 text-sky-300' 
                      : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
                >
                  <ServerIcon size={16} className="mr-2" />
                  {server.systemName}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
};
