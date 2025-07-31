import {
  createPool,
  Pool as MySqlPool,
  RowDataPacket,
  PoolConnection,
} from "mysql2/promise";

import {
  BaseDriver,
  MySQLConnectionConfig,
  Metrics,
  PerformanceInsight,
  QueryAnalysis,
  OptimizationSuggestions,
  MySQLPool as MySQLPoolType,
  InsightItem,
} from "@/types";

const mysqlDriver: BaseDriver<MySQLConnectionConfig, MySQLPoolType> = {
  connect: async (config: MySQLConnectionConfig): Promise<MySQLPoolType> => {
    const pool = createPool({
      host: config.serverHost, // แก้ไขจาก config.host
      port: config.port,
      user: config.connectionUsername, // แก้ไขจาก config.user
      password: config.credentialReference, // แก้ไขจาก config.password
      database: config.databaseName || "mysql", // แก้ไขจาก config.database
      waitForConnections: config.waitForConnections ?? true,
      connectionLimit: config.connectionLimit || 10,
      queueLimit: config.queueLimit || 0,
      connectTimeout: config.connectTimeout || 15000,
      // Removed acquireTimeout as it's not a valid option for mysql2/promise createPool
      // If you intended to control idle connections, idleTimeout is the correct property
      idleTimeout: config.idleTimeout || 60000, // This is the correct property for idle connection timeout
    });
  
    // Test connection
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
  
    return {
      type: "mysql",
      pool: pool
    };
  },

  disconnect: async (wrappedPool: MySQLPoolType): Promise<void> => {
    if (wrappedPool.type === "mysql") {
      await wrappedPool.pool.end();
    }
  },

  listDatabases: async (wrappedPool: MySQLPoolType): Promise<string[]> => {
    if (wrappedPool.type !== "mysql") {
      throw new Error("Invalid pool type for MySQL driver.");
    }
    
    const [rows] = await wrappedPool.pool.query<RowDataPacket[]>(`SHOW DATABASES`);
    return rows
      .map((row: any) => row.Database)
      .filter((dbName: string) => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(dbName));
  },

  getMetrics: async (wrappedPool: MySQLPoolType): Promise<Partial<Metrics>> => {
    if (wrappedPool.type !== "mysql") {
      throw new Error("Invalid pool type for MySQL driver.");
    }

    const mysqlPool = wrappedPool.pool;

    const QUERIES = {
      connections: "SELECT COUNT(*) AS connection_count FROM information_schema.processlist WHERE command != 'Sleep'",
      variables: "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected', 'Uptime', 'Questions')",
      cacheHit: `
        SELECT 
          ROUND(
            (1 - (
              (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Innodb_buffer_pool_reads') / 
              (SELECT VARIABLE_VALUE FROM performance_schema.global_status WHERE VARIABLE_NAME = 'Innodb_buffer_pool_read_requests')
            )) * 100, 2
          ) AS cache_hit_ratio_percent
      `,
      slowQueries: `
        SELECT 
          DIGEST_TEXT as query_text, 
          AVG_TIMER_WAIT / 1000000000 as mean_exec_time_ms,
          COUNT_STAR as calls
        FROM performance_schema.events_statements_summary_by_digest 
        WHERE DIGEST_TEXT IS NOT NULL AND AVG_TIMER_WAIT > 1000000000
        ORDER BY AVG_TIMER_WAIT DESC 
        LIMIT 10
      `,
      processlist: `
        SELECT 
          ID as session_id,
          USER as login_name,
          HOST as client_net_address,
          DB as database_name,
          COMMAND as status,
          TIME as total_elapsed_time,
          STATE as current_state,
          INFO as current_query
        FROM INFORMATION_SCHEMA.PROCESSLIST 
        WHERE COMMAND != 'Sleep' AND INFO IS NOT NULL
        ORDER BY TIME DESC
      `,
    };

    try {
      const [connRes, cacheRes, slowRes, processRes] = await Promise.all([
        mysqlPool.query<RowDataPacket[]>(QUERIES.connections),
        mysqlPool.query<RowDataPacket[]>(QUERIES.cacheHit),
        mysqlPool.query<RowDataPacket[]>(QUERIES.slowQueries),
        mysqlPool.query<RowDataPacket[]>(QUERIES.processlist),
      ]);

      const connections = (connRes[0] as any)?.[0]?.connection_count ?? 0;
      const cacheHitRate = (cacheRes[0] as any)?.[0]?.cache_hit_ratio_percent ?? 0;
      const slowQueries = slowRes[0] as any[];
      const processes = processRes[0] as any[];

      // Generate insights from slow queries and long running processes
      const insights: PerformanceInsight[] = [];

      slowQueries.forEach((q, index) => {
        if (q.mean_exec_time_ms > 1) {
          insights.push({
            id: `mysql_slow_${index}`,
            type: "slow_query",
            severity: q.mean_exec_time_ms > 10 ? "critical" : "warning",
            title: "Slow Query Detected",
            message: `Query averaging ${Math.round(q.mean_exec_time_ms * 1000)}ms over ${q.calls} executions`,
            query: q.query_text || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              mean_exec_time_ms: q.mean_exec_time_ms,
              calls: q.calls
            }
          });
        }
      });

      processes.forEach((p, index) => {
        if (p.total_elapsed_time > 30) { // 30 seconds
          insights.push({
            id: `mysql_long_running_${index}`,
            type: "long_running_query",
            severity: p.total_elapsed_time > 300 ? "critical" : "warning",
            title: "Long Running Query",
            message: `Query running for ${p.total_elapsed_time} seconds`,
            query: p.current_query || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              session_id: p.session_id,
              login_name: p.login_name,
              total_elapsed_time: p.total_elapsed_time
            }
          });
        }
      });

      return {
        kpi: {
          connections: connections,
          cpu: undefined, // MySQL doesn't provide direct CPU metrics
          memory: undefined, // MySQL doesn't provide direct memory metrics
          disk: undefined, // MySQL doesn't provide direct disk metrics
        },
        stats: {
          cache_hit_rate: Math.round(cacheHitRate),
        },
        performanceInsights: insights,
      };
    } catch (err: unknown) {
      console.error("MySQL metrics error:", err instanceof Error ? err.message : "Unknown error");
      return {
        kpi: { connections: 0 },
        performanceInsights: { error: "Failed to fetch metrics. Please ensure the Performance Schema is enabled." },
      };
    }
  },

  getQueryAnalysis: async (wrappedPool: MySQLPoolType): Promise<QueryAnalysis> => {
    if (wrappedPool.type !== "mysql") {
      throw new Error("Invalid pool type for MySQL driver.");
    }

    const mysqlPool = wrappedPool.pool;

    const QUERIES = {
      runningQueries: `
        SELECT 
          ID as session_id,
          USER as login_name,
          HOST as client_net_address,
          DB as database_name,
          COMMAND as status,
          TIME as total_elapsed_time,
          STATE as current_state,
          INFO as current_query
        FROM INFORMATION_SCHEMA.PROCESSLIST 
        WHERE COMMAND != 'Sleep' AND INFO IS NOT NULL
        ORDER BY TIME DESC
      `,

      slowQueries: `
        SELECT 
          DIGEST_TEXT as query_text,
          SUM_TIMER_WAIT / 1000000000 as total_execution_time,
          AVG_TIMER_WAIT / 1000000000 as mean_exec_time_ms,
          COUNT_STAR as calls,
          SUM_ROWS_EXAMINED as total_logical_reads,
          AVG_ROWS_EXAMINED as avg_logical_reads
        FROM performance_schema.events_statements_summary_by_digest 
        WHERE DIGEST_TEXT IS NOT NULL
        ORDER BY SUM_TIMER_WAIT DESC 
        LIMIT 20
      `,

      indexUsage: `
        SELECT 
          TABLE_SCHEMA as database_name,
          TABLE_NAME as table_name,
          INDEX_NAME as index_name,
          CARDINALITY as cardinality,
          ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) as size_mb
        FROM INFORMATION_SCHEMA.STATISTICS s
        JOIN INFORMATION_SCHEMA.TABLES t ON s.TABLE_SCHEMA = t.TABLE_SCHEMA AND s.TABLE_NAME = t.TABLE_NAME
        WHERE s.TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        ORDER BY size_mb DESC
        LIMIT 50
      `,
    };

    try {
      const connection: PoolConnection = await mysqlPool.getConnection();

      const [runningRes, slowRes] = await Promise.all([
        connection.query<RowDataPacket[]>(QUERIES.runningQueries),
        connection.query<RowDataPacket[]>(QUERIES.slowQueries),
        connection.query<RowDataPacket[]>(QUERIES.indexUsage),
      ]);

      connection.release();

      // Convert to InsightItem format
      const runningQueries: InsightItem[] = (runningRes[0] as any[]).map(q => ({
        session_id: q.session_id?.toString() || "unknown",
        login_name: q.login_name || "unknown",
        query: q.current_query || "",
        duration: q.total_elapsed_time || 0,
        database: q.database_name || "unknown",
        type: "running_query" as const,
      }));

      const slowQueries: InsightItem[] = (slowRes[0] as any[]).map(q => ({
        session_id: "N/A",
        query: q.query_text || "",
        duration: Math.round((q.mean_exec_time_ms || 0) * 1000),
        count: q.calls || 0,
        type: "slow_query" as const,
      }));

      return {
        runningQueries,
        slowQueries,
        blockingQueries: [], // MySQL doesn't have built-in blocking query detection like SQL Server
        waitStats: [],
        deadlocks: [],
        tempDbUsage: [],
        insights: [], // Will be populated by generateInsights if implemented
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("MySQL analysis error:", message);
      throw new Error(`Failed to get query analysis: ${message}`);
    }
  },

  getOptimizationSuggestions: async (wrappedPool: MySQLPoolType): Promise<OptimizationSuggestions> => {
    if (wrappedPool.type !== "mysql") {
      throw new Error("Invalid pool type for MySQL driver.");
    }

    // Placeholder implementation
    return {     
      missingIndexes: [],
      unusedIndexes: [],
      tableOptimizations: [],
      fragmentedIndexes: [],
      indexSuggestions: [],
      queryRewrites: []
    };
  },

  getProblemQueries: async (wrappedPool: MySQLPoolType): Promise<unknown> => {
    if (wrappedPool.type !== "mysql") {
      throw new Error("Invalid pool type for MySQL driver.");
    }

    return { message: "MySQL getProblemQueries not implemented yet" };
  },

  getPerformanceInsights: async (wrappedPool: MySQLPoolType): Promise<PerformanceInsight[] | { error: string }> => {
    if (wrappedPool.type !== "mysql") {
      throw new Error("Invalid pool type for MySQL driver.");
    }

    try {
      const metrics = await mysqlDriver.getMetrics(wrappedPool);
      return Array.isArray(metrics.performanceInsights) ? metrics.performanceInsights : [];
    } catch (error: unknown) {
      return { error: `Failed to retrieve performance insights: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  },

  // เพิ่ม executeQuery method สำหรับ manual query execution
  executeQuery: async (pool: MySqlPool, query: string): Promise<unknown[]> => {
    try {
      const connection: PoolConnection = await pool.getConnection();
      console.log("Running manual MySQL query:", query);
  
      const [result] = await connection.query(query);
      console.log("Manual MySQL query result:", result);
  
      connection.release();
      return Array.isArray(result) ? result : [result];
    } catch (error: unknown) {
      console.error("[MySQL ExecuteQuery Error]", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });
  
      throw new Error(
        `Failed to execute MySQL query: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
};

export default mysqlDriver;
