import { createPool, Pool as MySqlPool, RowDataPacket } from "mysql2/promise";
import {
  Driver as IDriver,
  Metrics,
  AnyPool,
  PerformanceInsight,
} from "@/types";

const mysqlDriver: IDriver = {
  connect: async (config: any): Promise<AnyPool> => createPool(config),
  disconnect: async (pool: AnyPool): Promise<void> =>
    await (pool as MySqlPool).end(),
  getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
    const mysqlPool = pool as MySqlPool;

    const QUERIES = {
      connections:
        "SELECT COUNT(*) AS value FROM information_schema.processlist WHERE command != 'Sleep'",
      by_total_time: `
                SELECT 
                    query_text as query, 
                    total_latency, 
                    exec_count as calls
                FROM sys.statement_analysis 
                WHERE avg_timer_wait > 0 ORDER BY total_latency DESC LIMIT 10;`,
      by_io: `
                SELECT 
                    query_text as query, 
                    rows_sent, 
                    exec_count as calls 
                FROM sys.statement_analysis WHERE rows_sent > 0 ORDER BY rows_sent DESC LIMIT 10;`,
    };

    try {
      const [connRes, timeRes, ioRes] = await Promise.all([
        mysqlPool.query(QUERIES.connections),
        mysqlPool.query(QUERIES.by_total_time),
        mysqlPool.query(QUERIES.by_io),
      ]);

      const connections = (connRes[0] as RowDataPacket[])[0]?.value ?? 0;

      return {
        kpi: { connections },
        performanceInsights: {
          byTotalTime: timeRes[0] as PerformanceInsight[],
          byIo: ioRes[0] as PerformanceInsight[],
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("MySQL metrics error:", err.message);
      return {
        performanceInsights: {
          byTotalTime: [],
          byIo: [],
          error:
            "Failed to fetch metrics. Please ensure the Performance Schema is enabled on the target server.",
        },
      };
    }
  },
  getQueryAnalysis: async (pool: AnyPool): Promise<QueryAnalysis> => {
    const mysqlPool = pool as any; // MySQL pool type

    const QUERIES = {
      runningQueries: `
                    SELECT 
                        ID as sessionId,
                        USER as loginName,
                        HOST as hostName,
                        DB as databaseName,
                        COMMAND as command,
                        TIME as elapsedTime,
                        STATE as status,
                        INFO as query
                    FROM INFORMATION_SCHEMA.PROCESSLIST 
                    WHERE COMMAND != 'Sleep' AND INFO IS NOT NULL
                    ORDER BY TIME DESC;
                `,

      slowQueries: `
                    SELECT 
                        DIGEST_TEXT as query,
                        SUM_TIMER_WAIT / 1000000000 as totalExecutionTime,
                        AVG_TIMER_WAIT / 1000000000 as avgExecutionTime,
                        COUNT_STAR as executionCount,
                        SUM_ROWS_EXAMINED as totalLogicalReads,
                        AVG_ROWS_EXAMINED as avgLogicalReads
                    FROM performance_schema.events_statements_summary_by_digest 
                    WHERE DIGEST_TEXT IS NOT NULL
                    ORDER BY SUM_TIMER_WAIT DESC 
                    LIMIT 20;
                `,

      indexUsage: `
                    SELECT 
                        TABLE_SCHEMA as databaseName,
                        TABLE_NAME as tableName,
                        INDEX_NAME as indexName,
                        0 as userSeeks,
                        0 as userScans,
                        0 as userLookups,
                        0 as userUpdates,
                        ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) as sizeMB
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
                    ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
                    LIMIT 50;
                `,
    };

    try {
      const connection = await mysqlPool.getConnection();

      const [runningRes, slowRes, indexRes] = await Promise.all([
        connection.query(QUERIES.runningQueries),
        connection.query(QUERIES.slowQueries),
        connection.query(QUERIES.indexUsage),
      ]);

      connection.release();

      return {
        runningQueries: runningRes[0],
        slowQueries: slowRes[0],
        blockingQueries: [],
        resourceUsage: [],
        indexUsage: indexRes[0],
        waitStats: [],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("MySQL analysis error:", err.message);
      throw new Error(`Failed to get query analysis: ${err.message}`);
    }
  },
};

export default mysqlDriver;
