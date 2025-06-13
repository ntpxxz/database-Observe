import sql, { ConnectionPool } from 'mssql';
import { Driver, Metrics, AnyPool } from '@/types/index';

const mssqlDriver: Driver = {
    connect: async (config: any): Promise<AnyPool> => {
        const poolConfig: sql.config = {
            user: config.user,
            password: config.password,
            server: config.host,
            database: config.database,
            port: config.port,
            options: {
                trustServerCertificate: true // Recommended for development or self-signed certs
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
        // Placeholder: Implement actual queries for MSSQL using DMVs like sys.dm_exec_sessions
        return Promise.resolve({
            kpi: { connections: 'N/A' },
            performanceInsights: { error: "MSSQL driver is not fully implemented yet." }
        });
    },
};

export default mssqlDriver;
