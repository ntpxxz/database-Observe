import { NextResponse } from "next/server";
import {
  DatabaseInventory,
  DriverMap,
  isDbType,
  MSSQLConnectionConfig, // <-- Import เพิ่มเติม
  PostgreSQLConnectionConfig, // <-- Import เพิ่มเติม
  MySQLConnectionConfig, // <-- Import เพิ่มเติม
  BaseConnectionConfig // <-- Import เพิ่มเติม
} from "@/types"; // ตรวจสอบ Path ให้ถูกต้อง
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
// **แก้ไขที่นี่: กำหนด Return Type ของ createConnectionConfig ให้แม่นยำ**
function createConnectionConfig(serverData: DatabaseInventory | any, databaseName?: string): MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig | BaseConnectionConfig {
  const dbType = (serverData.databaseType || "").toUpperCase();

  switch (dbType) {
    case 'MSSQL':
      return {
        databaseType: 'MSSQL', // ต้องมี databaseType ใน config
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
        databaseName: databaseName || serverData.databaseName || "master", // เปลี่ยนเป็น databaseName
        options: { // ใส่ใน options ถ้าเป็น ms-sql
          encrypt: false,
          trustServerCertificate: true,
          enableArithAbort: true,
        },
        requestTimeout: 15000,
        connectionTimeout: 15000
      } as MSSQLConnectionConfig; // Type assertion เพื่อความชัวร์ (อาจไม่จำเป็นถ้า properties ตรงเป๊ะ)

    case 'POSTGRES':
      return {
        databaseType: 'POSTGRES', // ต้องมี databaseType ใน config
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
        databaseName: databaseName || serverData.databaseName || "postgres", // เปลี่ยนเป็น databaseName
        ssl: false,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000
      } as PostgreSQLConnectionConfig; // Type assertion

    case 'MYSQL':
      return {
        databaseType: 'MYSQL', // ต้องมี databaseType ใน config
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
        databaseName: databaseName || serverData.databaseName, // เปลี่ยนเป็น databaseName
        ssl: false,
        connectionLimit: 10, // เพิ่ม connectionLimit,
        waitForConnections: true,
        queueLimit: 0,
        connectTimeout: 15000,
        idleTimeout: 15000
      } as MySQLConnectionConfig; // Type assertion

    default:
      // Fallback for unknown database types
      // ควร return Type ที่เข้ากันได้กับ BaseConnectionConfig
      return {
        databaseType: 'UNKNOWN' as any, // หรือกำหนดให้เป็น Type ที่บ่งบอกว่าไม่รู้จัก
        serverHost: serverData.serverHost,
        connectionUsername: serverData.connectionUsername,
        credentialReference: serverData.credentialReference,
        port: serverData.port,
        // เพิ่ม properties ที่จำเป็นสำหรับ BaseConnectionConfig
      } as BaseConnectionConfig;
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
        const dbType = server.databaseType.toUpperCase();

        if (!isDbType(dbType)) {
          console.warn(`❌ Unsupported database type encountered: ${dbType}. Skipping driver lookup.`);
          return { ...server, databases: [] };
        }

        const driver = drivers[dbType];

        // ตรวจสอบ driver อีกครั้งเผื่อกรณีที่ driver object ไม่สมบูรณ์ (แม้ isDbType จะช่วยแล้วก็ตาม)
        // บรรทัดนี้ถูกต้องแล้ว
        if (!driver || !driver.listDatabases) {
          console.warn(
            `❌ Unsupported driver or missing getDatabases for: ${dbType}`,
          );
          return { ...server, databases: [] };
        }

        // Use the new connection config helper
        // **แก้ไขตรงนี้: Cast connectionConfig ให้เป็น Type ที่ถูกต้อง**
        // เนื่องจาก driver เป็น BaseDriver<TConfig, TPool>
        // และเรารู้ว่า dbType เป็น Type ที่ถูกต้อง
        // เราสามารถใช้ Type assertion ที่เฉพาะเจาะจงมากขึ้น
        let connectionConfig: MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig;
        if (dbType === 'MSSQL') {
             connectionConfig = createConnectionConfig(server) as MSSQLConnectionConfig;
        } else if (dbType === 'POSTGRES') {
             connectionConfig = createConnectionConfig(server) as PostgreSQLConnectionConfig;
        } else { // dbType === 'MYSQL'
             connectionConfig = createConnectionConfig(server) as MySQLConnectionConfig;
        }


        try {
          // Type ของ connectionConfig จะตรงกับ TConfig ของ driver แล้ว
          const pool = await driver.connect(connectionConfig as any); // ยังคงต้องใช้ as any ชั่วคราว ถ้า createConnectionConfig ไม่ได้ Return Type ที่ตรงเป๊ะ
          const databases = await driver.listDatabases(pool);
          await driver.disconnect(pool);
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

    const dbTypeForDriver = body.databaseType.toUpperCase();

    if (!isDbType(dbTypeForDriver)) {
      return NextResponse.json(
        {
          success: false,
          message: `Unsupported DB type: ${body.databaseType}`,
        },
        { status: 400 },
      );
    }

    const driver = drivers[dbTypeForDriver];

    // **แก้ไขตรงนี้สำหรับ POST handler**
    // เช่นเดียวกับใน GET, ต้อง Cast connectionConfig ให้เป็น Type ที่ถูกต้อง
    let connectionConfig: MSSQLConnectionConfig | PostgreSQLConnectionConfig | MySQLConnectionConfig;
    if (dbTypeForDriver === 'MSSQL') {
         connectionConfig = createConnectionConfig(body) as MSSQLConnectionConfig;
    } else if (dbTypeForDriver === 'POSTGRES') {
         connectionConfig = createConnectionConfig(body) as PostgreSQLConnectionConfig;
    } else { // dbTypeForDriver === 'MYSQL'
         connectionConfig = createConnectionConfig(body) as MySQLConnectionConfig;
    }


    // Test the connection before saving to database
    const pool = await driver.connect(connectionConfig as any); // ยังต้องใช้ as any ชั่วคราว
    await driver.disconnect(pool);

    // If connection successful, save to database
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