import { Pool } from "pg";
import { 
  Metrics, 
  PerformanceInsight, 
  PostgreSQLPool,
  BaseDriver, 
  PostgreSQLConnectionConfig,
  QueryAnalysis,
  OptimizationSuggestions,
  InsightItem
} from "@/types";

const postgresDriver: BaseDriver<PostgreSQLConnectionConfig, PostgreSQLPool> = {
  connect: async (config: PostgreSQLConnectionConfig): Promise<PostgreSQLPool> => {
    const pool = new Pool({
      host: config.serverHost, // แก้ไขจาก config.host
      port: config.port,
      user: config.connectionUsername, // แก้ไขจาก config.user
      password: config.credentialReference, // แก้ไขจาก config.password
      database: config.databaseName || "postgres", // แก้ไขจาก config.database
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 15000,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
      max: config.max ?? 10,
      min: config.min ?? 0,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    });
    
    // Test connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    return {
      type: "postgresql",
      pool: pool
    };
  },

  disconnect: async (wrappedPool: PostgreSQLPool): Promise<void> => {
    if (wrappedPool.type === "postgresql") {
      await wrappedPool.pool.end();
    }
  },

  listDatabases: async (wrappedPool: PostgreSQLPool): Promise<string[]> => {
    if (wrappedPool.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
    }
    
    const res = await wrappedPool.pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres', 'template0', 'template1')`
    );
    return res.rows.map(r => r.datname);
  },

  getMetrics: async (wrappedPool: PostgreSQLPool): Promise<Partial<Metrics>> => {
    if (wrappedPool.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
    }

    const pgPool = wrappedPool.pool;

    const QUERIES = {
      connections: "SELECT count(*) AS connection_count FROM pg_stat_activity WHERE state = 'active'",
      cacheHit: `
        SELECT 
          COALESCE(
            ROUND(
              (sum(heap_blks_hit) * 100.0 / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)), 2
            ), 0
          ) AS cache_hit_ratio_percent 
        FROM pg_statio_user_tables
      `,
      slowQueries: `
        SELECT 
          query as query_text, 
          total_exec_time as total_exec_time_ms,
          calls, 
          mean_exec_time as mean_exec_time_ms
        FROM pg_stat_statements 
        WHERE mean_exec_time > 100
        ORDER BY total_exec_time DESC 
        LIMIT 10
      `,
      runningQueries: `
        SELECT 
          pid as session_id,
          usename as login_name,
          client_addr::text as client_net_address,
          application_name as program_name,
          state as status,
          EXTRACT(EPOCH FROM (now() - query_start)) * 1000 as total_elapsed_time,
          query as current_query
        FROM pg_stat_activity 
        WHERE state = 'active' AND query != '<IDLE>' AND pid != pg_backend_pid()
        ORDER BY query_start
      `,
    };

    try {
      const [connRes, cacheRes, slowRes, runningRes] = await Promise.all([
        pgPool.query(QUERIES.connections),
        pgPool.query(QUERIES.cacheHit),
        pgPool.query(QUERIES.slowQueries).catch(() => ({ rows: [] })), // pg_stat_statements might not be enabled
        pgPool.query(QUERIES.runningQueries),
      ]);

      const connections = connRes.rows[0]?.connection_count ?? 0;
      const cacheHitRate = cacheRes.rows[0]?.cache_hit_ratio_percent ?? 0;
      const slowQueries = slowRes.rows;
      const runningQueries = runningRes.rows;

      // Generate insights
      const insights: PerformanceInsight[] = [];

      slowQueries.forEach((q, index) => {
        if (q.mean_exec_time_ms > 1000) { // > 1 second
          insights.push({
            id: `postgres_slow_${index}`,
            type: "slow_query",
            severity: q.mean_exec_time_ms > 10000 ? "critical" : "warning",
            title: "Slow Query Detected",
            message: `Query averaging ${Math.round(q.mean_exec_time_ms)}ms over ${q.calls} executions`,
            query: q.query_text || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              mean_exec_time_ms: q.mean_exec_time_ms,
              calls: q.calls,
              total_exec_time_ms: q.total_exec_time_ms
            }
          });
        }
      });

      runningQueries.forEach((q, index) => {
        if (q.total_elapsed_time > 30000) { // > 30 seconds
          insights.push({
            id: `postgres_long_running_${index}`,
            type: "long_running_query",
            severity: q.total_elapsed_time > 300000 ? "critical" : "warning",
            title: "Long Running Query",
            message: `Query running for ${Math.round(q.total_elapsed_time / 1000)} seconds`,
            query: q.current_query || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              session_id: q.session_id,
              login_name: q.login_name,
              total_elapsed_time: q.total_elapsed_time
            }
          });
        }
      });

      return {
        kpi: { 
          connections: connections,
          cpu: undefined, // PostgreSQL doesn't provide direct CPU metrics
          memory: undefined, // PostgreSQL doesn't provide direct memory metrics  
          disk: undefined, // PostgreSQL doesn't provide direct disk metrics
        },
        stats: {
          cache_hit_rate: Math.round(cacheHitRate),
        },
        performanceInsights: insights,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("PostgreSQL metrics error:", message);
      return {
        kpi: { connections: 0 },
        performanceInsights: { 
          error: "Failed to fetch metrics. Please ensure the 'pg_stat_statements' extension is enabled." 
        },
      };
    }
  },

  getQueryAnalysis: async (wrappedPool: PostgreSQLPool): Promise<QueryAnalysis> => {
    if (wrappedPool.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
    }

    const pgPool = wrappedPool.pool;

    const QUERIES = {
      runningQueries: `
        SELECT 
          pid as session_id,
          usename as login_name,
          client_addr::text as client_net_address,
          application_name as program_name,
          state as status,
          query_start as start_time,
          EXTRACT(EPOCH FROM (now() - query_start)) * 1000 as total_elapsed_time,
          query as current_query
        FROM pg_stat_activity 
        WHERE state = 'active' AND query != '<IDLE>' AND pid != pg_backend_pid()
        ORDER BY query_start
      `,

      slowQueries: `
        SELECT 
          query as query_text,
          total_exec_time as total_execution_time,
          mean_exec_time as mean_exec_time_ms, 
          calls as calls,
          shared_blks_read + local_blks_read as total_logical_reads,
          CASE WHEN calls > 0 THEN (shared_blks_read + local_blks_read) / calls ELSE 0 END as avg_logical_reads
        FROM pg_stat_statements 
        ORDER BY total_exec_time DESC 
        LIMIT 20
      `,

      blockingQueries: `
        SELECT 
          blocked_locks.pid as blocked_session_id,
          blocking_locks.pid as blocking_session_id,
          blocked_activity.query as blocked_query,
          blocking_activity.query as blocking_query,
          blocked_activity.state as wait_type,
          EXTRACT(EPOCH FROM (now() - blocked_activity.query_start)) * 1000 as wait_duration_ms
        FROM pg_catalog.pg_locks blocked_locks
        JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
        JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
          AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
          AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
          AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
          AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
          AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
          AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
          AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
          AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
          AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
          AND blocking_locks.pid != blocked_locks.pid
        JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
        WHERE NOT blocked_locks.granted
      `,

      indexUsage: `
        SELECT 
          schemaname || '.' || tablename as table_name,
          indexname as index_name,
          idx_scan as user_seeks,
          0 as user_scans,
          0 as user_lookups, 
          0 as user_updates,
          pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as size_mb
        FROM pg_stat_user_indexes 
        ORDER BY idx_scan DESC
        LIMIT 50
      `,
    };

    try {
      const client = await pgPool.connect();

      const [runningRes, slowRes, blockingRes] = await Promise.all([
        client.query(QUERIES.runningQueries),
        client.query(QUERIES.slowQueries).catch(() => ({ rows: [] })),
        client.query(QUERIES.blockingQueries),
        client.query(QUERIES.indexUsage),
      ]);

      client.release();

      // Convert to InsightItem format
      const runningQueries: InsightItem[] = runningRes.rows.map(q => ({
        session_id: q.session_id?.toString() || "unknown",
        login_name: q.login_name || "unknown",
        query: q.current_query || "",
        duration: Math.round(q.total_elapsed_time || 0),
        database: "N/A",
        type: "running_query" as const,
      }));

      const slowQueries: InsightItem[] = slowRes.rows.map(q => ({
        session_id: "N/A",
        query: q.query_text || "",
        duration: Math.round(q.mean_exec_time_ms || 0),
        count: q.calls || 0,
        type: "slow_query" as const,
      }));

      const blockingQueries: InsightItem[] = blockingRes.rows.map(q => ({
        session_id: q.blocked_session_id?.toString() || "unknown",
        query: q.blocked_query || "",
        wait_type: q.wait_type || "unknown",
        duration: Math.round(q.wait_duration_ms || 0),
        type: "blocking_query" as const,
      }));

      return {
        runningQueries,
        slowQueries,
        blockingQueries,
        waitStats: [],
        deadlocks: [],
        tempDbUsage: [],
        insights: [], // Will be populated by generateInsights if implemented
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("PostgreSQL analysis error:", message);
      throw new Error(`Failed to get query analysis: ${message}`);
    }
  },

  getOptimizationSuggestions: async (wrappedPool: PostgreSQLPool): Promise<OptimizationSuggestions> => {
    if (wrappedPool.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
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

  getProblemQueries: async (wrappedPool: PostgreSQLPool): Promise<unknown> => {
    if (wrappedPool.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
    }

    return { message: "PostgreSQL getProblemQueries not implemented yet" };
  },

  getPerformanceInsights: async (wrappedPool: PostgreSQLPool): Promise<PerformanceInsight[] | { error: string }> => {
    if (wrappedPool.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
    }

    try {
      const metrics = await postgresDriver.getMetrics(wrappedPool);
      return Array.isArray(metrics.performanceInsights) ? metrics.performanceInsights : [];
    } catch (error: unknown) {
      return { error: `Failed to retrieve performance insights: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  },

  // เพิ่ม executeQuery method สำหรับ manual query execution
  executeQuery: async (pool: Pool, query: string): Promise<unknown[]> => {
    try {
      const client = await pool.connect();
      console.log("Running manual PostgreSQL query:", query);
  
      const result = await client.query(query);
      console.log("Manual PostgreSQL query result:", result.rows);
  
      client.release();
      return result.rows;
    } catch (error: unknown) {
      console.error("[PostgreSQL ExecuteQuery Error]", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });
  
      throw new Error(
        `Failed to execute PostgreSQL query: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
};

export default postgresDriver;