// types/index.ts
import { Pool as PgPool } from 'pg';
import { ConnectionPool as MssqlPool } from 'mssql';
import { Pool as MysqlPool } from 'mysql2/promise';

export type DbType = 'MSSQL' | 'POSTGRES' | 'MYSQL';
export function isDbType(value: string): value is DbType {
  return (value === 'MSSQL' || value === 'POSTGRES' || value === 'MYSQL');
}
// =============================================================================
// CONNECTION POOL CONFIGURATION
// =============================================================================

// =============================================================================
// DRIVER INTERFACES
// =============================================================================
export interface BaseDriver<TConfig, TPool> {
  executeQuery(arg0: unknown, query: unknown): unknown[] | PromiseLike<unknown[]>;
  connect(config: TConfig): Promise<TPool>;
  disconnect(pool: TPool): Promise<void>;
  listDatabases(pool: TPool): Promise<string[]>;
  getMetrics(pool: TPool): Promise<Partial<Metrics>>;
  getQueryAnalysis(pool: TPool): Promise<QueryAnalysis>;
  getOptimizationSuggestions(pool: TPool): Promise<OptimizationSuggestions>;
  getProblemQueries(pool: TPool): Promise<unknown>;
  getPerformanceInsights(pool: TPool): Promise<PerformanceInsight[] | { error: string }>;
  generateInsights?(data: QueryAnalysis): PerformanceInsight[];
}

export type DriverMap = {
  MSSQL: BaseDriver<MSSQLConnectionConfig, MSSQLPool>;
  POSTGRES: BaseDriver<PostgreSQLConnectionConfig, PostgreSQLPool>;
  MYSQL: BaseDriver<MySQLConnectionConfig, MySQLPool>;
};

// MSSQL Connection Config (ปรับปรุงให้มี Properties ตรงตาม ServerFormData และ error message)
export interface MSSQLConnectionConfig {
  databaseType: 'MSSQL';
  serverHost: string; // เปลี่ยนจาก server เป็น serverHost
  port: number;
  connectionUsername: string; // เปลี่ยนจาก user เป็น connectionUsername
  credentialReference: string; // เปลี่ยนจาก password เป็น credentialReference
  databaseName: string; // เปลี่ยนจาก database เป็น databaseName
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
    enableArithAbort?: boolean;
    appName?: string;
  };
  requestTimeout?: number;
  connectionTimeout?: number;
  pool?: {
    max?: number;
    min?: number;
    idleTimeoutMillis?: number;
    getDatabase?: boolean;
  };
}

// PostgreSQL Connection Config (ปรับปรุงให้มี Properties ตรงตาม ServerFormData เพื่อความสอดคล้อง)
export interface PostgreSQLConnectionConfig {
  databaseType: 'POSTGRES';
  serverHost: string; // เปลี่ยนจาก host เป็น serverHost
  port: number;
  connectionUsername: string; // เปลี่ยนจาก user เป็น connectionUsername
  credentialReference: string; // เปลี่ยนจาก password เป็น credentialReference
  databaseName: string; // เปลี่ยนจาก database เป็น databaseName
  ssl?: boolean;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  min?: number;
}

// MySQL Connection Config (ปรับปรุงให้มี Properties ตรงตาม ServerFormData เพื่อความสอดคล้อง)
export interface MySQLConnectionConfig {
  databaseType: 'MYSQL';
  serverHost: string; // เปลี่ยนจาก host เป็น serverHost
  port: number;
  connectionUsername: string; // เปลี่ยนจาก user เป็น connectionUsername
  credentialReference: string; // เปลี่ยนจาก password เป็น credentialReference
  databaseName?: string; // เปลี่ยนจาก database เป็น databaseName (สามารถเป็น Optional ได้)
  ssl?: boolean;
  connectionLimit?: number;
  waitForConnections?: boolean;
  queueLimit?: number;
  connectTimeout?: number;
  idleTimeout?: number;
}

export type AnyPool = MSSQLPool | PostgreSQLPool | MySQLPool;

export interface MSSQLPool {
  type: 'mssql';
  pool: MssqlPool;
}

export interface PostgreSQLPool {
  type: 'postgresql';
  pool: PgPool;
}

export interface MySQLPool {
  type: 'mysql';
  pool: MysqlPool;
}

// =============================================================================
// DATABASE INVENTORY
// =============================================================================

export interface BaseConnectionConfig {
  databaseType: DbType;
  port?: number;
}
export interface DatabaseInventory extends BaseConnectionConfig {
  inventoryID: string;
  systemName: string;
  serverHost: string;
  port: number;
  zone: string;
  databaseType: DbType;
  connectionUsername: string;
  credentialReference: string;
  databaseName?: string;
  encrypt?: boolean;
  ownerContact: string;
  purposeNotes?: string;
  createdDate?: string;
  createdBy?: string;
  lastUpdatedOn?: string;
  lastUpdatedBy?: string;
  status: 'Active' | 'Inactive';
}

export type Server = DatabaseInventory

export interface ServerFormData extends BaseConnectionConfig {
  inventoryID?: string;
  systemName: string;
  serverHost: string;
  port: number;
  connectionUsername: string;
  credentialReference: string;
  databaseName?: string;
  encrypt?: boolean;
  notes?: string;
  createdOn?: string;
  createdBy?: string;
  lastUpdatedOn?: string;
  lastUpdatedBy?: string;
  status: 'Active' | 'Inactive';
}

// =============================================================================
// UI COMPONENTS
// =============================================================================
export interface SimpleCardProps {
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
export interface InsightsData {
  runningQueries?: Array<unknown>;
  slowQueries?: Array<unknown>;
  blockingQueries?: Array<unknown>;
  waitStats?: Array<unknown>;
  deadlocks?: Array<unknown>;
  tempDbUsage?: Array<unknown>;
}
export type InsightType =
  | "running_query"
  | "slow_query"
  | "blocking_query"
  | "wait_stats"
  | "deadlock_event"
  | "high_tempdb_usage";

export interface InsightItem {
  id?: string;
  session_id: string | number;
  duration?: number;
  query?: string;
  database?: string;
  wait_type?: string;
  resource?: string;
  count?: number;
  [key: string]: unknown;
  type?: InsightType; 
}

export interface RunningQuery extends InsightItem {
  session_id: string | number;
  current_query: string;
  total_elapsed_time: number;
  program_name: string;
  login_name: string;
}

export interface SlowQuery extends InsightItem {
  query_text: string;
  mean_exec_time_ms: number;
  login_name:string
  duration_ms:number
  session_id: string | number;
}

export interface BlockingQuery extends InsightItem {
  blocking_session_id: number;
  blocked_session_id: number;
  blocking_query: string;
  blocked_query: string;
  wait_duration_ms: number;
  blocker_login: string;
  blocked_login: string;
}

export interface WaitStats extends InsightItem {
  wait_type: string;
  wait_duration_ms: number;
  resource_description: string;
}

export interface DeadlockEvent extends InsightItem {
  deadlock_time: string;
  process_id_1: number;
  process_id_2: number;
  query_1: string;
  query_2: string;
}

export interface HighTempDbUsage extends InsightItem {
  session_id: number;
  usage_mb: number;
  query: string;
  login_name: string;
}

export interface HardwareMetric {
  database_name: string;
  data_size_mb: number;
  log_size_mb: number;
  memory_in_buffer_mb: number;
  total_reads_count: number;
  total_writes_count: number;
}


// In src/types.ts
export interface QueryAnalysis {
  runningQueries: InsightItem[]; // Change from RunningQuery[]
  slowQueries: InsightItem[];    // Change from SlowQuery[]
  blockingQueries: InsightItem[]; // Change from BlockingQuery[]
  waitStats: InsightItem[];       // Change from WaitStats[]
  deadlocks: InsightItem[];       // Change from DeadlockEvent[]
  tempDbUsage: InsightItem[];     // Change from HighTempDbUsage[] (and fix casing)
  insights: PerformanceInsight[];
}
//
export interface DatabaseInfo {
  name: string;
  sizeMB: number;
  state: string;
  recoveryModel: string | undefined;
  compatibilityLevel: string;
  collation: string;
  createdDate: Date;
}
export interface DatabaseInventoryWithDetails extends DatabaseInventory {
  databases: DatabaseInfo[];
  metrics?: Metrics;
  lastUpdatedOn?: string;
  lastUpdatedBy?: string;
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
    [key: string]: unknown;
  };
  performanceInsights: PerformanceInsight[] | { error: string };
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


export interface OptimizationSuggestions {
  indexSuggestions: unknown[]; // Placeholder, define more specific interface later
  queryRewrites: unknown[]; // Placeholder

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
  fragmentedIndexes:Array<{
    tableName: string;
    indexName: string;
    fragmentationPercentage: number
    pageCount: number;
  }>
}

export interface PerformanceInsight {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  timestamp: Date | string;
  query: string;
  queryId?: string;
  executionPlan?: string;
  metrics?: {
    durationMs?: number;
    cpuMs?: number;
    reads?: number;
    writes?: number;
  };
  sessionId?: string;
  details?: Record<string, unknown>; // เพิ่ม field นี้
  
}

// =============================================================================
// DATABASE INVENTORY DASHBOARD
// =============================================================================
export interface SummaryCardProps {
  title: string;
  value: string | number;
  description: string;
  color: string;
}

export interface DatabaseTypeIconProps {
  type: DbType;
  size?: number;
}

export interface StatItemProps {
  label: string;
  value: string | number;
  tooltip?: string;
}

export interface HealthStatusPillProps {
  status: 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
}
export interface serverStatus {
  status: 'Healthy' | 'Warning' | 'Critical' | 'Unknown';
}



