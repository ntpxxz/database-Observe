import { Pool } from "pg";
import { Driver, Metrics, AnyPool, PerformanceInsight } from "@/types";

const postgresDriver: Driver = {
  connect: async (config: any): Promise<AnyPool> => {
    // PostgreSQL driver creates a pool which manages connections automatically.
    return new Pool(config);
  },

  disconnect: async (pool: AnyPool): Promise<void> => {
    // Closes all clients in the pool and terminates the pool.
    await (pool as Pool).end();
  },

  getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
    const pgPool = pool as Pool;

    const QUERIES = {
      connections:
        "SELECT count(*) AS value FROM pg_stat_activity WHERE state = 'active'",
      cache_hit: `SELECT (sum(heap_blks_hit) * 100 / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)) AS value FROM pg_statio_user_tables;`,
      by_total_time: `
                SELECT 
                    query, 
                    total_exec_time::numeric(10, 2) AS total_exec_time_ms,
                    calls, 
                    mean_exec_time::numeric(10, 2) AS mean_exec_time_ms
                FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;`,
      by_io: `
                SELECT 
                    query, 
                    (shared_blks_read + local_blks_read) as io_read, 
                    calls 
                FROM pg_stat_statements ORDER BY io_read DESC LIMIT 10;`,
    };

    try {
      const [connRes, cacheRes, timeRes, ioRes] = await Promise.all([
        pgPool.query(QUERIES.connections),
        pgPool.query(QUERIES.cache_hit),
        pgPool.query(QUERIES.by_total_time),
        pgPool.query(QUERIES.by_io),
      ]);

      return {
        kpi: { connections: connRes.rows[0]?.value ?? 0 },
        stats: {
          cache_hit_rate:
            parseFloat(cacheRes.rows[0]?.value).toFixed(2) || "N/A",
        },
        performanceInsights: {
          byTotalTime: timeRes.rows as PerformanceInsight[],
          byIo: ioRes.rows as PerformanceInsight[],
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("PostgreSQL metrics error:", err.message);
      // Return a structured error so the frontend can display it nicely.
      return {
        performanceInsights: {
          byTotalTime: [],
          byIo: [],
          error:
            "Failed to fetch metrics. Please ensure the 'pg_stat_statements' extension is enabled on the target server.",
        },
      };
    }
  },
  getQueryAnalysis: async (pool: AnyPool): Promise<QueryAnalysis> => {
    const pgPool = pool as any; // PostgreSQL pool type

    const QUERIES = {
      runningQueries: `
                    SELECT 
                        pid as "sessionId",
                        usename as "loginName",
                        client_addr::text as "hostName",
                        application_name as "programName",
                        state as "status",
                        query_start as "startTime",
                        EXTRACT(EPOCH FROM (now() - query_start)) * 1000 as "elapsedTime",
                        query
                    FROM pg_stat_activity 
                    WHERE state = 'active' AND query != '<IDLE>'
                    ORDER BY query_start;
                `,

      slowQueries: `
                    SELECT 
                        query,
                        total_exec_time as "totalExecutionTime",
                        mean_exec_time as "avgExecutionTime", 
                        calls as "executionCount",
                        shared_blks_read + local_blks_read as "totalLogicalReads",
                        (shared_blks_read + local_blks_read) / calls as "avgLogicalReads"
                    FROM pg_stat_statements 
                    ORDER BY total_exec_time DESC 
                    LIMIT 20;
                `,

      blockingQueries: `
                    SELECT 
                        blocked_locks.pid as "blockedSessionId",
                        blocking_locks.pid as "blockingSessionId",
                        blocked_activity.query as "blockedQuery",
                        blocking_activity.query as "blockingQuery",
                        blocked_activity.state as "waitType"
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
                    WHERE NOT blocked_locks.granted;
                `,

      indexUsage: `
                    SELECT 
                        schemaname || '.' || tablename as "tableName",
                        indexname as "indexName",
                        idx_scan as "userSeeks",
                        0 as "userScans",
                        0 as "userLookups", 
                        0 as "userUpdates",
                        pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as "sizeMB"
                    FROM pg_stat_user_indexes 
                    ORDER BY idx_scan DESC
                    LIMIT 50;
                `,
    };

    try {
      const client = await pgPool.connect();

      const [runningRes, slowRes, blockingRes, indexRes] = await Promise.all([
        client.query(QUERIES.runningQueries),
        client.query(QUERIES.slowQueries),
        client.query(QUERIES.blockingQueries),
        client.query(QUERIES.indexUsage),
      ]);

      client.release();

      return {
        runningQueries: runningRes.rows,
        slowQueries: slowRes.rows,
        blockingQueries: blockingRes.rows,
        resourceUsage: [],
        indexUsage: indexRes.rows,
        waitStats: [],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("PostgreSQL analysis error:", err.message);
      throw new Error(`Failed to get query analysis: ${err.message}`);
    }
  },
};

export default postgresDriver;
