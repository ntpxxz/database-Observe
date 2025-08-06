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
      host: config.serverHost,
      port: config.port,
      user: config.connectionUsername,
      password: config.credentialReference,
      database: config.databaseName,
      waitForConnections: config.waitForConnections ?? true,
      connectionLimit: config.connectionLimit || 10,
      queueLimit: config.queueLimit || 0,
      connectTimeout: config.connectTimeout || 15000,
      idleTimeout: config.idleTimeout || 60000,
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

    try {
      const connection: PoolConnection = await mysqlPool.getConnection();

      // Get basic metrics
      const [statusResults] = await connection.query<RowDataPacket[]>(`
        SELECT 
          VARIABLE_NAME, 
          VARIABLE_VALUE 
        FROM performance_schema.global_status 
        WHERE VARIABLE_NAME IN (
          'Threads_connected', 
          'Uptime', 
          'Questions',
          'Innodb_buffer_pool_read_requests',
          'Innodb_buffer_pool_reads',
          'Slow_queries',
          'Connections'
        )
      `);

      const [variableResults] = await connection.query<RowDataPacket[]>(`
        SELECT 
          VARIABLE_NAME, 
          VARIABLE_VALUE 
        FROM performance_schema.global_variables 
        WHERE VARIABLE_NAME IN (
          'max_connections',
          'innodb_buffer_pool_size'
        )
      `);

      // Convert arrays to objects for easier access
      const statusMap: Record<string, number> = {};
      statusResults.forEach((row: any) => {
        statusMap[row.VARIABLE_NAME] = parseInt(row.VARIABLE_VALUE) || 0;
      });

      const variableMap: Record<string, number> = {};
      variableResults.forEach((row: any) => {
        variableMap[row.VARIABLE_NAME] = parseInt(row.VARIABLE_VALUE) || 0;
      });

      // Calculate cache hit ratio
      const bufferPoolRequests = statusMap['Innodb_buffer_pool_read_requests'] || 1;
      const bufferPoolReads = statusMap['Innodb_buffer_pool_reads'] || 0;
      const cacheHitRate = Math.round(((bufferPoolRequests - bufferPoolReads) / bufferPoolRequests) * 100);

      // Get slow queries
      const [slowQueryResults] = await connection.query<RowDataPacket[]>(`
        SELECT 
          DIGEST_TEXT as query_text, 
          AVG_TIMER_WAIT / 1000000000 as mean_exec_time_ms,
          COUNT_STAR as calls,
          SUM_TIMER_WAIT / 1000000000 as total_exec_time_ms
        FROM performance_schema.events_statements_summary_by_digest 
        WHERE DIGEST_TEXT IS NOT NULL AND AVG_TIMER_WAIT > 1000000000
        ORDER BY AVG_TIMER_WAIT DESC 
        LIMIT 10
      `);

      // Get running queries
      const [processResults] = await connection.query<RowDataPacket[]>(`
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
        LIMIT 20
      `);

      connection.release();

      // Generate performance insights
      const insights: PerformanceInsight[] = [];

      // Add slow query insights
      (slowQueryResults as any[]).forEach((q, index) => {
        if (q.mean_exec_time_ms > 1) {
          insights.push({
            id: `mysql_slow_${index}`,
            type: "slow_query",
            severity: q.mean_exec_time_ms > 10 ? "critical" : q.mean_exec_time_ms > 5 ? "warning" : "info",
            title: "Slow Query Detected",
            message: `Query averaging ${Math.round(q.mean_exec_time_ms * 1000)}ms over ${q.calls} executions`,
            query: q.query_text?.substring(0, 200) + (q.query_text?.length > 200 ? '...' : '') || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              mean_exec_time_ms: Math.round(q.mean_exec_time_ms),
              total_exec_time_ms: Math.round(q.total_exec_time_ms),
              calls: q.calls
            }
          });
        }
      });

      // Add long running query insights
      (processResults as any[]).forEach((p, index) => {
        if (p.total_elapsed_time > 30) { // 30 seconds
          insights.push({
            id: `mysql_long_running_${index}`,
            type: "long_running_query",
            severity: p.total_elapsed_time > 300 ? "critical" : "warning",
            title: "Long Running Query",
            message: `Query running for ${p.total_elapsed_time} seconds`,
            query: p.current_query?.substring(0, 200) + (p.current_query?.length > 200 ? '...' : '') || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              session_id: p.session_id,
              login_name: p.login_name,
              database_name: p.database_name,
              total_elapsed_time: p.total_elapsed_time,
              current_state: p.current_state
            }
          });
        }
      });

      // Add connection usage insight
      const connectionUsage = Math.round((statusMap['Threads_connected'] / variableMap['max_connections']) * 100);
      if (connectionUsage > 80) {
        insights.push({
          id: 'mysql_high_connections',
          type: "resource_usage",
          severity: connectionUsage > 90 ? "critical" : "warning",
          title: "High Connection Usage",
          message: `Connection usage is at ${connectionUsage}% (${statusMap['Threads_connected']}/${variableMap['max_connections']})`,
          query: "",
          timestamp: new Date().toISOString(),
          details: {
            current_connections: statusMap['Threads_connected'],
            max_connections: variableMap['max_connections'],
            usage_percentage: connectionUsage
          }
        });
      }

      // Add cache hit rate insight
      if (cacheHitRate < 95) {
        insights.push({
          id: 'mysql_low_cache_hit',
          type: "performance",
          severity: cacheHitRate < 90 ? "warning" : "info",
          title: "Low Buffer Pool Cache Hit Rate",
          message: `Buffer pool cache hit rate is ${cacheHitRate}%, consider increasing innodb_buffer_pool_size`,
          query: "",
          timestamp: new Date().toISOString(),
          details: {
            cache_hit_rate: cacheHitRate,
            buffer_pool_requests: bufferPoolRequests,
            buffer_pool_reads: bufferPoolReads,
            current_buffer_pool_size_mb: Math.round(variableMap['innodb_buffer_pool_size'] / 1024 / 1024)
          }
        });
      }

      const metrics: Partial<Metrics> = {
        kpi: {
          connections: statusMap['Threads_connected'] || 0,
          cpu: undefined, // MySQL doesn't provide direct CPU metrics
          memory: Math.round(variableMap['innodb_buffer_pool_size'] / 1024 / 1024), // Buffer pool size in MB
          disk: undefined, // MySQL doesn't provide direct disk metrics
        },
        stats: {
          cache_hit_rate: Math.max(0, Math.min(100, cacheHitRate)), // Ensure 0-100 range
          total_connections: statusMap['Connections'] || 0,
          uptime_seconds: statusMap['Uptime'] || 0,
          total_queries: statusMap['Questions'] || 0,
          slow_queries: statusMap['Slow_queries'] || 0,
          max_connections: variableMap['max_connections'] || 0,
          buffer_pool_size_mb: Math.round(variableMap['innodb_buffer_pool_size'] / 1024 / 1024),
        },
        performanceInsights: insights,
      };

      console.log('MySQL Metrics Generated:', {
        kpi: metrics.kpi,
        stats: metrics.stats,
        insights_count: insights.length
      });

      return metrics;

    } catch (err: unknown) {
      console.error("MySQL metrics error:", err instanceof Error ? err.message : "Unknown error");
      
      // Return minimal fallback metrics
      return {
        kpi: { 
          connections: 0,
          cpu: undefined,
          memory: undefined,
          disk: undefined
        },
        stats: {
          cache_hit_rate: 0,
        },
        performanceInsights: [{
          id: 'mysql_error',
          type: 'error',
          severity: 'critical',
          title: 'Metrics Collection Error',
          message: `Failed to fetch metrics: ${err instanceof Error ? err.message : 'Unknown error'}. Please ensure the Performance Schema is enabled.`,
          query: '',
          timestamp: new Date().toISOString(),
          details: { error: err instanceof Error ? err.message : 'Unknown error' }
        }],
      };
    }
  },

  getQueryAnalysis: async (wrappedPool: MySQLPoolType): Promise<QueryAnalysis> => {
    if (wrappedPool.type !== "mysql") {
      throw new Error("Invalid pool type for MySQL driver.");
    }

    const mysqlPool = wrappedPool.pool;

    try {
      const connection: PoolConnection = await mysqlPool.getConnection();

      const [runningRes, slowRes] = await Promise.all([
        connection.query<RowDataPacket[]>(`
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
          LIMIT 50
        `),
        connection.query<RowDataPacket[]>(`
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
          LIMIT 50
        `)
      ]);

      connection.release();

      // Convert to InsightItem format
      const runningQueries: InsightItem[] = (runningRes[0] as any[]).map((q, index) => ({
        id: `running_${index}`,
        session_id: q.session_id?.toString() || "unknown",
        login_name: q.login_name || "unknown",
        query: q.current_query || "",
        duration: q.total_elapsed_time || 0,
        database: q.database_name || "unknown",
        type: "running_query" as const,
        client_address: q.client_net_address || "unknown",
        status: q.status || "unknown",
        current_state: q.current_state || "unknown"
      }));

      const slowQueries: InsightItem[] = (slowRes[0] as any[]).map((q, index) => ({
        id: `slow_${index}`,
        session_id: "N/A",
        query: q.query_text || "",
        duration: Math.round((q.mean_exec_time_ms || 0) * 1000),
        count: q.calls || 0,
        type: "slow_query" as const,
        total_execution_time: Math.round(q.total_execution_time || 0),
        logical_reads: q.avg_logical_reads || 0
      }));

      return {
        runningQueries,
        slowQueries,
        blockingQueries: [], // MySQL doesn't have built-in blocking query detection like SQL Server
        waitStats: [],
        deadlocks: [],
        tempDbUsage: [],
        insights: [],
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

    // Enhanced placeholder implementation with basic suggestions
    return {     
      missingIndexes: [],
      unusedIndexes: [],
      tableOptimizations: [],
      fragmentedIndexes: [],
      indexSuggestions: [{
        id: 'mysql_general_suggestion',
        table: 'General',
        column: 'N/A',
        suggestion: 'Enable slow query log to identify queries that need optimization',
        impact: 'medium',
        details: 'SET GLOBAL slow_query_log = 1; SET GLOBAL long_query_time = 2;'
      }],
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
export const PROBLEMATIC_MSSQL_WAIT_TYPES = new Set<string>([
  "CXPACKET",
  "CXCONSUMER",
  "LATCH_EX",
  "LATCH_SH",
  "LOGMGR_QUEUE",
  "SOS_SCHEDULER_YIELD",
  "PAGEIOLATCH_SH",
  "PAGEIOLATCH_EX",
  "ASYNC_NETWORK_IO",
  "WRITELOG",
  "THREADPOOL",
  "RESOURCE_SEMAPHORE",
]);

export const PROBLEMATIC_POSTGRES_WAIT_EVENTS = new Set<string>([
  "LWLock",
  "BufferPin",
  "BufferIO",
  "Lock",
  "IO",
  "DataFileRead",
  "DataFileWrite",
  "WALWrite",
  "WALSync",
]);

export default mysqlDriver;
export type { MySQLConnectionConfig, MySQLPoolType, Metrics, PerformanceInsight, QueryAnalysis, OptimizationSuggestions, InsightItem };