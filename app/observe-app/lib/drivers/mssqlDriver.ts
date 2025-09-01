// mssqlDriver.ts (Updated with accurate memory metrics)

import sql, { ConnectionPool, IResult } from "mssql";
import {
  Metrics,
  QueryAnalysis,
  OptimizationSuggestions,
  PerformanceInsight,
  AnyPool,
  MSSQLConnectionConfig,
  MSSQLPool,
} from "@/types";
import { SQL_QUERIES } from "@/lib/sqlQueries";
import { PROBLEMATIC_MSSQL_WAIT_TYPES } from "@/lib/sqlQueries";
import { QueryData, DatabaseRow } from "@/types";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------
const HIGH_TEMPDB_USAGE_MB = 100;
const LONG_RUNNING_THRESHOLD_MS = 5000;

// Utilities & Helpers
// -----------------------------------------------------------------------------

/** unwrap Promise.allSettled result safely */
function getSettled<T>(r: PromiseSettledResult<IResult<T>>): T[] {
  return r.status === "fulfilled" ? r.value.recordset ?? [] : [];
}

/** ensure array */
function mapRecordset<T>(r: PromiseSettledResult<IResult<T>>): T[] {
  return getSettled(r);
}

/** coerce to number (safe) */
function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Number(n) : fallback;
}

/** pick best query text for insight */
function pickQueryText(d: QueryData): string {
  return (
    d.query_1 ||
    d.query_2 ||
    d.current_query ||
    d.query_text ||
    d.blocking_query ||
    d.query ||
    d.details?.query ||
    ""
  );
}

/** filter out system-ish noise */
function isUserQuery(q: QueryData): boolean {
  const programName = String(q.program_name || "").toLowerCase();
  const loginName = String(q.login_name || "").toLowerCase();
  const queryText = String(pickQueryText(q) || "").toLowerCase();

  const systemPrograms = [
    "observeapp",
    "sqlcmd",
    "ssms",
    "azure data studio",
    "microsoft sql server management studio",
    "datagrip",
    "dbeaver",
  ];

  if (systemPrograms.some((sys) => programName.includes(sys))) return false;

  const systemQueryPatterns = [
    "dm_exec_",
    "sys.dm_",
    "dm_os_",
    "dm_db_",
    "observeapp",
    "health-check",
    "monitor",
    "performance_counters",
    "wait_stats",
    "sys.databases",
    "sys.dm_exec_sessions",
    "sys.dm_exec_requests",
    "sys.dm_exec_query_stats",
  ];
  if (systemQueryPatterns.some((p) => queryText.includes(p))) return false;

  const systemLogins = ["monitor", "system", "health", "observeapp"];
  if (systemLogins.some((l) => loginName.includes(l))) return false;

  if (!programName && !queryText.trim()) return false;
  return true;
}

/** create PerformanceInsight */
function createInsight(
  data: QueryData,
  type: PerformanceInsight["type"],
  title: string,
  buildMessage: (d: QueryData) => string,
  severity: PerformanceInsight["severity"] = "warning"
): PerformanceInsight {
  const details = { ...data };
  delete details.query_text;
  delete details.blocking_query;
  delete details.query_1;
  delete details.query_2;
  delete details.current_query;
  delete details.query;

  const id =
    type +
    "_" +
    (data.session_id ||
      data.blocking_session_id ||
      data.process_id_1 ||
      Math.random().toString(36).slice(2, 10));

  return {
    id: String(id),
    type,
    title,
    message: buildMessage(data),
    query: pickQueryText(data) || "N/A",
    details,
    severity,
    timestamp: new Date().toISOString(),
  };
}

/** compute safe percentage like value */
function safePct(v: unknown): number {
  const n = toNum(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** normalize session_id to number for generateInsights usage */
function normalizeSessionId<T extends QueryData>(arr: T[]): T[] {
  return arr.map((q) => ({
    ...q,
    session_id:
      typeof q.session_id === "string"
        ? parseInt(q.session_id, 10) || 0
        : q.session_id ?? 0,
  }));
}

// -----------------------------------------------------------------------------
// Insight Generation
// -----------------------------------------------------------------------------

function generateInsights(data: {
  slowQueries: QueryData[];
  runningQueries: QueryData[];
  blockingQueries: QueryData[];
  deadlocks: QueryData[];
  tempDbUsage: QueryData[];
}): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];

  // slow historical
  data.slowQueries
    .filter(isUserQuery)
    .forEach((q) => {
      insights.push(
        createInsight(
          q,
          "slow_query",
          "Slow Historical Query Detected",
          (d) =>
            `Query averaging ${Math.round(toNum(d.mean_exec_time_ms) / 1000)}s over ${toNum(
              d.calls
            )} executions`
        )
      );
    });

  // long running
  data.runningQueries
    .filter((q) => toNum(q.total_elapsed_time) > LONG_RUNNING_THRESHOLD_MS)
    .filter(isUserQuery)
    .forEach((q) => {
      insights.push(
        createInsight(
          q,
          "long_running_query",
          "Long Running Query",
          (d) =>
            `Query has been running for ${Math.round(
              toNum(d.total_elapsed_time) / 1000
            )}s (${toNum(d.percent_complete)}% complete)`
        )
      );
    });

  // blocking
  data.blockingQueries.filter(isUserQuery).forEach((q) => {
    insights.push(
      createInsight(
        q,
        "blocking_query",
        "Query Blocking Detected",
        (d) =>
          `Session ${d.blocking_session_id} (${d.blocker_login}) is blocking session ${d.blocked_session_id} (${d.blocked_login}) for ${Math.round(
            toNum(d.wait_duration_ms) / 1000
          )}s`,
        "critical"
      )
    );
  });

  // deadlocks
  data.deadlocks.forEach((d) => {
    insights.push(
      createInsight(
        d,
        "deadlock_event",
        "Deadlock Event Detected",
        (x) =>
          `Deadlock occurred at ${x.deadlock_time} involving processes ${x.process_id_1} and ${x.process_id_2}`,
        "critical"
      )
    );
  });

  // tempdb
  data.tempDbUsage
    .filter((t) => toNum(t.usage_mb) > HIGH_TEMPDB_USAGE_MB)
    .filter(isUserQuery)
    .forEach((t) => {
      insights.push(
        createInsight(
          t,
          "high_tempdb_usage",
          "High TempDB Usage",
          (d) =>
            `Session ${d.session_id} (${d.login_name || d.user_name || "unknown"}) is using ${Math.round(
              toNum(d.usage_mb)
            )} MB of TempDB space`
        )
      );
    });

  return insights;
}

// -----------------------------------------------------------------------------
// SQL Helpers
// -----------------------------------------------------------------------------

const LIST_DATABASES_QUERY = `
  SELECT name FROM sys.databases
  WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
  ORDER BY name
`;

// Enhanced memory queries for accurate metrics
const ENHANCED_MEMORY_QUERY = `
  SELECT 
    -- Current memory usage
    (SELECT cntr_value / 1024 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Total Server Memory (KB)' 
       AND object_name LIKE '%Memory Manager%') AS used_memory_mb,
    
    -- Target memory (what SQL Server wants to use)
    (SELECT cntr_value / 1024 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Target Server Memory (KB)' 
       AND object_name LIKE '%Memory Manager%') AS target_memory_mb,
    
    -- Max server memory setting
    (SELECT CAST(value_in_use AS FLOAT)
     FROM sys.configurations 
     WHERE name = 'max server memory (MB)') AS max_server_memory_mb,
    
    -- Physical memory available on the system
    (SELECT physical_memory_kb / 1024 
     FROM sys.dm_os_sys_info) AS physical_memory_mb,
    
    -- Process memory usage
    (SELECT physical_memory_in_use_kb / 1024
     FROM sys.dm_os_process_memory) AS process_memory_mb
`;

const ENHANCED_CPU_QUERY = `
  -- Get CPU usage from ring buffer (most accurate)
  SELECT TOP(1)
    100 - record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int') AS cpu_usage_percent
  FROM (
    SELECT TOP(2) CONVERT(xml, record) as record, timestamp
    FROM sys.dm_os_ring_buffers 
    WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
      AND record like N'%<SystemHealth>%'
    ORDER BY timestamp DESC
  ) AS x
  ORDER BY timestamp DESC
`;

const MAX_CONNECTIONS_QUERY = `
  SELECT 
    @@MAX_CONNECTIONS as max_connections,
    (SELECT CAST(value_in_use AS int) FROM sys.configurations WHERE name = 'user connections') as configured_user_connections
`;

// -----------------------------------------------------------------------------
// Driver
// -----------------------------------------------------------------------------

const mssqlDriver = {
  // Connect & wrap
  connect: async (config: MSSQLConnectionConfig): Promise<MSSQLPool> => {
    const pool = new sql.ConnectionPool({
      user: config.connectionUsername,
      password: config.credentialReference,
      server: config.serverHost,
      database: config.databaseName,
      port: config.port,
      connectionTimeout: config.connectionTimeout ?? 30000,
      requestTimeout: config.requestTimeout ?? 30000,
      options: {
        encrypt: config.options?.encrypt ?? true,
        trustServerCertificate: config.options?.trustServerCertificate ?? true,
        enableArithAbort: config.options?.enableArithAbort ?? true,
        appName: config.options?.appName || "ObserveApp-Monitor",
      },
      pool: {
        max: config.pool?.max ?? 10,
        min: config.pool?.min ?? 0,
        idleTimeoutMillis: config.pool?.idleTimeoutMillis ?? 30000,
      },
    });

    await pool.connect();
    pool.on("error", (err) => {
      console.error("MSSQL pool error:", err);
      pool.close();
    });

    return { type: "mssql", pool };
  },

  disconnect: async (wrappedPool: AnyPool): Promise<void> => {
    if (wrappedPool.type !== "mssql") {
      console.warn("Attempted to disconnect a non-MSSQL pool with mssqlDriver.");
      return;
    }
    await wrappedPool.pool.close();
  },

  // Databases
  listDatabases: async (wrappedPool: AnyPool): Promise<string[]> => {
    if (wrappedPool.type !== "mssql") throw new Error("Invalid pool type for MSSQL driver.");
    const rs = await wrappedPool.pool.request().query(LIST_DATABASES_QUERY);
    return rs.recordset?.map((r: { name: string }) => r.name) ?? [];
  },

  getDatabases: async (wrappedPool: AnyPool): Promise<string[]> => {
    return mssqlDriver.listDatabases(wrappedPool);
  },

  // Enhanced getMetrics with proper memory/CPU/connections handling
  getMetrics: async (wrappedPool: AnyPool): Promise<Partial<Metrics>> => {
    if (wrappedPool.type !== "mssql") throw new Error("Invalid pool type for MSSQL driver.");
    const pool = wrappedPool.pool;

    const results = await Promise.allSettled([
      pool.request().query(SQL_QUERIES.connections),
      pool.request().query(SQL_QUERIES.cacheHitRate),
      pool.request().query(ENHANCED_MEMORY_QUERY),
      pool.request().query(ENHANCED_CPU_QUERY),
      pool.request().query(MAX_CONNECTIONS_QUERY),
      pool.request().query(SQL_QUERIES.dbSize),
      pool.request().input("threshold", sql.Int, LONG_RUNNING_THRESHOLD_MS).query(SQL_QUERIES.longRunningQueries),
      pool.request().query(SQL_QUERIES.blockingQueries),
      pool.request().query(SQL_QUERIES.slowQueriesHistorical),
      pool.request().query(SQL_QUERIES.deadlockAnalysis),
      pool.request().query(SQL_QUERIES.tempdbSessionUsage),
      pool.request().query(SQL_QUERIES.databaseInfo),
    ]);

    const [
      connectionsResult,
      cacheHitRateResult,
      memoryResult,
      cpuResult,
      maxConnectionsResult,
      dbSizeResult,
    ] = results;

    const running = mapRecordset(results[6]) as QueryData[];
    const blocking = mapRecordset(results[7]) as QueryData[];
    const slowHist = mapRecordset(results[8]) as QueryData[];
    const deadlocks = mapRecordset(results[9]) as QueryData[];
    const tempdb = mapRecordset(results[10]) as QueryData[];

    const insights = generateInsights({
      runningQueries: running,
      blockingQueries: blocking,
      slowQueries: slowHist,
      deadlocks,
      tempDbUsage: tempdb,
    });

    // Extract metrics with proper fallbacks
    const connections = toNum(mapRecordset(connectionsResult)[0]?.connection_count);
    const cacheHit = safePct(mapRecordset(cacheHitRateResult)[0]?.cache_hit_ratio_percent);
    
    // Enhanced memory metrics
    const memoryData = mapRecordset(memoryResult)[0];
    const usedMemoryMB = toNum(memoryData?.used_memory_mb || memoryData?.process_memory_mb);
    const targetMemoryMB = toNum(memoryData?.target_memory_mb);
    const maxMemoryMB = toNum(memoryData?.max_server_memory_mb);
    const physicalMemoryMB = toNum(memoryData?.physical_memory_mb);
    
    // Use max server memory as the ceiling, fallback to target, then physical
    const memoryMaxMB = maxMemoryMB > 0 ? maxMemoryMB : (targetMemoryMB > 0 ? targetMemoryMB : physicalMemoryMB);

    // Enhanced CPU metrics
    const cpuData = mapRecordset(cpuResult)[0];
    const cpuUsagePercent = toNum(cpuData?.cpu_usage_percent);

    // Enhanced connection metrics
    const maxConnData = mapRecordset(maxConnectionsResult)[0];
    const maxConnections = toNum(maxConnData?.max_connections || maxConnData?.configured_user_connections);

    const totalDbSizeMB = toNum(mapRecordset(dbSizeResult)[0]?.total_size_mb);

    // Debug logging
    console.log("[MSSQL Driver] Enhanced Metrics:", {
      connections: { current: connections, max: maxConnections },
      cpu: { usage: cpuUsagePercent },
      memory: { 
        used: usedMemoryMB, 
        target: targetMemoryMB,
        max: maxMemoryMB,
        physical: physicalMemoryMB,
        calculated_max: memoryMaxMB 
      },
      cache: { hitRate: cacheHit },
      disk: { size: totalDbSizeMB }
    });

    return {
     
        kpi: {
    connections,
    cpu: cpuUsagePercent > 0 ? Math.round(cpuUsagePercent) : undefined,
    // ใช้ได้: used ของ SQL (MB)
    memory: usedMemoryMB > 0 ? Math.round(usedMemoryMB) : undefined,
    disk: Math.round(totalDbSizeMB),
    maxConnections: maxConnections > 0 ? maxConnections : undefined,
      },
      stats: {
        cache_hit_rate: cacheHit,
        databaseSize: Math.round(totalDbSizeMB),
    
        cpu_usage_percent: Math.round(cpuUsagePercent),
    
        memory_used_mb: Math.round(usedMemoryMB),
        memory_total_mb: Math.round(physicalMemoryMB),   // <-- แก้จาก memoryMaxMB เป็น physicalMemoryMB
    
        memory_target_mb: Math.round(targetMemoryMB),
    
        physical_memory_mb: Math.round(physicalMemoryMB),
    
        sql_max_memory_mb: Math.round(memoryMaxMB),
    
        max_connections: maxConnections,
      },
      performanceInsights: insights,
      databaseInfo: (mapRecordset(results[11]) as DatabaseRow[]).map((db) => ({
        name: db.name || "UNKNOWN",
        sizeMB: db.sizeMB ?? 0,
        state: db.state_desc || "ONLINE",
        recoveryModel: db.recovery_model_desc || "UNKNOWN",
        compatibilityLevel: db.compatibility_level?.toString() || "UNKNOWN",
        collation: db.collation_name || "UNKNOWN",
        createdDate: db.create_date ? new Date(db.create_date) : new Date(),
      })),
    };
  },

  // Query Analysis (with WAIT STATS filtering)
  getQueryAnalysis: async (wrappedPool: AnyPool): Promise<QueryAnalysis> => {
    if (wrappedPool.type !== "mssql") throw new Error("Invalid pool type for MSSQL driver.");
    const pool = wrappedPool.pool;

    const results = await Promise.allSettled([
      pool.request().query(SQL_QUERIES.runningQueries),
      pool.request().query(SQL_QUERIES.slowQueriesHistorical),
      pool.request().query(SQL_QUERIES.blockingQueries),
      pool.request().query(SQL_QUERIES.waitStats),
      pool.request().query(SQL_QUERIES.deadlockAnalysis),
      pool.request().query(SQL_QUERIES.tempdbSessionUsage),
    ]);

    // Running
    const runningQueries = (mapRecordset(results[0]) as QueryData[]).map((q) => ({
      session_id: String(q.session_id ?? "unknown"),
      current_query: q.current_query ?? "",
      total_elapsed_time: toNum(q.total_elapsed_time),
      program_name: q.program_name ?? "unknown",
      login_name: q.login_name ?? "unknown",
      query: q.current_query ?? "",
    }));

    // Slow
    const slowQueries = (mapRecordset(results[1]) as QueryData[]).map((q) => ({
      session_id: String(q.session_id ?? "unknown"),
      query_text: q.query_text ?? "",
      duration_ms: toNum(q.duration_ms),
      mean_exec_time_ms: toNum(q.mean_exec_time_ms),
      login_name: q.login_name ?? "unknown",
      query: q.query_text ?? "",
    }));

    // Blocking
    const blockingQueries = (mapRecordset(results[2]) as QueryData[]).map((q) => ({
      session_id: String(q.session_id ?? "unknown"),
      blocking_session_id: q.blocking_session_id ?? 0,
      blocked_session_id: q.blocked_session_id ?? 0,
      blocked_query: q.blocking_query ?? "",
      blocking_query: q.blocking_query ?? "",
      wait_type: q.wait_type ?? "",
      wait_time: toNum(q.wait_time),
      wait_duration_ms: toNum(q.wait_duration_ms),
      blocker_login: q.blocker_login ?? "unknown",
      blocked_login: q.blocked_login ?? "unknown",
      query: q.blocking_query ?? "",
    }));

    // Wait Stats (FILTER problematic only)
    const waitStatsRaw = mapRecordset(results[3]) as QueryData[];
    const waitStats = waitStatsRaw
      .filter((q) => PROBLEMATIC_MSSQL_WAIT_TYPES.has(String(q.wait_type || "")))
      .map((q) => ({
        session_id: String(q.session_id ?? "N/A"),
        wait_type: q.wait_type ?? "",
        waiting_tasks_count: toNum(q.waiting_tasks_count),
        wait_time_ms: toNum(q.wait_time_ms),
        resource_description: q.resource_description ?? "",
        wait_duration_ms: toNum(q.wait_duration_ms),
        query: q.query_text ?? "",
      }));

    // Deadlocks
    const deadlocks = (mapRecordset(results[4]) as QueryData[]).map((q) => ({
      session_id: String(q.victim_session_id ?? "unknown"),
      deadlock_time: q.deadlock_time ?? "",
      process_id_1: q.process_id_1 ?? 0,
      process_id_2: q.process_id_2 ?? 0,
      query_1: q.query_1 ?? "",
      query_2: q.query_2 ?? "",
      resource: q.resource ?? "",
      mode: q.mode ?? "",
      process_list: q.process_list ?? [],
      query: q.query_1 ?? "",
    }));

    // TempDB
    const tempDbUsage = (mapRecordset(results[5]) as QueryData[])
      .filter(isUserQuery)
      .map((q) => ({
        session_id: String(q.session_id ?? "unknown"),
        user_name: q.user_name ?? "unknown",
        allocated_space_mb: toNum(q.allocated_space_mb),
        used_space_mb: toNum(q.used_space_mb),
        usage_mb: toNum(q.used_space_mb),
        query_text: q.query_text ?? "",
        query: q.query_text ?? "",
        login_name: q.user_name ?? "unknown",
      }));

    // Insights
    const insights = generateInsights({
      slowQueries: normalizeSessionId(slowQueries as any),
      runningQueries: normalizeSessionId(runningQueries as any),
      blockingQueries: normalizeSessionId(blockingQueries as any),
      deadlocks: normalizeSessionId(deadlocks as any),
      tempDbUsage: normalizeSessionId(tempDbUsage as any),
    });

    return {
      runningQueries,
      slowQueries,
      blockingQueries,
      waitStats,
      deadlocks,
      tempDbUsage,
      insights,
    };
  },

  // Optimization suggestions
  getOptimizationSuggestions: async (wrappedPool: AnyPool): Promise<OptimizationSuggestions> => {
    if (wrappedPool.type !== "mssql") throw new Error("Invalid pool type for MSSQL driver.");
    const pool = wrappedPool.pool;

    const results = await Promise.allSettled([
      pool.request().query(SQL_QUERIES.unusedIndexes),
      pool.request().query(SQL_QUERIES.fragmentedIndexes),
      pool.request().query(SQL_QUERIES.missingIndexes),
    ]);

    const unused = mapRecordset(results[0]) as any[];
    const frags = mapRecordset(results[1]) as any[];
    const miss = mapRecordset(results[2]) as any[];

    return {
      unusedIndexes: unused.map((row) => ({
        tableName: String(row.table_name || row.tableName || ""),
        indexName: String(row.index_name || row.indexName || ""),
        impact: toNum(row.impact),
        recommendation: String(row.recommendation || ""),
      })),
      fragmentedIndexes: frags.map((row) => ({
        tableName: String(row.table_name || row.tableName || ""),
        indexName: String(row.index_name || row.indexName || ""),
        fragmentationPercentage: toNum(row.fragmentation_percentage ?? row.fragmentationPercentage),
        pageCount: toNum(row.page_count ?? row.pageCount),
      })),
      missingIndexes: miss.map((row) => ({
        impact: toNum(row.impact),
        createStatement: String(row.create_statement || row.createStatement || ""),
        tableSchema: String(row.table_schema || row.tableSchema || ""),
        tableName: String(row.table_name || row.tableName || ""),
      })),
      tableOptimizations: [],
      indexSuggestions: [],
      queryRewrites: [],
    };
  },

  // Health analysis
  analyzeDatabaseHealth: async (wrappedPool: AnyPool): Promise<Record<string, unknown>> => {
    if (wrappedPool.type !== "mssql") throw new Error("Invalid pool type for MSSQL driver.");
    const pool = wrappedPool.pool;

    const results = await Promise.allSettled([
      pool.request().query(SQL_QUERIES.systemAnalysis),
      pool.request().query(SQL_QUERIES.connectionDetails),
      pool.request().query(SQL_QUERIES.performanceMetrics),
      pool.request().query(SQL_QUERIES.tempdbUsage),
    ]);

    const system = mapRecordset(results[0])[0] ?? {};
    const connections = mapRecordset(results[1]) as QueryData[];
    const performance = mapRecordset(results[2])[0] ?? {};
    const tempdbUsageData = mapRecordset(results[3]);

    const userConnections = connections.filter(isUserQuery);
    const programs = connections.map((c) => ({
      from: c.client_net_address ?? "unknown",
      details: c.program_name ?? "unknown",
    }));

    return {
      system,
      connections: {
        total: connections.length,
        active: connections.filter((c) => c.status === "running").length,
        user_connections: userConnections.length,
        details: userConnections,
        programs,
      },
      performance,
      tempdb: tempdbUsageData[0] || {},
      timestamp: new Date().toISOString(),
    };
  },

  // Problem Queries (placeholder)
  getProblemQueries: async (): Promise<Record<string, unknown>> => {
    console.warn("`getProblemQueries` is not fully implemented.");
    return { message: "This function is a placeholder." };
  },

  // Performance Insights (shortcut to metrics' insights)
  getPerformanceInsights: async (pool: AnyPool): Promise<PerformanceInsight[] | { error: string }> => {
    try {
      const metrics = await mssqlDriver.getMetrics(pool);
      return metrics.performanceInsights || [];
    } catch (error: unknown) {
      return {
        error: `Failed to retrieve performance insights: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },

  // Manual Query
  executeQuery: async (pool: ConnectionPool, query: string): Promise<unknown[]> => {
    try {
      const result = await pool.request().query(query);
      return result.recordset ?? [];
    } catch (error: unknown) {
      console.error("[MSSQL ExecuteQuery Error]", error);
      throw new Error(`Failed to execute query: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  },
};

export default mssqlDriver;