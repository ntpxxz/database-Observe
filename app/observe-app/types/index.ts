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

// First, standardize the database types
export type DbType = 'MSSQL' | 'POSTGRES' | 'MYSQL';

// Create a base connection config type
export interface DatabaseConnectionConfig {
  serverHost: string;
  port: number;
  databaseName: string;
  databaseType: DbType;
  connectionUsername: string;
  credentialReference: string;
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    enableArithAbort?: boolean;
  };
}

// Update ServerConfig to remove duplicates
export interface ServerConfig extends DatabaseConnectionConfig {
  id?: string;
  name: string;
  zone?: string;
  type: DbType;  // Use DbType instead of string literal
  updated_at?: string;
}

export interface Server {
  id: number;
  name: string;
  serverHost: string;  // Change host to serverHost for consistency
  port: number;
  zone?: string;
  type: DbType;  // Use DbType
  databaseName: string;  // Change database to databaseName
  connectionUsername: string;  // Change username to connectionUsername
  status: 'active' | 'inactive';
}

export type ServerFormData = Omit<DatabaseInventory, 'inventoryID' | 'createdDate' | 'updated_at'>;

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

// Update Driver interface to use specific config type
export interface Driver {
  connect: (config: DatabaseConnectionConfig) => Promise<AnyPool>;
  disconnect: (pool: AnyPool) => Promise<void>;
  getMetrics: (pool: AnyPool) => Promise<Partial<Metrics>>;
  getQueryAnalysis: (pool: AnyPool) => Promise<QueryAnalysis>;
  getOptimizationSuggestions:(pool: AnyPool) => Promise<OptimizationSuggestions>;
  getProblemQueries: (pool: AnyPool) => Promise<any>;
  getPerformanceInsights: (pool: AnyPool) => Promise<PerformanceInsight[] | { error: string }>;
}

export interface DatabaseInventory {
  inventoryID: number;
  systemName: string;
  serverHost: string;
  port: number;
  databaseName: string;
  zone: string;
  databaseType: DbType;
  connectionUsername: string;
  credentialReference: string;
  purposeNotes?: string;
  ownerContact: string;
  createdDate?: Date;
  updated_at?: Date;
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
export type DatabaseInventoryFormData = Omit<DatabaseInventory, 'id' | 'inventoryID'>;
export interface QueryAnalysis {
  runningQueries: RunningQuery[];
  slowQueries: SlowQuery[];
  blockingQueries: BlockingQuery[];
  resourceUsage: ResourceUsage[];
  indexUsage: IndexUsage[];
  waitStats: WaitStat[];
}

export interface RunningQuery {
  sessionId: string;
  loginName: string;
  hostName: string;
  programName: string;
  status: string;
  command: string;
  startTime: Date;
  elapsedTime: number;
  cpuTime: number;
  logicalReads: number;
  writes: number;
  query: string;
}

export interface SlowQuery {
  query: string;
  totalExecutionTime: number;
  avgExecutionTime: number;
  executionCount: number;
  totalLogicalReads: number;
  avgLogicalReads: number;
  lastExecutionTime: Date;
}

export interface BlockingQuery {
  blockingSessionId: string;
  blockedSessionId: string;
  blockingQuery: string;
  blockedQuery: string;
  waitTime: number;
  waitType: string;
}

export interface ResourceUsage {
  databaseName: string;
  cpuPercent: number;
  ioPercent: number;
  logSpaceUsed: number;
  tempdbUsage: number;
}

export interface IndexUsage {
  tableName: string;
  indexName: string;
  userSeeks: number;
  userScans: number;
  userLookups: number;
  userUpdates: number;
  lastUserSeek: Date;
  sizeMB: number;
}

export interface WaitStat {
  waitType: string;
  waitingTasksCount: number;
  waitTimeMs: number;
  maxWaitTimeMs: number;
  signalWaitTimeMs: number;
}

export interface OptimizationSuggestions {
  missingIndexes: Array<{
    impact: number;
    createStatement: string;
    tableSchema: string;
    tableName: string;
  }>;
  unusedIndexes: Array<{
    tableName: string;
    indexName: string;
    impact: number;
    recommendation: string;
  }>;
  tableOptimizations: Array<{
    tableName: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
  }>;
}

