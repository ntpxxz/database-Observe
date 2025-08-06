import { Pool } from "pg";
import {
  Metrics,
  PerformanceInsight,
  PostgreSQLPool,
  BaseDriver,
  PostgreSQLConnectionConfig,
  QueryAnalysis,
  OptimizationSuggestions,
  InsightItem,
} from "@/types";

import {
  PROBLEMATIC_POSTGRES_WAIT_EVENTS,
} from "@/lib/sqlQueries"; // <— เพิ่ม import ลิสต์ wait ปัญหา

// Utility เล็ก ๆ สำหรับแปลงเป็น number ปลอดภัย
function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? Number(n) : fallback;
}

const postgresDriver: BaseDriver<PostgreSQLConnectionConfig, PostgreSQLPool> = {
  connect: async (config: PostgreSQLConnectionConfig): Promise<PostgreSQLPool> => {
    const pool = new Pool({
      host: config.serverHost,
      port: config.port,
      user: config.connectionUsername,
      password: config.credentialReference,
      database: config.databaseName || "postgres",
      connectionTimeoutMillis: config.connectionTimeoutMillis ?? 15000,
      idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
      max: config.max ?? 10,
      min: (config as any).min ?? 0, // บางโปรเจ็กต์อาจไม่มี min ใน type ของ Pool
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    });

    // Test connection
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    return { type: "postgresql", pool };
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
      `SELECT datname
         FROM pg_database
        WHERE datistemplate = false
          AND datname NOT IN ('postgres', 'template0', 'template1')
        ORDER BY 1`
    );
    return res.rows.map((r) => r.datname);
  },

  getMetrics: async (wrappedPool: PostgreSQLPool): Promise<Partial<Metrics>> => {
    if (wrappedPool.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
    }

    const pgPool = wrappedPool.pool;

    const QUERIES = {
      connections: `SELECT count(*)::int AS connection_count
                    FROM pg_stat_activity
                   WHERE state = 'active'`,
      cacheHit: `
        SELECT COALESCE(
                 ROUND(
                   (SUM(heap_blks_hit)::numeric * 100.0
                     / NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0)
                   ), 2
                 ), 0
               ) AS cache_hit_ratio_percent
          FROM pg_statio_user_tables
      `,
      slowQueries: `
        SELECT query AS query_text,
               total_exec_time AS total_exec_time_ms,
               calls,
               mean_exec_time AS mean_exec_time_ms
          FROM pg_stat_statements
         WHERE mean_exec_time > 100
         ORDER BY total_exec_time DESC
         LIMIT 10
      `,
      runningQueries: `
        SELECT pid AS session_id,
               usename AS login_name,
               client_addr::text AS client_net_address,
               application_name AS program_name,
               state AS status,
               EXTRACT(EPOCH FROM (now() - query_start)) * 1000 AS total_elapsed_time,
               query AS current_query
          FROM pg_stat_activity
         WHERE state = 'active'
           AND query <> '<IDLE>'
           AND pid <> pg_backend_pid()
         ORDER BY query_start
      `,
    };

    try {
      const [connRes, cacheRes, slowRes, runningRes] = await Promise.all([
        pgPool.query(QUERIES.connections),
        pgPool.query(QUERIES.cacheHit),
        // pg_stat_statements อาจไม่ถูกเปิด — กันพังด้วย catch
        pgPool.query(QUERIES.slowQueries).catch(() => ({ rows: [] as any[] })),
        pgPool.query(QUERIES.runningQueries),
      ]);

      const connections = toNum(connRes.rows[0]?.connection_count, 0);
      const cacheHitRate = toNum(cacheRes.rows[0]?.cache_hit_ratio_percent, 0);
      const slowQueries = slowRes.rows ?? [];
      const runningQueries = runningRes.rows ?? [];

      const insights: PerformanceInsight[] = [];

      // Slow query insights (> 1s)
      slowQueries.forEach((q: any, idx: number) => {
        if (toNum(q.mean_exec_time_ms) > 1000) {
          insights.push({
            id: `postgres_slow_${idx}`,
            type: "slow_query",
            severity: toNum(q.mean_exec_time_ms) > 10000 ? "critical" : "warning",
            title: "Slow Query Detected",
            message: `Query averaging ${Math.round(toNum(q.mean_exec_time_ms))}ms over ${toNum(q.calls)} executions`,
            query: q.query_text || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              mean_exec_time_ms: toNum(q.mean_exec_time_ms),
              calls: toNum(q.calls),
              total_exec_time_ms: toNum(q.total_exec_time_ms),
            },
          });
        }
      });

      // Long running query insights (> 30s)
      runningQueries.forEach((q: any, idx: number) => {
        if (toNum(q.total_elapsed_time) > 30_000) {
          insights.push({
            id: `postgres_long_running_${idx}`,
            type: "long_running_query",
            severity: toNum(q.total_elapsed_time) > 300_000 ? "critical" : "warning",
            title: "Long Running Query",
            message: `Query running for ${Math.round(toNum(q.total_elapsed_time) / 1000)} seconds`,
            query: q.current_query || "N/A",
            timestamp: new Date().toISOString(),
            details: {
              session_id: q.session_id,
              login_name: q.login_name,
              total_elapsed_time: toNum(q.total_elapsed_time),
            },
          });
        }
      });

      return {
        kpi: {
          connections,
          cpu: undefined,
          memory: undefined,
          disk: undefined,
        },
        stats: {
          cache_hit_rate: Math.round(cacheHitRate),
        },
        // ส่งเป็นอาเรย์เสมอ (ไม่ส่งเป็น object error)
        performanceInsights: insights,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("PostgreSQL metrics error:", message);
      return {
        kpi: { connections: 0 },
        stats: {},
        performanceInsights: [], // อย่าส่งเป็น object error เพื่อไม่ให้ UI พัง
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
        SELECT pid AS session_id,
               usename AS login_name,
               client_addr::text AS client_net_address,
               application_name AS program_name,
               state AS status,
               query_start AS start_time,
               EXTRACT(EPOCH FROM (now() - query_start)) * 1000 AS total_elapsed_time,
               query AS current_query
          FROM pg_stat_activity
         WHERE state = 'active'
           AND query <> '<IDLE>'
           AND pid <> pg_backend_pid()
         ORDER BY query_start
      `,
      slowQueries: `
        SELECT query AS query_text,
               total_exec_time AS total_execution_time,
               mean_exec_time AS mean_exec_time_ms,
               calls,
               (shared_blks_read + local_blks_read) AS total_logical_reads,
               CASE WHEN calls > 0
                    THEN (shared_blks_read + local_blks_read) / calls
                    ELSE 0 END AS avg_logical_reads
          FROM pg_stat_statements
         ORDER BY total_exec_time DESC
         LIMIT 20
      `,
      blockingQueries: `
        SELECT blocked_locks.pid AS blocked_session_id,
               blocking_locks.pid AS blocking_session_id,
               blocked_activity.query AS blocked_query,
               blocking_activity.query AS blocking_query,
               blocked_activity.state AS wait_type,
               EXTRACT(EPOCH FROM (now() - blocked_activity.query_start)) * 1000 AS wait_duration_ms
          FROM pg_catalog.pg_locks blocked_locks
          JOIN pg_catalog.pg_stat_activity blocked_activity
            ON blocked_activity.pid = blocked_locks.pid
          JOIN pg_catalog.pg_locks blocking_locks
            ON blocking_locks.locktype     IS NOT DISTINCT FROM blocked_locks.locktype
           AND blocking_locks.database     IS NOT DISTINCT FROM blocked_locks.database
           AND blocking_locks.relation     IS NOT DISTINCT FROM blocked_locks.relation
           AND blocking_locks.page         IS NOT DISTINCT FROM blocked_locks.page
           AND blocking_locks.tuple        IS NOT DISTINCT FROM blocked_locks.tuple
           AND blocking_locks.virtualxid   IS NOT DISTINCT FROM blocked_locks.virtualxid
           AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
           AND blocking_locks.classid      IS NOT DISTINCT FROM blocked_locks.classid
           AND blocking_locks.objid        IS NOT DISTINCT FROM blocked_locks.objid
           AND blocking_locks.objsubid     IS NOT DISTINCT FROM blocked_locks.objsubid
           AND blocking_locks.pid <> blocked_locks.pid
          JOIN pg_catalog.pg_stat_activity blocking_activity
            ON blocking_activity.pid = blocking_locks.pid
         WHERE NOT blocked_locks.granted
      `,
      // ดึง wait events จาก pg_stat_activity (เฉพาะที่มี wait_event)
      waitEvents: `
        SELECT
          pid AS session_id,
          wait_event_type,
          wait_event AS event,
          state,
          EXTRACT(EPOCH FROM (now() - query_start)) * 1000 AS total_wait_ms,
          query
        FROM pg_stat_activity
        WHERE wait_event IS NOT NULL
      `,
      // (ตัวอย่าง) คุณมี indexUsage ด้วย แต่ไม่ได้ใช้ในผลลัพธ์นี้
      indexUsage: `
        SELECT
          schemaname || '.' || tablename AS table_name,
          indexname AS index_name,
          idx_scan AS user_seeks
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
        LIMIT 50
      `,
    };

    try {
      const client = await pgPool.connect();

      const [runningRes, slowRes, blockingRes, waitRes] = await Promise.all([
        client.query(QUERIES.runningQueries),
        client.query(QUERIES.slowQueries).catch(() => ({ rows: [] })), // กันกรณีไม่ได้เปิด pg_stat_statements
        client.query(QUERIES.blockingQueries),
        client.query(QUERIES.waitEvents).catch(() => ({ rows: [] })), // กันพังในเวอร์ชันเก่า/สิทธิ์ไม่พอ
      ]);

      client.release();

      // ---- Map เป็น InsightItem/โครงสร้างของคุณ ----
      const runningQueries: InsightItem[] = (runningRes.rows || []).map((q: any) => ({
        session_id: q.session_id?.toString() || "unknown",
        login_name: q.login_name || "unknown",
        query: q.current_query || "",
        duration: Math.round(toNum(q.total_elapsed_time)),
        database: "N/A",
        type: "running_query" as const,
      }));

      const slowQueries: InsightItem[] = (slowRes.rows || []).map((q: any) => ({
        session_id: "N/A",
        query: q.query_text || "",
        duration: Math.round(toNum(q.mean_exec_time_ms)),
        count: toNum(q.calls),
        type: "slow_query" as const,
      }));

      const blockingQueries: InsightItem[] = (blockingRes.rows || []).map((q: any) => ({
        session_id: q.blocked_session_id?.toString() || "unknown",
        query: q.blocked_query || "",
        wait_type: q.wait_type || "unknown",
        duration: Math.round(toNum(q.wait_duration_ms)),
        type: "blocking_query" as const,
      }));

      // ===== กรอง WAIT EVENTS เฉพาะ “ปัญหา” =====
      const waitStats = (waitRes.rows || [])
        .filter((w: any) => {
          const key = String(w.event || w.wait_event || w.wait_event_type || "").trim();
          return PROBLEMATIC_POSTGRES_WAIT_EVENTS.has(key);
        })
        .map((w: any) => ({
          session_id: String(w.session_id ?? "N/A"),
          wait_type: w.event || w.wait_event || w.wait_event_type || "",
          waiting_tasks_count: 1, // pg_stat_activity ไม่ให้ count ราย event — ใส่ 1 ต่อแถว
          wait_time_ms: Math.round(toNum(w.total_wait_ms)),
          resource_description: w.wait_event_type || "",
          wait_duration_ms: Math.round(toNum(w.total_wait_ms)),
          query: w.query || "",
          type: "wait_stats" as const,
        }));

      return {
        runningQueries,
        slowQueries,
        blockingQueries,
        waitStats,
        deadlocks: [],
        tempDbUsage: [],
        insights: [], // ถ้าต้องการ generate insights เพิ่มเติมสามารถใส่ภายหลัง
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("PostgreSQL analysis error:", message);
      // อย่า throw เพื่อไม่ให้ API พังทั้งชุด — คืนโครงว่างแทน
      return {
        runningQueries: [],
        slowQueries: [],
        blockingQueries: [],
        waitStats: [],
        deadlocks: [],
        tempDbUsage: [],
        insights: [],
      };
    }
  },

  getOptimizationSuggestions: async (_wrapped: PostgreSQLPool): Promise<OptimizationSuggestions> => {
    // Placeholder (สามารถเพิ่มจริงภายหลัง)
    return {
      missingIndexes: [],
      unusedIndexes: [],
      tableOptimizations: [],
      fragmentedIndexes: [],
      indexSuggestions: [],
      queryRewrites: [],
    };
  },

  getProblemQueries: async (_wrapped: PostgreSQLPool): Promise<unknown> => {
    return { message: "PostgreSQL getProblemQueries not implemented yet" };
  },

  getPerformanceInsights: async (wrapped: PostgreSQLPool): Promise<PerformanceInsight[] | { error: string }> => {
    if (wrapped.type !== "postgresql") {
      throw new Error("Invalid pool type for PostgreSQL driver.");
    }
    try {
      const metrics = await postgresDriver.getMetrics(wrapped);
      return Array.isArray(metrics.performanceInsights) ? metrics.performanceInsights : [];
    } catch (error: unknown) {
      return {
        error: `Failed to retrieve performance insights: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  },

  // Manual query execution
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
  },
};

export default postgresDriver;
