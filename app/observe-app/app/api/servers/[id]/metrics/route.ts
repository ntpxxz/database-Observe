import { NextResponse } from 'next/server';
import { Driver, AnyPool, Metrics } from '@/types';
import { queryAppDb } from '@/lib/db';
import postgresDriver from '@/lib/drivers/postgresDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import mssqlDriver from '@/lib/drivers/mssqlDriver';

const drivers: { [key: string]: Driver } = {
    POSTGRES: postgresDriver,
    MYSQL: mysqlDriver,
    MSSQL: mssqlDriver
};

/**
 * API route handler for fetching performance metrics from a target database.
 * This version focuses specifically on fetching query performance insights.
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { id } = params;
    let targetPool: AnyPool | undefined;
    let driver: Driver | undefined;

    try {
        // 1. Fetch the server's connection details from our app's database
        const result = await queryAppDb('SELECT * FROM servers WHERE inventoryID = @id', { id });
        if (result.recordset.length === 0) {
            return NextResponse.json({ message: 'Server configuration not found.' }, { status: 404 });
        }
        const serverConfig = result.recordset[0];
        driver = drivers[serverConfig.db_type];
        if (!driver) {
            return NextResponse.json({ message: `Unsupported DB type: ${serverConfig.db_type}` }, { status: 400 });
        }

        // 2. Connect to the target database
        const connectionConfig = {
            host: serverConfig.serverHost,
            port: serverConfig.port,
            user: serverConfig.connectionUsername,
            password: serverConfig.credentialReference, // Assuming this holds the password
            database: serverConfig.databaseName,
            connectionTimeout: 5000,
        };

        targetPool = await driver.connect(connectionConfig);

        // 3. Fetch ONLY the database-related metrics using the driver
        const dbMetrics = await driver.getMetrics(targetPool);

        // 4. Construct the final response, focusing on query insights
        const finalMetrics: Metrics = {
            kpi: { // Return placeholders for now
                cpu: undefined,
                memory: undefined,
                ...dbMetrics.kpi
            },
            stats: dbMetrics.stats,
            performanceInsights: dbMetrics.performanceInsights || { error: 'No performance insights available' },
            hardwareError: "Hardware monitoring is not implemented in this step."
        };
        
        return NextResponse.json(finalMetrics);

    } catch (err: any) {
        console.error(`[Metrics Error - Server ID: ${id}]`, err.message);
        return NextResponse.json({ message: `Failed to process request: ${err.message}` }, { status: 500 });
    } finally {
        // 5. Always ensure the connection is closed
        if (targetPool && driver?.disconnect) {
            await driver.disconnect(targetPool);
        }
    }
}
