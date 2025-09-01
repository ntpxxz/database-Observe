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

// MSSQL Connection Config (ปรับปรุงให้มี Properties ตรงตาม DatabaseInventory และ error message)
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

// PostgreSQL Connection Config (ปรับปรุงให้มี Properties ตรงตาม DatabaseInventory เพื่อความสอดคล้อง)
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

// MySQL Connection Config (ปรับปรุงให้มี Properties ตรงตาม DatabaseInventory เพื่อความสอดคล้อง)
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
  purposeNotes: string;
  createdDate?: string;
  createdBy?: string;
  updated_at?: string;
  lastUpdatedBy?: string;
  status: 'Active' | 'Inactive';
}

export type Server = DatabaseInventory

/** export interface ServerFormData extends BaseConnectionConfig {
  inventoryID?: string;
  systemName: string;
  serverHost: string;
  port: number;
  connectionUsername: string;
  credentialReference: string;
  databaseName?: string;
  encrypt?: boolean;
  purposeNotes: string;
  createdDate?: string;
  createdOn?: string;
  createdBy?: string;
  lastUpdatedOn?: string;
  lastUpdatedBy?: string;
  status: 'Active' | 'Inactive';
} **/

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
  onSave: (serverData: DatabaseInventory) => void;
  serverToEdit: Server | Partial<DatabaseInventory> | null;
}

export interface ManagementPanelProps {
  servers: Server[];
  onAdd: () => void;
  onEdit: (server: Server) => void;
  onDelete: (id: number) => void;
}

export interface NetworkScannerPanelProps {
  onAdd: (partialServer: Partial<DatabaseInventory>) => void;
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
    maxConnections?: number
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




// Enhanced KPI Widget with Progress Bar
export interface KPIWidgetProps {
  icon: React.ReactNode;
  title: string;
  value: number | undefined;
  max?: number;
  unit?: string;
    color: "sky" | "violet" | "green" | "amber";
  warning?: number;
  critical?: number;
}

export interface ServerDetailViewProps {
  server: DatabaseInventory;
  metrics: Metrics | null;
  isLoading: boolean;
  error: string | null;
  insights?: PerformanceInsight[] | null;
  insightsLoading?: boolean;
  insightError?: string | null;
  onRefresh: (tab: TabType) => void;
  onRefreshKPI: () => Promise<void>;
}

export interface DetailItemProps {
  label: string;
  value: string | number | null;
  isHighlight?: boolean;
}


export type TabType = "performance" | "insights" | "hardware";

export interface QueryData {
  session_id?: number | string;
  blocking_session_id?: number;
  process_id_1?: number;
  process_id_2?: number;
  query_1?: string;
  query_2?: string;
  current_query?: string;
  query_text?: string;
  blocking_query?: string;
  query?: string;
  details?: { query?: string };
  total_elapsed_time?: number;
  percent_complete?: number;
  blocker_login?: string;
  blocked_login?: string;
  blocked_session_id?: number;
  wait_duration_ms?: number;
  deadlock_time?: string;
  usage_mb?: number;
  login_name?: string;
  mean_exec_time_ms?: number;
  duration_ms?: number;
  calls?: number;
  program_name?: string;
  client_net_address?: string;
  status?: string;
  user_name?: string;
  allocated_space_mb?: number;
  used_space_mb?: number;
  wait_type?: string;
  wait_time?: number;
  wait_time_ms?: number;
  waiting_tasks_count?: number;
  resource_description?: string;
  victim_session_id?: string;
  resource?: string;
  mode?: string;
  process_list?: any[];
}

export interface DatabaseRow {
  name: string;
  sizeMB?: number;
  state_desc?: string;
  recovery_model_desc?: string;
  compatibility_level?: number;
  collation_name?: string;
  create_date?: Date;
}


// types/alert.ts

export interface AlertConfig {
  cpu: { warning: number; critical: number; enabled: boolean };
  memory: { warning: number; critical: number; enabled: boolean };
  connections: { warning: number; critical: number; enabled: boolean };
  cache: { warning: number; critical: number; enabled: boolean };
}

export interface AlertHistoryItem {
  id: string;
  timestamp: Date;
  metric: string;
  level: 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
  resolved?: Date;
  duration?: number; // in minutes
}

export interface ActiveAlert {
  type: string;
  level: 'warning' | 'critical';
  message: string;
  value?: number;
  threshold?: number;
}

export type AlertLevel = 'normal' | 'warning' | 'critical';
export type AlertType = 'percentage' | 'absolute' | 'reverse';

export const defaultAlertConfig: AlertConfig = {
  cpu: { warning: 70, critical: 85, enabled: true },
  memory: { warning: 80, critical: 90, enabled: true },
  connections: { warning: 70, critical: 85, enabled: true },
  cache: { warning: 70, critical: 60, enabled: true },
};

// Utility functions
export const generateAlertId = (metric: string, level: string): string => {
  return `${metric}-${level}-${Date.now()}`;
};

export const formatAlertValue = (value: number, unit: string): string => {
  return `${value.toFixed(1)}${unit}`;
};

export const getAlertDuration = (start: Date, end?: Date): number => {
  const endTime = end || new Date();
  return Math.floor((endTime.getTime() - start.getTime()) / (1000 * 60)); // minutes
};