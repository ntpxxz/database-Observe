"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { DatabaseInventory } from "@/types";

interface ServerContextType {
  servers: DatabaseInventory[];
  activeServer: DatabaseInventory | null;
  zones: Record<string, DatabaseInventory[]>;
  isLoading: boolean;
  error: string | null;
  setActiveServer: (server: DatabaseInventory | null) => void;
  refreshServers: () => Promise<void>;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export const useServerContext = () => {
  const context = useContext(ServerContext);
  if (context === undefined) {
    throw new Error('useServerContext must be used within a ServerProvider');
  }
  return context;
};

interface ServerProviderProps {
  children: ReactNode;
}

export const ServerProvider: React.FC<ServerProviderProps> = ({ children }) => {
  const [servers, setServers] = useState<DatabaseInventory[]>([]);
  const [activeServer, setActiveServer] = useState<DatabaseInventory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const API_URL = "/api/inventory";

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Failed to fetch server inventory");

      const data = await res.json();
      const zonesData: Record<string, DatabaseInventory[]> = data.zones || {};
      const serverList: DatabaseInventory[] = Object.values(zonesData).flat();

      setServers(
        serverList.sort((a, b) => a.systemName.localeCompare(b.systemName)),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setError(message);
      setServers([]);
    } finally {
      setIsLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Group servers by zones
  const zones = servers.reduce(
    (acc: Record<string, DatabaseInventory[]>, server) => {
      const zone = server.zone || "Uncategorized";
      if (!acc[zone]) acc[zone] = [];
      acc[zone].push(server);
      return acc;
    },
    {},
  );

  // Check if active server still exists after refresh
  useEffect(() => {
    if (
      activeServer &&
      !servers.find((s) => s.inventoryID === activeServer.inventoryID)
    ) {
      setActiveServer(null);
    }
  }, [servers, activeServer]);

  // Enhanced setActiveServer function that logs for debugging
  const handleSetActiveServer = useCallback((server: DatabaseInventory | null) => {
    console.log('Setting active server:', server?.systemName || 'null');
    setActiveServer(server);
  }, []);

  const value: ServerContextType = {
    servers,
    activeServer,
    zones,
    isLoading,
    error,
    setActiveServer: handleSetActiveServer,
    refreshServers: fetchServers,
  };

  return (
    <ServerContext.Provider value={value}>
      {children}
    </ServerContext.Provider>
  );
};