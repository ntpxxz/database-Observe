import { NextResponse } from 'next/server';
import { queryAppDb as queryInventoryDb } from '@/lib/db';
import { Driver, ServerConfig, AnyPool } from '@/types';
import postgresDriver from '@/lib/drivers/postgresDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import mssqlDriver from '@/lib/drivers/mssqlDriver';

const drivers: { [key: string]: Driver } = {
    POSTGRES: postgresDriver,
    MYSQL: mysqlDriver,
    MSSQL: mssqlDriver,
};

export async function GET(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const analysisType = searchParams.get('type') || 'all'; // all, running, slow, blocking, optimization

    let targetPool: AnyPool | undefined;
    let driver: Driver | undefined;

    try {
        // Get server config
        const serverResult = await queryInventoryDb(`
            SELECT 
                InventoryID as inventoryID,
                SystemName as systemName,
                ServerHost as serverHost,
                Port as port,
                Zone as zone,
                DatabaseType as databaseType,
                DatabaseName as databaseName,
                ConnectionUsername as connectionUsername,
                CredentialReference as credentialReference,
                PurposeNotes as purposeNotes,
                OwnerContact as ownerContact,
                CreatedDate as createdDate
            FROM IT_ManagementDB.dbo.databaseInventory 
            WHERE inventoryID = @id
        `, { id });

        if (serverResult.recordset.length === 0) {
            return NextResponse.json({ message: `Server config with ID '${id}' not found.` }, { status: 404 });
        }

        const serverConfig: ServerConfig = serverResult.recordset[0];
        driver = drivers[serverConfig.databaseType];

        if (!driver) {
            return NextResponse.json({ message: `Unsupported DB type: ${serverConfig.databaseType}` }, { status: 400 });
        }

        // Build connection config
        let connectionConfig: any;
        switch (serverConfig.databaseType) {
            case 'MSSQL':
                connectionConfig = {
                    server: serverConfig.serverHost,
                    user: serverConfig.connectionUsername,
                    password: serverConfig.credentialReference,
                    database: serverConfig.databaseName,
                    port: serverConfig.port,
                    options: {
                        encrypt: false,
                        trustServerCertificate: true,
                        enableArithAbort: true
                    },
                    connectionTimeout: 10000
                };
                break;
            case 'POSTGRES':
            case 'MYSQL':
            default:
                connectionConfig = {
                    host: serverConfig.serverHost,
                    port: serverConfig.port,
                    user: serverConfig.connectionUsername,
                    password: serverConfig.credentialReference,
                    database: serverConfig.databaseName,
                    connectionTimeout: 10000
                };
                break;
        }

        // Connect to target DB
        targetPool = await driver.connect(connectionConfig);

        // Query analysis
        let analysisResult: any = {};

        switch (analysisType) {
            case 'running':
                if (driver.getQueryAnalysis) {
                    const analysis = await driver.getQueryAnalysis(targetPool);
                    analysisResult = { runningQueries: analysis.runningQueries };
                }
                break;
            case 'slow':
                if (driver.getQueryAnalysis) {
                    const analysis = await driver.getQueryAnalysis(targetPool);
                    analysisResult = { slowQueries: analysis.slowQueries };
                }
                break;
            case 'blocking':
                if (driver.getQueryAnalysis) {
                    const analysis = await driver.getQueryAnalysis(targetPool);
                    analysisResult = { blockingQueries: analysis.blockingQueries };
                }
                break;
            case 'optimization':
                if (driver.getOptimizationSuggestions) {
                    analysisResult = await driver.getOptimizationSuggestions(targetPool);
                }
                break;
            case 'all':
            default:
                if (driver.getQueryAnalysis) {
                    analysisResult = await driver.getQueryAnalysis(targetPool);
                }
                if (driver.getOptimizationSuggestions) {
                    const optimizationData = await driver.getOptimizationSuggestions(targetPool);
                    analysisResult.optimization = optimizationData;
                }
                break;
        }

        // Response
        const response = {
            serverInfo: {
                systemName: serverConfig.systemName,
                serverHost: serverConfig.serverHost,
                databaseType: serverConfig.databaseType,
                databaseName: serverConfig.databaseName,
                zone: serverConfig.zone
            },
            analysisType,
            timestamp: new Date().toISOString(),
            data: analysisResult
        };

        return NextResponse.json(response);

    } catch (err: any) {
        console.error(`[Query Analysis API Error - ID: ${id}]`, err);
        return NextResponse.json({ 
            message: `Failed to analyze queries: ${err.message}`,
            serverInfo: { systemName: 'Unknown', serverHost: 'Unknown' }
        }, { status: 500 });
    } finally {
        if (targetPool && driver?.disconnect) {
            await driver.disconnect(targetPool);
        }
    }
}

// POST endpoint for specific optimization actions
export async function POST(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    const body = await request.json();
    const { action, query } = body; // action: 'kill', 'explain', 'optimize'

    let targetPool: AnyPool | undefined;
    let driver: Driver | undefined;

    try {
        // Get server config
        const serverResult = await queryInventoryDb(`
            SELECT 
                InventoryID as inventoryID,
                SystemName as systemName,
                ServerHost as serverHost,
                Port as port,
                Zone as zone,
                DatabaseType as databaseType,
                DatabaseName as databaseName,
                ConnectionUsername as connectionUsername,
                CredentialReference as credentialReference
            FROM IT_ManagementDB.dbo.databaseInventory 
            WHERE inventoryID = @id
        `, { id });

        if (serverResult.recordset.length === 0) {
            return NextResponse.json({ message: `Server config with ID '${id}' not found.` }, { status: 404 });
        }

        const serverConfig: ServerConfig = serverResult.recordset[0];
        driver = drivers[serverConfig.databaseType];

        if (!driver) {
            return NextResponse.json({ message: `Unsupported DB type: ${serverConfig.databaseType}` }, { status: 400 });
        }

        // Build connection config
        let connectionConfig: any;
        switch (serverConfig.databaseType) {
            case 'MSSQL':
                connectionConfig = {
                    server: serverConfig.serverHost,
                    user: serverConfig.connectionUsername,
                    password: serverConfig.credentialReference,
                    database: serverConfig.databaseName,
                    port: serverConfig.port,
                    options: {
                        encrypt: false,
                        trustServerCertificate: true,
                        enableArithAbort: true
                    },
                    connectionTimeout: 10000
                };
                break;
            default:
                connectionConfig = {
                    host: serverConfig.serverHost,
                    port: serverConfig.port,
                    user: serverConfig.connectionUsername,
                    password: serverConfig.credentialReference,
                    database: serverConfig.databaseName,
                    connectionTimeout: 10000
                };
                break;
        }

        // Connect to target DB
        targetPool = await driver.connect(connectionConfig);

        // Handle action
        let result: any = {};
        if (action === 'kill' && driver.killQuery) {
            result = await driver.killQuery(targetPool, query);
        } else if (action === 'explain' && driver.explainQuery) {
            result = await driver.explainQuery(targetPool, query);
        } else if (action === 'optimize' && driver.optimizeQuery) {
            result = await driver.optimizeQuery(targetPool, query);
        } else {
            result = { message: 'Unsupported action or driver does not implement this action.' };
        }

        return NextResponse.json(result);

    } catch (err: any) {
        console.error(`[Query Analysis POST API Error - ID: ${id}]`, err);
        return NextResponse.json({ 
            message: `Failed to perform action: ${err.message}`,
            serverInfo: { systemName: 'Unknown', serverHost: 'Unknown' }
        }, { status: 500 });
    } finally {
        if (targetPool && driver?.disconnect) {
            await driver.disconnect(targetPool);
        }
    }
}