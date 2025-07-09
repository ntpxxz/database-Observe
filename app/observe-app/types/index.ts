import { ReactNode } from 'react';
import { Pool as PgPool } from 'pg';
import { ConnectionPool as MssqlPool } from 'mssql';

// Generic pool type that can be either Postgres or MSSQL pool
export type AnyPool = PgPool | MssqlPool;

// Performance insight structure
export interface PerformanceInsight {
  details: any;
  title: any;
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
  encrypt: boolean;
  connectionTimeout: number;
  user: string | undefined;
  database: string | undefined;
  password: string | undefined;
  server: string;
  serverHost: string;
  port: number;
  databaseName: string;
  databaseType: DbType;
  connectionUsername: string;
  credentialReference: string;
  appName?: string;  // Optional app name for connection
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    enableArithAbort?: boolean;
  };
  requestTimeout?: number;
  poolMax?: number;
  poolMin?: number;
  idleTimeout?: number;
}


// API Helper functions
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
export interface HardwareMetric {
  database_name: string;
  data_size_mb: number;
  log_size_mb: number;
  memory_in_buffer_mb: number;
  total_reads_count: number;
  total_writes_count: number;
}
export interface Metrics {
  kpi: {
    cpu?: number;
    memory?: number;
    disk?: number;
    connections?: number;
  };
  hardware?: {
    cpuUsage: number;
    databaseMetrics: HardwareMetric[];
  } | null;
  databaseInfo?: DatabaseInfo[];
  hardwareError?: string | null;
  error?: string | null;

  stats?: {
    cache_hit_rate?: string | number;
    [key: string]: any;
  };
  performanceInsights: PerformanceInsight[] | { error: string };
}

// Update Driver interface to use specific config type
export interface Driver {
  [x: string]: any;
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
  zone: string;
  databaseType: DbType;
  connectionUsername: string;
  credentialReference: string;
  purposeNotes?: string;
  ownerContact: string;
  createdDate?: Date;
  updated_at?: Date;
}
export interface DatabaseInventoryWithDatabases extends DatabaseInventory {
  databases?: string[]; // optional at runtime
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

export interface DatabaseInfo {
  name: string;
  sizeMB: number;
  state: string; 
  recoveryModel: string;
  compatibilityLevel: string; 
  collation: string; 
  createdDate: Date;
  lastBackupDate?: Date; 
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


export interface ErrorResponse {
  error: string;
  code: string;
  timestamp: string;
}

export interface SuccessResponse {
  data: any; // Replace with your actual data type
  meta: {
    id: string;
    analysisLevel: AnalysisLevel;
    timestamp: string;
  };
}