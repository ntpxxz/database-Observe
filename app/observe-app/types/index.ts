import { ReactNode } from 'react';
import { Pool as PgPool } from 'pg';
import { ConnectionPool as MssqlPool } from 'mssql';

// Generic pool type that can be either Postgres or MSSQL pool
export type AnyPool = PgPool | MssqlPool;

// Performance insight structure
export interface PerformanceInsight {
  id?: number;
  query?: string;
  duration?: number;
  count?: number;
  type?: string;
  error?: string;
}

export interface Server {
  [x: string]: Key | null | undefined;
  db_type: ReactNode;
  ip_address: ReactNode;
  db_port: ReactNode;
  db_user: ReactNode;
  id: number;
  name: string;
  host: string;
  port: number;
  type: string;
  database: string;
  username: string;
  status: 'active' | 'inactive';
}

export interface ServerFormData {
  name: string;
  host: string;
  port: number;
}

// --- Props for UI Components ---

export interface SidebarProps {
  servers: Server[];
  activeServerId: number | null;
  onSelectServer: (id: number) => void;
}

export interface KPIWidgetProps {
  icon: ReactNode;
  title: string;
  value: string | number | undefined;
  unit?: string;
  color: string;
}

export interface PerformanceInsightsTableProps {
  insights: PerformanceInsight[] | { error: string };
  onAnalyze: (query: PerformanceInsight) => void;
}

export interface ServerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (serverData: ServerFormData) => void;
  serverToEdit: Server | Partial<ServerFormData> | null;
}

export interface ManagementPanelProps {
  servers: Server[];
  onAdd: () => void;
  onEdit: (server: Server) => void;
  onDelete: (id: number) => void;
}

export interface NetworkScannerPanelProps {
  onAdd: (partialServer: Partial<ServerFormData>) => void;
}

export interface QueryAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: PerformanceInsight | null;
}

export interface Metrics {
  kpi: {
    connections: string | number;
    [key: string]: any;
  };
  stats?: {
    cache_hit_rate?: string | number;
    [key: string]: any;
  };
  performanceInsights: PerformanceInsight[] | { error: string };
}

// Database driver interface
export interface Driver {
  connect: (config: any) => Promise<AnyPool>;
  disconnect: (pool: AnyPool) => Promise<void>;
  getMetrics: (pool: AnyPool) => Promise<Partial<Metrics>>;
}

export type DbType = 'POSTGRES' | 'MYSQL' | 'MSSQL';

export interface ServerConfig {
  id?: string;
  name: string;
  host: string;
  port: number;
  type: 'postgres' | 'mysql' | 'mssql';
  username: string;
  password: string;
  database: string;
}

export interface ServerResponse {
  success: boolean;
  data?: ServerConfig;
  error?: string;
}
export interface ServerMetrics {
  server: {
    id: number;
    name: string;
    host: string;
    port: number;
    type: string;
    db_name: string;
  };
  performance: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    active_connections: number;
  };
  status: 'active' | 'inactive';
  last_checked: string;
}

export interface DatabaseInventory {
  id: DatabaseInventory | null;
  inventoryID?: number;
  systemName: string;
  serverHost: string;
  port: number;
  databaseName: string;
  databaseType: string;
  connectionUsername: string;
  credentialReference: string;
  purposeNotes: string;
  ownerContact: string;
  createdDate?: Date;
}

export interface DatabaseResponse {
  success: boolean;
  data?: DatabaseInventory | DatabaseInventory[];
  error?: string;
}

export interface DatabaseMetrics {
  connections: number;
  cache_hit_rate: number;
  slow_queries: Array<{
    query: string;
    duration: number;
    count: number;
  }>;
  last_checked: string;
}