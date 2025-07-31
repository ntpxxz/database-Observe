import sql, { ConnectionPool, IResult } from "mssql";
import {
  Metrics,
  QueryAnalysis,
  OptimizationSuggestions,
  PerformanceInsight,
  AnyPool,
  MSSQLConnectionConfig,
  MSSQLPool,
  // Assuming these are defined in "@/types"
} from "@/types";
import { SQL_QUERIES } from "@/lib/sqlQueries";

// Constants
const HIGH_TEMPDB_USAGE_MB = 100;
const LONG_RUNNING_THRESHOLD_MS = 5000;

// ---
// Type Definitions
// ---

// Type definitions for better type safety
interface QueryData {
  session_id?: number;
  blocking_session_id?: number;
  process_id_1?: number;
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
  process_id_2?: number;
  usage_mb?: number;
  login_name?: string;
  mean_exec_time_ms?: number;
  calls?: number;
  program_name?: string;
  client_net_address?: string;
  status?: string;
  duration_ms?: number; // Added for slowQueries
  user_name?: string; // Added for tempDbUsage
  allocated_space_mb?: number; // Added for tempDbUsage
  used_space_mb?: number; // Added for tempDbUsage
  blocked_query?: string; // Added for blockingQueries
  wait_type?: string; // Added for blockingQueries, waitStats
  wait_time?: number; // Added for blockingQueries
  wait_time_ms?: number; // Added for waitStats
  waiting_tasks_count?: number; // Added for waitStats
  resource_description?: string; // Added for waitStats
  victim_session_id?: string; // Added for deadlocks
  resource?: string; // Added for deadlocks
  mode?: string; // Added for deadlocks
  process_list?: any[]; // Added for deadlocks
}

interface DatabaseRow {
  name: string;
  sizeMB?: number;
  state_desc?: string;
  recovery_model_desc?: string;
  compatibility_level?: number;
  collation_name?: string;
  create_date?: Date;
}

// ---
// Assumed Driver Interface (Crucial for `satisfies Driver` to work)
// ---
// This interface defines the contract that mssqlDriver must adhere to.
// You should ensure this matches the actual Driver interface you intend to use.
interface Driver {
  connect: (config: MSSQLConnectionConfig) => Promise<MSSQLPool>;
  disconnect: (pool: AnyPool) => Promise<void>;
  listDatabases: (pool: AnyPool) => Promise<string[]>;
  getDatabases?: (pool: AnyPool) => Promise<string[]>; // Make optional since BaseDriver doesn't have it
  getMetrics: (pool: AnyPool) => Promise<Partial<Metrics>>;
  getQueryAnalysis: (pool: AnyPool) => Promise<QueryAnalysis>;
  getOptimizationSuggestions: (pool: AnyPool) => Promise<OptimizationSuggestions>;
  analyzeDatabaseHealth?: (pool: AnyPool) => Promise<Record<string, unknown>>; // Make optional
  getProblemQueries: (pool: AnyPool) => Promise<unknown>; // Changed return type to match BaseDriver
  getPerformanceInsights: (pool: AnyPool) => Promise<PerformanceInsight[] | { error: string }>;
  killSession?: (pool: ConnectionPool, sessionId: string) => Promise<void>; // Make optional
  executeQuery?: (pool: sql.ConnectionPool, query: string) => Promise<unknown[]>; // Make optional
}

// ---
// Helper Functions
// ---

const createInsight = (
  data: QueryData,
  type: PerformanceInsight["type"],
  title: string,
  messageBuilder: (d: QueryData) => string,
  severity: PerformanceInsight["severity"] = "warning"
): PerformanceInsight => {
  const actualQuery =
    data.query_1 ||
    data.query_2 ||
    data.current_query ||
    data.query_text ||
    data.blocking_query ||
    data.query ||
    data.details?.query ||
    "N/A";

  const filteredData = { ...data };
  delete filteredData.query_text;
  delete filteredData.blocking_query;
  delete filteredData.query_1;
  delete filteredData.query_2;
  delete filteredData.current_query;
  delete filteredData.query;

  return {
    id: `${type}_${data.session_id || data.blocking_session_id || data.process_id_1 || Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    message: messageBuilder(data),
    query: actualQuery,
    details: {
      ...filteredData,
    },
    severity,
    timestamp: new Date().toISOString(),
  };
};

const isUserQuery = (q: QueryData): boolean => {
  const programName = String(q.program_name || "").toLowerCase();
  const loginName = String(q.login_name || "").toLowerCase();
  const queryText = String(
    q.query_text ||
      q.current_query ||
      q.blocking_query ||
      q.query_1 ||
      q.query_2 ||
      q.query ||
      ""
  ).toLowerCase();

  const systemPrograms = [
    "observeapp",
    "sqlcmd",
    "ssms",
    "azure data studio",
    "microsoft sql server management studio",
    "datagrip",
    "dbeaver",
  ];

  if (systemPrograms.some((sys) => programName.includes(sys))) {
    return false;
  }

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

  if (systemQueryPatterns.some((pattern) => queryText.includes(pattern))) {
    return false;
  }

  const systemLogins = ["monitor", "system", "health", "observeapp"];
  if (systemLogins.some((sys) => loginName.includes(sys))) {
    return false;
  }

  if (!programName && !queryText.trim()) {
    return false;
  }

  return true;
};

function generateInsights(data: {
  slowQueries: QueryData[];
  runningQueries: QueryData[];
  blockingQueries: QueryData[];
  deadlocks: QueryData[];
  tempDbUsage: QueryData[];
}): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];

  data.slowQueries.filter(isUserQuery).forEach((q) => {
    insights.push(
      createInsight(
        q,
        "slow_query",
        "Slow Historical Query Detected",
        (d) =>
          `Query averaging ${Math.round((d.mean_exec_time_ms || 0) / 1000)}s over ${d.calls || 0} executions`
      )
    );
  });

  data.runningQueries
    .filter((q) => (q.total_elapsed_time || 0) > LONG_RUNNING_THRESHOLD_MS)
    .filter(isUserQuery)
    .forEach((q) => {
      insights.push(
        createInsight(
          q,
          "long_running_query",
          "Long Running Query",
          (d) =>
            `Query has been running for ${Math.round((d.total_elapsed_time || 0) / 1000)}s (${d.percent_complete || 0}% complete)`
        )
      );
    });

  data.blockingQueries.filter(isUserQuery).forEach((q) => {
    insights.push(
      createInsight(
        q,
        "blocking_query",
        "Query Blocking Detected",
        (d) =>
          `Session ${d.blocking_session_id} (${d.blocker_login}) is blocking session ${d.blocked_session_id} (${d.blocked_login}) for ${Math.round((d.wait_duration_ms || 0) / 1000)}s`,
        "critical"
      )
    );
  });

  data.deadlocks.forEach((d) => {
    insights.push(
      createInsight(
        d,
        "deadlock_event",
        "Deadlock Event Detected",
        (d) =>
          `Deadlock occurred at ${d.deadlock_time} involving processes ${d.process_id_1} and ${d.process_id_2}`,
        "critical"
      )
    );
  });

  data.tempDbUsage
    .filter((t) => (t.usage_mb || 0) > HIGH_TEMPDB_USAGE_MB)
    .filter(isUserQuery)
    .forEach((t) => {
      insights.push(
        createInsight(
          t,
          "high_tempdb_usage",
          "High TempDB Usage",
          (d) =>
            `Session ${d.session_id} (${d.login_name}) is using ${Math.round(d.usage_mb || 0)} MB of TempDB space`
        )
      );
    });

  return insights;
}

const LIST_DATABASES_QUERY = `
  SELECT name FROM sys.databases
  WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
  ORDER BY name
`;

// ---
// MSSQL Driver Implementation
// ---
const mssqlDriver = {
  connect: async (config: MSSQLConnectionConfig): Promise<MSSQLPool> => {
    const pool = new sql.ConnectionPool({
      user: config.connectionUsername,
      password: config.credentialReference,
      server: config.serverHost,
      database: config.databaseName,
      port: config.port,
      connectionTimeout: config.connectionTimeout || 30000,
      requestTimeout: config.requestTimeout || 30000,
      options: {
        encrypt: config.options?.encrypt ?? true,
        trustServerCertificate: config.options?.trustServerCertificate ?? true,
        enableArithAbort: config.options?.enableArithAbort ?? true,
        appName: config.options?.appName || "ObserveApp-Monitor",
      },
      pool: {
        max: config.pool?.max || 10,
        min: config.pool?.min || 0,
        idleTimeoutMillis: config.pool?.idleTimeoutMillis || 30000,
      },
    });

    try {
      await pool.connect();
      pool.on("error", (err) => {
        console.error(`MSSQL pool error:`, err);
        pool.close();
      });
      return { type: "mssql", pool };
    } catch (err) {
      console.error("[MSSQL Driver] Connection failed:", err);
      throw err;
    }
  },
  async disconnect(wrappedPool: AnyPool): Promise<void> {
    if (wrappedPool.type === "mssql") {
      try {
        await wrappedPool.pool.close();
      } catch (err) {
        console.error("[MSSQL Driver] Disconnect failed:", err);
        throw err;
      }
    } else {
      console.warn(
        "Attempted to disconnect a non-MSSQL pool using mssqlDriver."
      );
    }
  },

  listDatabases: async (wrappedPool: AnyPool): Promise<string[]> => {
    if (wrappedPool.type !== "mssql") {
      throw new Error("Invalid pool type for MSSQL driver.");
    }
    const mssqlPool = wrappedPool.pool;
    const result = await mssqlPool.request().query(LIST_DATABASES_QUERY);
    return result.recordset?.map((row: { name: string }) => row.name) || [];
  },

  getDatabases: async (wrappedPool: AnyPool): Promise<string[]> => {
    // This is redundant with listDatabases, consider removing one.
    if (wrappedPool.type !== "mssql") {
      throw new Error("Invalid pool type for MSSQL driver.");
    }
    const mssqlPool = wrappedPool.pool;
    const result = await mssqlPool.request().query(LIST_DATABASES_QUERY);
    return result.recordset?.map((row: { name: string }) => row.name) || [];
  },

  getMetrics: async (wrappedPool: AnyPool): Promise<Partial<Metrics>> => {
    if (wrappedPool.type !== "mssql") {
      throw new Error("Invalid pool type for MSSQL driver.");
    }

    const mssqlPool = wrappedPool.pool; // Access native pool here

    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.connections),
      mssqlPool.request().query(SQL_QUERIES.cacheHitRate),
      mssqlPool.request().query(SQL_QUERIES.serverMemoryUsage),
      mssqlPool.request().query(SQL_QUERIES.cpuPressure),
      mssqlPool.request().query(SQL_QUERIES.dbSize),
      mssqlPool
        .request()
        .input("threshold", sql.Int, LONG_RUNNING_THRESHOLD_MS)
        .query(SQL_QUERIES.longRunningQueries),
      mssqlPool.request().query(SQL_QUERIES.blockingQueries),
      mssqlPool.request().query(SQL_QUERIES.slowQueriesHistorical),
      mssqlPool.request().query(SQL_QUERIES.deadlockAnalysis),
      mssqlPool.request().query(SQL_QUERIES.tempdbSessionUsage),
      mssqlPool.request().query(SQL_QUERIES.databaseInfo),
    ]);

    const [
      connectionsResult,
      cacheHitRateResult,
      serverMemoryUsage,
      cpuPressureResult,
      dbSizeResult,
    ] = results;

    const getResult = (r: PromiseSettledResult<IResult<any>>) =>
      r.status === "fulfilled" ? r.value.recordset : [];

    const insights = generateInsights({
      runningQueries: getResult(results[5]) as QueryData[],
      blockingQueries: getResult(results[6]) as QueryData[],
      slowQueries: getResult(results[7]) as QueryData[],
      deadlocks: getResult(results[8]) as QueryData[],
      tempDbUsage: getResult(results[9]) as QueryData[],
    });

    return {
      kpi: {
        connections: getResult(connectionsResult)[0]?.connection_count || 0,

        cpu:
          cpuPressureResult.status === "fulfilled"
            ? Math.round(
                100 -
                  (cpuPressureResult.value.recordset?.[0]
                    ?.cpu_pressure_percent || 0)
              )
            : undefined,

        memory:
          serverMemoryUsage.status === "fulfilled"
            ? serverMemoryUsage.value.recordset?.[0]?.used_memory_mb !==
              undefined
              ? Math.round(serverMemoryUsage.value.recordset[0].used_memory_mb)
              : (console.warn("⚠️ used_memory_mb not found"), 0)
            : (console.error(
                "❌ Memory query failed",
                serverMemoryUsage.reason
              ),
              0),

        disk: getResult(dbSizeResult)[0]?.total_size_mb || 0,
      },
      stats: {
        cache_hit_rate: Math.round(
          getResult(cacheHitRateResult)[0]?.cache_hit_ratio_percent || 0
        ),
        databaseSize: Math.round(
          getResult(dbSizeResult)[0]?.total_size_mb || 0
        ),
      },
      performanceInsights: insights,

      databaseInfo: (getResult(results[10]) as DatabaseRow[]).map((db) => ({
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
  getQueryAnalysis: async (wrappedPool: AnyPool): Promise<QueryAnalysis> => {
    // Consistency change: Use AnyPool and unwrap it
    if (wrappedPool.type !== "mssql") {
      throw new Error("Invalid pool type for MSSQL driver.");
    }
    const pool = wrappedPool.pool;

    const results = await Promise.allSettled([
      pool.request().query(SQL_QUERIES.runningQueries),
      pool.request().query(SQL_QUERIES.slowQueriesHistorical),
      pool.request().query(SQL_QUERIES.blockingQueries),
      pool.request().query(SQL_QUERIES.waitStats),
      pool.request().query(SQL_QUERIES.deadlockAnalysis),
      pool.request().query(SQL_QUERIES.tempdbSessionUsage),
    ]);

    const getResult = (r: PromiseSettledResult<IResult<QueryData>>) =>
      r.status === "fulfilled" ? r.value.recordset : [];

    const rawData: QueryAnalysis = {
      runningQueries: (getResult(results[0]) as Partial<QueryData>[])
        .map((q) => ({
          session_id: (q.session_id ?? "unknown").toString(),
          current_query: q.current_query ?? "",
          total_elapsed_time: q.total_elapsed_time ?? 0,
          program_name: q.program_name ?? "unknown",
          login_name: q.login_name ?? "unknown",
          query: q.current_query ?? "",
        })),

      slowQueries: (getResult(results[1]) as Partial<QueryData>[])
        .map((q) => ({
          session_id: (q.session_id ?? "unknown").toString(),
          query_text: q.query_text ?? "",
          duration_ms: q.duration_ms ?? 0,
          mean_exec_time_ms: q.mean_exec_time_ms ?? 0,
          login_name: q.login_name ?? "unknown",
          query: q.query_text ?? "",
        })),

      blockingQueries: (getResult(results[2]) as Partial<QueryData>[])
        .map((q) => ({
          session_id: (q.session_id ?? "unknown").toString(),
          blocking_session_id: q.blocking_session_id ?? 0,
          blocked_session_id: q.blocked_session_id ?? 0,
          blocked_query: q.blocked_query ?? "",
          blocking_query: q.blocking_query ?? "",
          wait_type: q.wait_type ?? "",
          wait_time: q.wait_time ?? 0,
          wait_duration_ms: q.wait_duration_ms ?? 0,
          blocker_login: q.blocker_login ?? "unknown",
          blocked_login: q.blocked_login ?? "unknown",
          query: q.blocked_query ?? "",
        })),

      waitStats: (getResult(results[3]) as Partial<QueryData>[]).map((q) => ({
        session_id: (q.session_id ?? "N/A").toString(),
        wait_type: q.wait_type ?? "",
        waiting_tasks_count: q.waiting_tasks_count ?? 0,
        wait_time_ms: q.wait_time_ms ?? 0,
        resource_description: q.resource_description ?? "",
        wait_duration_ms: q.wait_duration_ms ?? 0,
        query: q.query_text ?? "",
      })),

      deadlocks: (getResult(results[4]) as Partial<QueryData>[]).map(
        (q) => ({
          session_id: (q.victim_session_id ?? "unknown").toString(),
          deadlock_time: q.deadlock_time ?? "",
          process_id_1: q.process_id_1 ?? 0,
          process_id_2: q.process_id_2 ?? 0,
          query_1: q.query_1 ?? "",
          query_2: q.query_2 ?? "",
          resource: q.resource ?? "",
          mode: q.mode ?? "",
          process_list: q.process_list ?? [],
          query: q.query_1 ?? "",
        })
      ),

      tempDbUsage: (getResult(results[5]) as Partial<QueryData>[])
        .filter(isUserQuery)
        .map((q) => ({
          session_id: (q.session_id ?? "unknown").toString(),
          user_name: q.user_name ?? "unknown",
          allocated_space_mb: q.allocated_space_mb ?? 0,
          used_space_mb: q.used_space_mb ?? 0,
          usage_mb: q.used_space_mb ?? 0,
          query_text: q.query_text ?? "",
          query: q.query_text ?? "",
          login_name: q.user_name ?? "unknown"
        })),
    };

    const insights = generateInsights({
      slowQueries: rawData.slowQueries.map(q => ({
        ...q,
        session_id: typeof q.session_id === 'string' ? parseInt(q.session_id, 10) || 0 : q.session_id
      })) as QueryData[],
      runningQueries: rawData.runningQueries.map(q => ({
        ...q,
        session_id: typeof q.session_id === 'string' ? parseInt(q.session_id, 10) || 0 : q.session_id
      })) as QueryData[],
      blockingQueries: rawData.blockingQueries.map(q => ({
        ...q,
        session_id: typeof q.session_id === 'string' ? parseInt(q.session_id, 10) || 0 : q.session_id
      })) as QueryData[],
      deadlocks: rawData.deadlocks.map(q => ({
        ...q,
        session_id: typeof q.session_id === 'string' ? parseInt(q.session_id, 10) || 0 : q.session_id
      })) as QueryData[],
      tempDbUsage: rawData.tempDbUsage.map(q => ({
        ...q,
        session_id: typeof q.session_id === 'string' ? parseInt(q.session_id, 10) || 0 : q.session_id
      })) as QueryData[]
    });

    return {
      ...rawData,
      insights,
    };
  },

  getOptimizationSuggestions: async (
    wrappedPool: AnyPool // Consistency change: Use AnyPool
  ): Promise<OptimizationSuggestions> => {
    if (wrappedPool.type !== "mssql") {
      throw new Error("Invalid pool type for MSSQL driver.");
    }
    const mssqlPool = wrappedPool.pool;

    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.unusedIndexes),
      mssqlPool.request().query(SQL_QUERIES.fragmentedIndexes),
      mssqlPool.request().query(SQL_QUERIES.missingIndexes),
    ]);

    const getResult = (
      r: PromiseSettledResult<IResult<Record<string, unknown>>>
    ) => (r.status === "fulfilled" ? r.value.recordset : []);

    return {
      unusedIndexes: getResult(results[0]).map(row => ({
        tableName: String(row.table_name || row.tableName || ''),
        indexName: String(row.index_name || row.indexName || ''),
        impact: Number(row.impact || 0),
        recommendation: String(row.recommendation || '')
      })),
      fragmentedIndexes: getResult(results[1]).map(row => ({
        tableName: String(row.table_name || row.tableName || ''),
        indexName: String(row.index_name || row.indexName || ''),
        fragmentationPercentage: Number(row.fragmentation_percentage || row.fragmentationPercentage || 0),
        pageCount: Number(row.page_count || row.pageCount || 0)
      })),
      missingIndexes: getResult(results[2]).map(row => ({
        impact: Number(row.impact || 0),
        createStatement: String(row.create_statement || row.createStatement || ''),
        tableSchema: String(row.table_schema || row.tableSchema || ''),
        tableName: String(row.table_name || row.tableName || '')
      })),
      tableOptimizations: getResult(results[0]).map(row => ({
        tableName: String(row.table_name || row.tableName || ''),
        indexName: String(row.index_name || row.indexName || ''),
        suggestion: String(row.suggestion || row.suggestion || ''),
        priority: String(row.priority || row.priority || 'low') as 'high' | 'medium' | 'low'
      })),
      indexSuggestions: [],
      queryRewrites: []
    };
  },

  analyzeDatabaseHealth: async (
    wrappedPool: AnyPool // Consistency change: Use AnyPool
  ): Promise<Record<string, unknown>> => {
    if (wrappedPool.type !== "mssql") {
      throw new Error("Invalid pool type for MSSQL driver.");
    }
    const mssqlPool = wrappedPool.pool;

    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.systemAnalysis),
      mssqlPool.request().query(SQL_QUERIES.connectionDetails),
      mssqlPool.request().query(SQL_QUERIES.performanceMetrics),
      mssqlPool.request().query(SQL_QUERIES.tempdbUsage),
    ]);

    const getResult = (r: PromiseSettledResult<IResult<QueryData>>) =>
      r.status === "fulfilled" ? r.value.recordset : [];

    const connections = getResult(results[1]);
    const tempdbUsageData = getResult(results[3]); // Correctly get tempdb usage data

    const userConnections = connections.filter(isUserQuery);
    const programs = connections.map((c) => ({
      from: c.client_net_address ?? "unknown",
      details: c.program_name ?? "unknown",
    }));

    return {
      system: getResult(results[0])[0] || {},
      connections: {
        total: connections.length,
        active: connections.filter((c) => c.status === "running").length,
        user_connections: userConnections.length,
        details: userConnections,
        programs,
      },
      performance: getResult(results[2])[0] || {},
      tempdb: tempdbUsageData[0] || {}, // Include tempdb data
      timestamp: new Date().toISOString(),
    };
  },

  // ---
  // Placeholder Implementations for `Function not implemented.` errors
  // These are minimal implementations to allow the code to build.
  // You should replace them with actual logic.
  // ---
  getProblemQueries: async (_pool: AnyPool): Promise<Record<string, unknown>> => {
    console.warn("`getProblemQueries` is not fully implemented.");
    return { message: "This function is a placeholder." };
  },

  getPerformanceInsights: async (
    _pool: AnyPool
  ): Promise<PerformanceInsight[] | { error: string }> => {
    console.warn("`getPerformanceInsights` is not fully implemented. Returning insights from getMetrics.");
    // For now, let's return the insights from getMetrics if needed, or an empty array
    // A proper implementation would likely fetch insights specific to this function.
    try {
        const metrics = await mssqlDriver.getMetrics(_pool);
        return metrics.performanceInsights || [];
    } catch (error: unknown) {
        return { error: `Failed to retrieve performance insights: ${error instanceof Error ? error.message : String(error)}` };
    }
  },

  async killSession(pool: ConnectionPool, sessionId: string): Promise<void> {
    await pool.request().query(`KILL ${sessionId}`);
  },

  async executeQuery(poolWrapper: sql.ConnectionPool, query: string): Promise<unknown[]> {
    try {
      const request = poolWrapper.request();
      console.log("Running manual query:", query);
  
      const result = await request.query(query);
      console.log("Manual query result:", result);
  
      return result.recordset;
    } catch (error: unknown) {
      console.error("[ExecuteQuery Error]", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });
  
      throw new Error(
        `Failed to execute query: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

} satisfies Driver; // `satisfies` ensures it matches the Driver interface

export default mssqlDriver;