import { Pool, QueryResult } from 'pg';
import { Driver, Metrics, AnyPool } from '@/types/index';

const postgresDriver: Driver = {
    connect: async (config: any): Promise<AnyPool> => {
        return new Pool(config);
    },

    disconnect: async (pool: AnyPool): Promise<void> => {
        await (pool as Pool).end();
    },

    getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
        const pgPool = pool as Pool;
        
        const METRIC_QUERIES = {
            active_connections: "SELECT count(*) AS value FROM pg_stat_activity WHERE state = 'active'",
            slow_queries: `
                SELECT 
                    query, 
                    mean_exec_time::numeric(10, 2) AS duration, 
                    calls AS count 
                FROM pg_stat_statements 
                ORDER BY mean_exec_time DESC 
                LIMIT 10;
            `,
            cache_hit_rate: `
                SELECT 
                    (sum(heap_blks_hit) * 100 / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0)) AS value 
                FROM pg_statio_user_tables;
            `
        };

        const [connectionsRes, slowQueriesRes, cacheRes] = await Promise.all([
            pgPool.query(METRIC_QUERIES.active_connections).catch((e: Error) => ({ error: true, ...e })),
            pgPool.query(METRIC_QUERIES.slow_queries).catch((): { error: boolean; message: string } => ({ error: true, message: "Could not fetch slow queries. Ensure the 'pg_stat_statements' extension is enabled on the target server." })),
            pgPool.query(METRIC_QUERIES.cache_hit_rate).catch((e: Error) => ({ error: true, ...e })),
        ]);

        const connections = 'rows' in connectionsRes ? connectionsRes.rows[0]?.value : 'N/A';
        const cacheHitRate = 'rows' in cacheRes && cacheRes.rows[0]?.value ? parseFloat(cacheRes.rows[0].value).toFixed(2) : 'N/A';
        const performanceInsights = 'error' in slowQueriesRes 
            ? { error: slowQueriesRes.message } 
            : (slowQueriesRes as QueryResult).rows.map((r: any, i: number) => ({ ...r, id: i, type: 'Slow' }));

        return {
            kpi: { connections },
            stats: { cache_hit_rate: cacheHitRate },
            performanceInsights: performanceInsights,
        };
    },
};

export default postgresDriver;
