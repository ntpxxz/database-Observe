import { NextRequest, NextResponse } from "next/server";
import {
  DriverMap,
  AnyPool,
  BaseDriver,
  DatabaseInventory,
} from "@/types";
import { queryAppDb } from "@/lib/appDb";
import mssqlDriver from "@/lib/drivers/mssqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import { isReadOnlySQL } from "@/lib/utils";

const drivers: DriverMap = {
  MSSQL: mssqlDriver,
  POSTGRES: postgresDriver,
  MYSQL: mysqlDriver,
};

export async function POST(req: NextRequest) {
  let targetPool: AnyPool | undefined;
  let driver: BaseDriver<any, any> | undefined;
  let inventoryId: string | undefined; // Declare at function scope for error handling

  try {
    const requestBody = await req.json();
    const { inventoryId: parsedInventoryId, query } = requestBody;
    inventoryId = parsedInventoryId; // Store for error handling

    // ✅ Validate input
    if (!query || !inventoryId) {
      return NextResponse.json(
        { message: "Missing query or inventoryId" },
        { status: 400 },
      );
    }

    // ✅ Check if query is read-only BEFORE executing
    if (!isReadOnlySQL(query)) {
      return NextResponse.json(
        { message: "Only read-only queries are allowed." },
        { status: 403 },
      );
    }

    // ✅ Get database config from inventory
    const result = await queryAppDb(
      `SELECT 
        InventoryID as inventoryID, 
        SystemName as systemName, 
        ServerHost as serverHost, 
        Port as port, 
        DatabaseType as databaseType, 
        ConnectionUsername as connectionUsername, 
        CredentialReference as credentialReference,
        DatabaseName as databaseName
      FROM IT_ManagementDB.dbo.DatabaseInventory 
      WHERE InventoryID = @id`,
      { id: inventoryId },
    );

    if (!result.recordset.length) {
      return NextResponse.json(
        { message: "Invalid inventoryId" },
        { status: 404 },
      );
    }

    const raw = result.recordset[0];
    const dbConfig: DatabaseInventory = {
      ...raw,
      database: raw.databaseName || raw.database || "master",
      server: raw.serverHost,
      user: raw.connectionUsername,
      password: raw.credentialReference,
      zone: raw.zone || "default",
      ownerContact: raw.ownerContact || "unknown",
      status: raw.status || "Active",
    };

    // ✅ Select appropriate driver
    const dbType = dbConfig.databaseType.toUpperCase() as keyof DriverMap;
    driver = drivers[dbType];

    if (!driver) {
      return NextResponse.json(
        { message: `Unsupported database type: ${dbConfig.databaseType}` },
        { status: 400 },
      );
    }

    // ✅ Connect to target database
    targetPool = await driver.connect(dbConfig);
    console.log(`[Manual Query] Connected to ${dbType} - ID: ${inventoryId}`);

    // ✅ Execute query using the driver
    let response: unknown[];

    if (dbType === 'MSSQL' && targetPool?.type === 'mssql') {
      // For MSSQL, use the native pool directly
      response = await mssqlDriver.executeQuery(targetPool.pool, query);
    } else {
      // For other database types, implement executeQuery method
      if (!driver.executeQuery) {
        return NextResponse.json(
          { message: `Manual query execution not supported for ${dbType}` },
          { status: 501 },
        );
      }
      // Note: You'll need to implement executeQuery for PostgreSQL and MySQL drivers
      response = await driver.executeQuery(targetPool as any, query);
    }

    console.log("✅ Manual query succeeded:", {
      inventoryId,
      dbType,
      rowCount: Array.isArray(response) ? response.length : 'N/A'
    });

    return NextResponse.json({ 
      result: response,
      meta: {
        inventoryId,
        dbType,
        rowCount: Array.isArray(response) ? response.length : null,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Manual Query Error]", {
      inventoryId, // Now using the parsed inventoryId variable
      error: message,
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { 
        error: "Failed to execute query",
        details: message
      }, 
      { status: 500 }
    );

  } finally {
    // ✅ Cleanup connection
    if (targetPool && driver?.disconnect) {
      try {
        await driver.disconnect(targetPool);
        console.log(`[Manual Query] Disconnected successfully`);
      } catch (cleanupError) {
        console.error("[Manual Query] Cleanup failed:", cleanupError);
      }
    }
  }
}