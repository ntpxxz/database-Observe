import sql, { ConnectionPool } from 'mssql';
import { Driver as IDriver, Metrics, AnyPool, PerformanceInsight } from '@/types';

const mssqlDriver: IDriver = {
    connect: async (config: any): Promise<AnyPool> => {
        const poolConfig: sql.config = {
            user: config.user,
            password: config.password,
            server: config.host, // Use 'host' from generic config
            database: config.database,
            port: config.port,
            options: {
                trustServerCertificate: true // Important for local/dev environments
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            }
        };
        const pool = new sql.ConnectionPool(poolConfig);
        return await pool.connect();
    },

    disconnect: async (pool: AnyPool): Promise<void> => {
        await (pool as ConnectionPool).close();
    },

    getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
        const mssqlPool = pool as ConnectionPool;
        const QUERIES = {
            connections: "SELECT count(session_id) as value FROM sys.dm_exec_sessions WHERE status = 'running'",
            by_total_time: `
                SELECT TOP 10
                    SUBSTRING(st.text, (qs.statement_start_offset/2) + 1, 
                    ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) ELSE qs.statement_end_offset END - qs.statement_start_offset)/2) + 1) AS query,
                    qs.total_worker_time / 1000 AS total_exec_time_ms,
                    qs.execution_count AS calls,
                    (qs.total_worker_time / qs.execution_count) / 1000 AS mean_exec_time_ms
                FROM sys.dm_exec_query_stats AS qs
                CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
                ORDER BY qs.total_worker_time DESC;
            `,
            by_io: `
                SELECT TOP 10
                    SUBSTRING(st.text, (qs.statement_start_offset/2) + 1, 
                    ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) ELSE qs.statement_end_offset END - qs.statement_start_offset)/2) + 1) AS query,
                    (qs.total_physical_reads + qs.total_logical_reads) as io_read,
                    qs.execution_count AS calls
                FROM sys.dm_exec_query_stats AS qs
                CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
                ORDER BY (qs.total_physical_reads + qs.total_logical_reads) DESC;
            `
        };

        try {
            const [connRes, timeRes, ioRes] = await Promise.all([
                mssqlPool.request().query(QUERIES.connections),
                mssqlPool.request().query(QUERIES.by_total_time),
                mssqlPool.request().query(QUERIES.by_io),
            ]);
            
            return {
                kpi: { connections: connRes.recordset[0]?.value ?? 0 },
                performanceInsights: {
                    byTotalTime: timeRes.recordset as PerformanceInsight[],
                    byIo: ioRes.recordset as PerformanceInsight[],
                }
            };
        } catch (err: any) {
             console.error("MSSQL metrics error:", err.message);
             return { 
                performanceInsights: { 
                    byTotalTime: [], 
                    byIo: [],
                    error: "Failed to fetch metrics. Ensure the user has 'VIEW SERVER STATE' permission."
                } 
            };
        }
    },
};

export default mssqlDriver;

