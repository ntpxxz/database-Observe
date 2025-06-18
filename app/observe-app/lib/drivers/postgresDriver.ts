import { Pool } from 'pg';
import { Driver, Metrics, AnyPool, PerformanceInsight } from '@/types';

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
            connections: "SELECT count(*) AS value FROM pg_stat_activity WHERE state = 'active'",
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
                FROM pg_stat_statements ORDER BY io_read DESC LIMIT 10;`
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
                stats: { cache_hit_rate: parseFloat(cacheRes.rows[0]?.value).toFixed(2) || 'N/A' },
                performanceInsights: {
                    byTotalTime: timeRes.rows as PerformanceInsight[],
                    byIo: ioRes.rows as PerformanceInsight[],
                }
            };
        } catch (err: any) {
            console.error("PostgreSQL metrics error:", err.message);
            // Return a structured error so the frontend can display it nicely.
            return { 
                performanceInsights: { 
                    byTotalTime: [], 
                    byIo: [], 
                    error: "Failed to fetch metrics. Please ensure the 'pg_stat_statements' extension is enabled on the target server." 
                } 
            };
        }
    },
};

export default postgresDriver;
