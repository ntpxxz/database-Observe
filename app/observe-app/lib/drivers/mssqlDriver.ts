// mssqlDriver.ts - เวอร์ชันที่ปรับปรุงแล้วพร้อม API structure ที่ถูกต้อง

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

// Constants
const HIGH_TEMPDB_USAGE_MB = 100;
const LONG_RUNNING_THRESHOLD_MS = 5000;

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

interface ConnectionData {
  connection_count?: number;
  cache_hit_ratio_percent?: number;
  cpu_pressure_percent?: number;
  total_size_mb?: number;
}

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
    details: {
      ...filteredData,
      query: actualQuery,
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
  tempdbUsage: QueryData[];
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

  data.tempdbUsage
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

const mssqlDriver = {
  // ✅ แก้ไข method signature ให้ตรงกับ interface
  connect: async (config: MSSQLConnectionConfig): Promise<MSSQLPool> => {
    const pool = new sql.ConnectionPool({
      user: config.connectionUsername, // ใช้ connectionUsername
      password: config.credentialReference, // ใช้ credentialReference
      server: config.serverHost, // ใช้ serverHost
      database: config.databaseName, // ใช้ databaseName
      port: config.port, // ใช้ config.port
      connectionTimeout: config.connectionTimeout || 30000,
      requestTimeout: config.requestTimeout || 30000,
      options: {
        encrypt: config.options?.encrypt ?? true, // ใช้ ?? เพื่อ fallback ค่า default
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
        pool.close(); // ปิด pool เมื่อเกิดข้อผิดพลาด
      });
      return { type: "mssql", pool }; // ส่งคืน Object ที่ตรงกับ MSSQLPool interface
    } catch (err) {
      console.error("[MSSQL Driver] Connection failed:", err);
      throw err;
    }
  },
  async disconnect(wrappedPool: AnyPool): Promise<void> {
    if (wrappedPool.type === "mssql") {
      try {
        await wrappedPool.pool.close(); // เข้าถึง native pool ผ่าน .pool property
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
    const nativePool = wrappedPool.pool;
    const mssqlPool = nativePool as ConnectionPool;
    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.connections),
      mssqlPool.request().query(SQL_QUERIES.cacheHitRate),
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

    const getResult = (r: PromiseSettledResult<IResult<ConnectionData>>) =>
      r.status === "fulfilled" ? r.value.recordset : [];

    const insights = generateInsights({
      runningQueries: getResult(results[4]) as QueryData[],
      blockingQueries: getResult(results[5]) as QueryData[],
      slowQueries: getResult(results[6]) as QueryData[],
      deadlocks: getResult(results[7]) as QueryData[],
      tempdbUsage: getResult(results[8]) as QueryData[],
    });

    return {
      kpi: {
        connections: getResult(results[0])[0]?.connection_count || 0,
        cpu: Math.round(
          100 - (getResult(results[2])[0]?.cpu_pressure_percent || 0)
        ),
      },
      stats: {
        cache_hit_rate: Math.round(
          getResult(results[1])[0]?.cache_hit_ratio_percent || 0
        ),
        databaseSize: Math.round(getResult(results[3])[0]?.total_size_mb || 0),
      },
      performanceInsights: insights,

      databaseInfo: (getResult(results[9]) as DatabaseRow[]).map((db) => ({
        name: db.name,
        sizeMB: db.sizeMB,
        state: db.state_desc || "ONLINE",
        recoveryModel: db.recovery_model_desc,
        compatibilityLevel: db.compatibility_level,
        collation: db.collation_name,
        createdDate: db.create_date,
      })),
    };
  },

  getQueryAnalysis: async (pool: ConnectionPool): Promise<QueryAnalysis> => {
    // <-- แก้ไขตรงนี้
    const results = await Promise.allSettled([
      pool.request().query(SQL_QUERIES.runningQueries), // ใช้ pool.request() โดยตรง
      pool.request().query(SQL_QUERIES.slowQueriesHistorical),
      pool.request().query(SQL_QUERIES.blockingQueries),
      pool.request().query(SQL_QUERIES.waitStats),
      pool.request().query(SQL_QUERIES.deadlockAnalysis),
      pool.request().query(SQL_QUERIES.tempdbSessionUsage),
    ]);

    const getResult = (r: PromiseSettledResult<IResult<QueryData>>) =>
      r.status === "fulfilled" ? r.value.recordset : [];

    const rawData = {
      runningQueries: getResult(results[0]).filter(isUserQuery),
      slowQueries: getResult(results[1]).filter(isUserQuery),
      blockingQueries: getResult(results[2]).filter(isUserQuery),
      waitStats: getResult(results[3]),
      deadlocks: getResult(results[4]),
      tempdbUsage: getResult(results[5]).filter(isUserQuery),
    };

    const insights = generateInsights(rawData);

    return {
      ...rawData,
      insights,
    };
  },

  getOptimizationSuggestions: async (
    pool: AnyPool
  ): Promise<OptimizationSuggestions> => {
    const mssqlPool = pool as unknown as ConnectionPool;
    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.unusedIndexes),
      mssqlPool.request().query(SQL_QUERIES.fragmentedIndexes),
      mssqlPool.request().query(SQL_QUERIES.missingIndexes),
    ]);

    const getResult = (
      r: PromiseSettledResult<IResult<Record<string, unknown>>>
    ) => (r.status === "fulfilled" ? r.value.recordset : []);

    return {
      unusedIndexes: getResult(results[0]),
      fragmentedIndexes: getResult(results[1]),
      missingIndexes: getResult(results[2]),
    };
  },

  analyzeDatabaseHealth: async (
    pool: AnyPool
  ): Promise<Record<string, unknown>> => {
    const mssqlPool = pool as unknown as ConnectionPool;
    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.systemAnalysis),
      mssqlPool.request().query(SQL_QUERIES.connectionDetails),
      mssqlPool.request().query(SQL_QUERIES.performanceMetrics),
      mssqlPool.request().query(SQL_QUERIES.tempdbUsage),
    ]);

    const getResult = (r: PromiseSettledResult<IResult<QueryData>>) =>
      r.status === "fulfilled" ? r.value.recordset : [];

    const connections = getResult(results[1]);
    const tempdb = getResult(results[3])[0] || {};

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
      tempdb: {
        ...tempdb,
        usage_percentage:
          (tempdb.total_space_mb || 0) > 0
            ? Math.round(
                (((tempdb.total_space_mb || 0) - (tempdb.free_space_mb || 0)) /
                  (tempdb.total_space_mb || 0)) *
                  100
              )
            : 0,
      },
      timestamp: new Date().toISOString(),
    };
  },

  getProblemQueries: function (
    _pool: AnyPool
  ): Promise<Record<string, unknown>> {
    throw new Error("Function not implemented.");
  },

  getPerformanceInsights: function (
    _pool: AnyPool
  ): Promise<PerformanceInsight[] | { error: string }> {
    throw new Error("Function not implemented.");
  },

  async killSession(pool: ConnectionPool, sessionId: string): Promise<void> {
    await pool.request().query(`KILL ${sessionId}`);
  },

  async executeQuery(pool: sql.ConnectionPool, query: string) {
    try {
      const request = pool.request();
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
  },
} satisfies Driver;

export default mssqlDriver;
