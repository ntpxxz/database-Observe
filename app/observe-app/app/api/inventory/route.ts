import { NextResponse } from 'next/server';
import { Driver } from '@/types';
import { queryAppDb } from '@/lib/db';
import mssqlDriver from '@/lib/drivers/mssqlDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import postgresDriver from '@/lib/drivers/postgresDriver';

const drivers: { [key: string]: Driver } = {
  MSSQL: mssqlDriver,
  MYSQL: mysqlDriver,
  POSTGRES: postgresDriver,
};

export async function GET() {
  try {
    const result = await queryAppDb(`
      SELECT 
        InventoryID as inventoryID,
        SystemName as systemName,
        ServerHost as serverHost,
        Port as port,
        Zone as zone,
        DatabaseType as databaseType,
        ConnectionUsername as connectionUsername,
        CredentialReference as credentialReference
      FROM IT_ManagementDB.dbo.DatabaseInventory
      ORDER BY zone ASC, systemName ASC
    `);

    const rawServers = result.recordset;

    const enrichedServers = await Promise.all(rawServers.map(async (server) => {
      const dbType = (server.databaseType || '').toUpperCase();
      const driver = drivers[dbType];

      if (!driver || !driver.getDatabases) {
        console.warn(`❌ Unsupported driver or getDatabases missing for: ${dbType}`);
        return { ...server, databases: [] };
      }

      const connectionConfig = {
        server: server.serverHost,
        port: server.port,
        user: server.connectionUsername,
        password: server.credentialReference,
        database: 'master', // default fallback
        connectionTimeout: 10000,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
      };

      try {
        const pool = await driver.connect(connectionConfig);
        const databases = await driver.getDatabases(pool);
        await driver.disconnect(pool);
        return { ...server, databases };
      } catch (e: any) {
        console.error(`⚠️ Failed to fetch databases for ${server.systemName}:`, e.message);
        return { ...server, databases: [] };
      }
    }));

    // Group by zone
    const groupedByZone: Record<string, any[]> = {};
    for (const srv of enrichedServers) {
      if (!groupedByZone[srv.zone]) {
        groupedByZone[srv.zone] = [];
      }
      groupedByZone[srv.zone].push(srv);
    }

    return NextResponse.json({ zones: groupedByZone });

  } catch (error: any) {
    console.error("[API GET /inventory] Internal Error:", error.message);
    return NextResponse.json(
      { message: `Server Error: ${error.message}` },
      { status: 500 }
    );
  }
}


export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.systemName || !body.serverHost || !body.port || !body.databaseType || !body.connectionUsername || !body.credentialReference) {
      return NextResponse.json({ success: false, message: 'Missing required fields.' }, { status: 400 });
    }

    const driver = drivers[body.databaseType.toUpperCase()];
    if (!driver) {
      return NextResponse.json({ success: false, message: `Unsupported DB type: ${body.databaseType}` }, { status: 400 });
    }

    const connectionConfig = {
      server: body.serverHost,
      user: body.connectionUsername,
      password: body.credentialReference ,
      database: '', // allow empty to connect to server only
      port: body.port,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      connectionTimeout: 10000
    };

    console.log(`[POST /inventory] config:`, {
      ...connectionConfig,
      password: '***REDACTED***' // redact password for security
    });

    const pool = await driver.connect(connectionConfig);
    await driver.disconnect(pool);

    // Insert into database
    const insertQuery = `
      INSERT INTO IT_ManagementDB.dbo.DatabaseInventory (SystemName, ServerHost, Port, Zone, DatabaseType, ConnectionUsername, CredentialReference)
      VALUES (@systemName, @serverHost, @port, @zone, @databaseType, @connectionUsername, @credentialReference)
    `;
    console.log('insert', insertQuery)
    await queryAppDb(insertQuery, {
      systemName: body.systemName,
      serverHost: body.serverHost,
      port: body.port,
      zone: body.zone || '',
      databaseType: body.databaseType.toUpperCase(),
      connectionUsername: body.connectionUsername,
      credentialReference: body.credentialReference
    });
    

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("[API POST /inventory]", error);
    return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
  }
}