import { NextResponse } from "next/server";
import {
  DatabaseInventory,
  DriverMap,
  isDbType,
  MSSQLConnectionConfig,
  PostgreSQLConnectionConfig,
  MySQLConnectionConfig,
  BaseConnectionConfig,
  DbType,

} from "@/types";
import { queryAppDb as queryAppStaticDb } from "@/lib/appDb";
import mssqlDriver from "@/lib/drivers/mssqlDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";

const drivers: DriverMap = {
  MSSQL: mssqlDriver,
  MYSQL: mysqlDriver,
  POSTGRES: postgresDriver,
};

// Helper function to create database-specific connection config
function createConnectionConfig(
  serverData: DatabaseInventory | any, 
  databaseName?: string
): MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig | BaseConnectionConfig {
  const dbType = (serverData.databaseType || "").toUpperCase();

  switch (dbType) {
    case 'MSSQL':
      return {
        databaseType: 'MSSQL',
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
        databaseName: databaseName || serverData.databaseName || "master",
        options: {
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
        requestTimeout: 15000,
        connectionTimeout: 15000
      } as MSSQLConnectionConfig;

    case 'POSTGRES':
      return {
        databaseType: 'POSTGRES',
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
        databaseName: databaseName || serverData.databaseName || "postgres",
        ssl: false,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000
      } as PostgreSQLConnectionConfig;

    case 'MYSQL':
      return {
        databaseType: 'MYSQL',
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
        databaseName: databaseName || serverData.databaseName,
        ssl: false,
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0,
        connectTimeout: 15000,
        idleTimeout: 15000
      } as MySQLConnectionConfig;

    default:
      return {
        databaseType: 'UNKNOWN' as any,
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
      } as BaseConnectionConfig;
  }
}

// Helper function สำหรับจัดการการเชื่อมต่อแยกตาม database type
async function connectAndListDatabases(
  dbType: DbType,
  connectionConfig: MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig
): Promise<string[]> {
  switch (dbType) {
    case 'MSSQL': {
      const driver = drivers.MSSQL;
      const pool = await driver.connect(connectionConfig as MSSQLConnectionConfig);
      const databases = await driver.listDatabases(pool);
      await driver.disconnect(pool);
      return databases;
    }
    case 'POSTGRES': {
      const driver = drivers.POSTGRES;
      const pool = await driver.connect(connectionConfig as PostgreSQLConnectionConfig);
      const databases = await driver.listDatabases(pool);
      await driver.disconnect(pool);
      return databases;
    }
    case 'MYSQL': {
      const driver = drivers.MYSQL;
      const pool = await driver.connect(connectionConfig as MySQLConnectionConfig);
      const databases = await driver.listDatabases(pool);
      await driver.disconnect(pool);
      return databases;
    }
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

// Helper function สำหรับทดสอบการเชื่อมต่อ
async function testConnection(
  dbType: DbType,
  connectionConfig: MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig
): Promise<void> {
  switch (dbType) {
    case 'MSSQL': {
      const driver = drivers.MSSQL;
      const pool = await driver.connect(connectionConfig as MSSQLConnectionConfig);
      await driver.disconnect(pool);
      break;
    }
    case 'POSTGRES': {
      const driver = drivers.POSTGRES;
      const pool = await driver.connect(connectionConfig as PostgreSQLConnectionConfig);
      await driver.disconnect(pool);
      break;
    }
    case 'MYSQL': {
      const driver = drivers.MYSQL;
      const pool = await driver.connect(connectionConfig as MySQLConnectionConfig);
      await driver.disconnect(pool);
      break;
    }
    default:
      throw new Error(`Unsupported database type: ${dbType}`);
  }
}

export async function GET() {
  try {
    const result = await queryAppStaticDb(`
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

    const rawServers: DatabaseInventory[] = result.recordset as DatabaseInventory[];

    const enrichedServers = await Promise.all(
      rawServers.map(async (server) => {
        const dbType = server.databaseType.toUpperCase() as DbType;

        if (!isDbType(dbType)) {
          console.warn(`❌ Unsupported database type encountered: ${dbType}. Skipping driver lookup.`);
          return { ...server, databases: [] };
        }

        // สร้าง connection config
        const connectionConfig = createConnectionConfig(server);

        try {
          // ใช้ helper function ที่จัดการ type แยกตาม database type
          const databases = await connectAndListDatabases(
            dbType, 
            connectionConfig as MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig
          );
          return { ...server, databases };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error(`⚠️ Failed to fetch databases for ${server.systemName}:`, message);
          return { ...server, databases: [] };
        }
      }),
    );

    const groupedByZone: Record<string, any[]> = {};
    for (const srv of enrichedServers) {
      if (!groupedByZone[srv.zone]) {
        groupedByZone[srv.zone] = [];
      }
      groupedByZone[srv.zone].push(srv);
    }

    return NextResponse.json({ zones: groupedByZone });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API GET /inventory] Internal Error:", message);
    return NextResponse.json(
      { message: `Server Error: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (
      !body.systemName ||
      !body.serverHost ||
      !body.port ||
      !body.databaseType ||
      !body.connectionUsername ||
      !body.credentialReference
    ) {
      return NextResponse.json(
        { success: false, message: "Missing required fields." },
        { status: 400 },
      );
    }

    const dbTypeForDriver = body.databaseType.toUpperCase() as DbType;

    if (!isDbType(dbTypeForDriver)) {
      return NextResponse.json(
        {
          success: false,
          message: `Unsupported DB type: ${body.databaseType}`,
        },
        { status: 400 },
      );
    }

    // สร้าง connection config
    const connectionConfig = createConnectionConfig(body);

    try {
      // ทดสอบการเชื่อมต่อก่อนบันทึกลงฐานข้อมูล
      await testConnection(
        dbTypeForDriver, 
        connectionConfig as MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error";
      return NextResponse.json(
        { success: false, message: `Connection test failed: ${message}` },
        { status: 400 },
      );
    }

    // ถ้าการเชื่อมต่อสำเร็จ ให้บันทึกลงฐานข้อมูล
    const insertQuery = `
      INSERT INTO IT_ManagementDB.dbo.DatabaseInventory
      (SystemName, ServerHost, Port, Zone, DatabaseType, ConnectionUsername, CredentialReference)
      VALUES (@systemName, @serverHost, @port, @zone, @databaseType, @connectionUsername, @credentialReference)
    `;

    await queryAppStaticDb(insertQuery, {
      systemName: body.systemName,
      serverHost: body.serverHost,
      port: body.port,
      zone: body.zone || "",
      databaseType: body.databaseType.toUpperCase(),
      connectionUsername: body.connectionUsername,
      credentialReference: body.credentialReference,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API POST /inventory]", message);
    return NextResponse.json(
      { message: `Server Error: ${message}` },
      { status: 500 },
    );
  }
}