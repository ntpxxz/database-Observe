import { createPool, Pool as MySqlPool, RowDataPacket } from 'mysql2/promise';
import { Driver as IDriver, Metrics, AnyPool, PerformanceInsight } from '@/types';

const mysqlDriver: IDriver = {
    connect: async (config: any): Promise<AnyPool> => createPool(config),
    disconnect: async (pool: AnyPool): Promise<void> => await (pool as MySqlPool).end(),
    getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
        const mysqlPool = pool as MySqlPool;
        
        const QUERIES = {
            connections: "SELECT COUNT(*) AS value FROM information_schema.processlist WHERE command != 'Sleep'",
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
                FROM sys.statement_analysis WHERE rows_sent > 0 ORDER BY rows_sent DESC LIMIT 10;`
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
                }
            };
        } catch (err: any) {
            console.error("MySQL metrics error:", err.message);
            return { 
                performanceInsights: { 
                    byTotalTime: [], 
                    byIo: [],
                    error: "Failed to fetch metrics. Please ensure the Performance Schema is enabled on the target server."
                } 
            };
        }
    },
};

export default mysqlDriver;