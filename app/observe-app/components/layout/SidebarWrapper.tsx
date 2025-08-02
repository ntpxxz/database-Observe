// components/SidebarWrapper.tsx
'use client';

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { DatabaseInventory } from "@/types";

interface SidebarWrapperProps {
  zones: Record<string, DatabaseInventory[]>;
  
}

export default function SidebarWrapper({ zones }: SidebarWrapperProps) {
  
  const [activeServer, setActiveServer] = useState<DatabaseInventory | null>(null);

const cleanedZones = Object.fromEntries(
  Object.entries(zones).map(([zone, dbs]) => [    
    zone,
    dbs.filter((db) => !db.inventoryID),  ])
);

  return (
    <Sidebar
      zones={cleanedZones}
      activeServer={activeServer}
      onSelectServer={setActiveServer}
      
    />
  );
}
