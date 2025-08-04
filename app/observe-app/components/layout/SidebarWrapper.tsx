'use client';

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { DatabaseInventory } from "@/types";

interface SidebarWrapperProps {
  zones: Record<string, DatabaseInventory[]>;
  activeServer: DatabaseInventory | null;
  onSelectServer: (server: DatabaseInventory | null) => void;
}

export default function SidebarWrapper({ zones, activeServer, onSelectServer }: SidebarWrapperProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen">
      {/* Toggle Button */}
      <button
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        className="absolute top-4 left-4 z-50 bg-slate-800 text-white px-3 py-1 rounded hover:bg-slate-700"
      >
        {isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
      </button>

      {/* Sidebar */}
      {isSidebarOpen && (
        <Sidebar
          zones={zones}
          activeServer={activeServer}
          onSelectServer={onSelectServer}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto bg-slate-100 dark:bg-slate-950">
        {/* Your content goes here */}
        {/* e.g., ServerDetailView or DatabaseTableView */}
      </div>
    </div>
  );
}
