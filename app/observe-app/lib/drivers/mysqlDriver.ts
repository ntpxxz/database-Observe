import { createPool, Pool as MySqlPool, RowDataPacket } from 'mysql2/promise';
import { Driver, Metrics, AnyPool } from '@/types/index';

const mysqlDriver: Driver = {
    connect: async (config: any): Promise<AnyPool> => {
        return createPool(config);
    },

    disconnect: async (pool: AnyPool): Promise<void> => {
        await (pool as MySqlPool).end();
    },

    getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
        const mysqlPool = pool as MySqlPool;
        
        const METRIC_QUERIES = {
            active_connections: "SELECT COUNT(*) AS value FROM information_schema.processlist WHERE command != 'Sleep'",
            slow_queries: `
                SELECT 
                    query_text AS query, 
                    avg_timer_wait/1000000000 AS duration, 
                    exec_count AS count 
                FROM sys.statement_analysis 
                WHERE avg_timer_wait > 0 
                ORDER BY avg_timer_wait DESC 
                LIMIT 10;
            `
        };

        const [connectionsRes, slowQueriesRes] = await Promise.all([
            mysqlPool.query(METRIC_QUERIES.active_connections).catch((e: any) => [{ error: true, ...e }]),
            mysqlPool.query(METRIC_QUERIES.slow_queries).catch(() => [{ error: true, message: "Could not fetch slow queries. Ensure the Performance Schema is enabled on the target MySQL server." }]),
        ]);
        
        const connectionsRows = connectionsRes[0] as RowDataPacket[];
        const slowQueriesRowsResult = slowQueriesRes[0];

        const performanceInsights = 'error' in slowQueriesRowsResult ? 
            { error: (slowQueriesRowsResult as any).message } : 
            (slowQueriesRowsResult as RowDataPacket[]).map((r, i) => ({ ...r, id: i, type: 'Slow' }));

        return {
            kpi: { connections: connectionsRows?.[0]?.value ?? 'N/A' },
            performanceInsights: performanceInsights
        };
    },
};

export default mysqlDriver;
