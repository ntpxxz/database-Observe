import { NextResponse } from 'next/server';
import { queryAppDb as queryInventoryDb } from '@/lib/db'; // Rename for clarity
import { Driver, ServerConfig, AnyPool, Metrics } from '@/types';
import postgresDriver from '@/lib/drivers/postgresDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import mssqlDriver from '@/lib/drivers/mssqlDriver';

// Import the helper function to parse agent metrics
import { parseNodeExporterMetrics } from '@/lib/metricParser';

const drivers: { [key: string]: Driver } = {
    POSTGRES: postgresDriver,
    MYSQL: mysqlDriver,
    MSSQL: mssqlDriver,
};

export async function GET(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    let targetPool: AnyPool | undefined;
    let driver: Driver | undefined;

    try {
        const serverResult = await queryInventoryDb(`SELECT 
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
            FROM IT_ManagementDB.dbo.databaseInventory WHERE inventoryID = @id`, { id });;

        if (serverResult.recordset.length === 0) {
            return NextResponse.json({ message: `Server config with ID '${id}' not found.` }, { status: 404 });
        }

        const serverConfig: ServerConfig = serverResult.recordset[0];
        driver = drivers[serverConfig.databaseType];

        if (!driver) {
            return NextResponse.json({ message: `Unsupported DB type: ${serverConfig.databaseType}` }, { status: 400 });
        }
        
        // This part would contain the logic to connect to target DB and agent
        const [dbMetricsPromise, agentMetricsPromise] = [
            // Promise for fetching database metrics
            (async () => {
                // Create different connection configs based on database type
                let connectionConfig: any;

                switch (serverConfig.databaseType) {
                    case 'MSSQL':
                        connectionConfig = {
                            server: serverConfig.serverHost,  // Use 'server' for MSSQL
                            user: serverConfig.connectionUsername,
                            password: serverConfig.credentialReference,
                            database: serverConfig.databaseName,
                            port: serverConfig.port,
                            options: {
                                encrypt: false,
                                trustServerCertificate: true,
                                enableArithAbort: true
                            },
                            connectionTimeout: 5000
                        };
                        break;

                    case 'POSTGRES':
                    case 'MYSQL':
                    default:
                        connectionConfig = {
                            host: serverConfig.serverHost,   // Use 'host' for PostgreSQL/MySQL
                            port: serverConfig.port,
                            user: serverConfig.connectionUsername,
                            password: serverConfig.credentialReference,
                            database: serverConfig.databaseName,
                            connectionTimeout: 5000
                        };
                        break;
                }

                console.log(`Creating connection config for ${serverConfig.databaseType}:`, {
                    ...connectionConfig,
                    password: '***REDACTED***'
                });

                targetPool = await driver.connect(connectionConfig);
                return await driver.getMetrics(targetPool);
            })(),

            // Promise for fetching hardware metrics from the agent
            fetch(`http://${serverConfig.serverHost}:9100/metrics`, { timeout: 5000 })
                .then(res => {
                    if (!res.ok) throw new Error(`Agent not reachable (status: ${res.status})`);
                    return res.text();
                })
                .then(text => parseNodeExporterMetrics(text))
                .catch(err => ({ error: true, message: err.message }))
        ];

        const [dbMetrics, hardwareMetrics] = await Promise.all([dbMetricsPromise, agentMetricsPromise]);
        if (process.env.NODE_ENV === 'development') {
            console.log('✅ serverConfig:', serverConfig);
            console.log('📊 dbMetrics:', dbMetrics);
            console.log('🖥️ hardwareMetrics:', hardwareMetrics);
        }
        
        // 3. Combine the results into a single, structured response
        const finalMetrics: Metrics = {
            kpi: {
              cpu: 'error' in hardwareMetrics ? 0 : hardwareMetrics.cpu ?? 0,
              memory: 'error' in hardwareMetrics ? 0 : hardwareMetrics.memory ?? 0,
              disk: dbMetrics.kpi?.disk ?? 0,
              connections: dbMetrics.kpi?.connections ?? 0
            },
            stats: dbMetrics.stats ?? {},
            performanceInsights: dbMetrics.performanceInsights ?? [],
            hardwareError: 'error' in hardwareMetrics ? hardwareMetrics.message : null,
          };
                  
        return NextResponse.json(finalMetrics);
    } catch (err: any) {
        // Log detailed error on the server for debugging purposes
        console.error(`[Metrics API Error - ID: ${id}]`, err);
        // Return a user-friendly error message
        return NextResponse.json({ message: `Failed to fetch metrics: ${err.message}` }, { status: 500 });
    } finally {
        // 4. IMPORTANT: Always ensure the connection pool is closed after the request is finished
        if (targetPool && driver?.disconnect) {
            await driver.disconnect(targetPool);
        }
    }
}