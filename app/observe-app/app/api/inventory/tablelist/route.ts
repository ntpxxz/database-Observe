// app/api/inventory/tablelist/route.ts
import {
  queryAppDb as queryAppStaticDb,
  queryDatabaseDirect,
} from "@/lib/appDb";
import { SQL_QUERIES } from "@/lib/sqlQueries"; // นำเข้า SQL_QUERIES
import { NextResponse, NextRequest } from "next/server";

type TableInfo = {
  name: string;
  rows?: number;
  columns?: number;
  type?: "table" | "view";
};

type Relation = {
  id: string;
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
};

// ป้องกัน SQL injection แบบง่าย
const escapeString = (str: string): string => {
  return str.replace(/'/g, "''");
};

export async function GET(request: NextRequest) {
  const inventoryId = request.nextUrl.searchParams.get("id")?.toString().trim();
  const dbName = request.nextUrl.searchParams.get("db")?.toString().trim();
  const includeRelations =
    (
      request.nextUrl.searchParams.get("include_relations") || "false"
    ).toLowerCase() === "true";

  console.log("API Request:", { inventoryId, dbName, includeRelations });

  if (!inventoryId || !dbName) {
    return NextResponse.json(
      { error: "Missing inventoryId or db parameter" },
      { status: 400 }
    );
  }

  try {
    // 1) ตรวจสอบว่า inventory ID มีจริง
    const inventoryCheck = await queryAppStaticDb(
      `SELECT inventoryID FROM DatabaseInventory WHERE inventoryID = @inventoryId`,
      { inventoryId }
    );

    if (!inventoryCheck?.recordset?.length) {
      return NextResponse.json(
        { error: "Inventory not found" },
        { status: 404 }
      );
    }

    // 2) ดึง config - ใช้ try-catch เพื่อจัดการ missing columns
    let invCfgResult;
    try {
      // ลองดึงทุก columns ที่อาจมี
      invCfgResult = await queryAppStaticDb(
        `SELECT serverHost, port, connectionUsername, credentialReference,
                dbType, databaseType
         FROM DatabaseInventory
         WHERE inventoryID = @inventoryId`,
        { inventoryId }
      );
    } catch (error: any) {
      if (error.message?.includes("Invalid column name")) {
        console.log("Some columns don't exist, trying basic query...");
        // ถ้า columns ไม่มี ให้ใช้แค่ basic fields
        invCfgResult = await queryAppStaticDb(
          `SELECT serverHost, port, connectionUsername, credentialReference
           FROM DatabaseInventory
           WHERE inventoryID = @inventoryId`,
          { inventoryId }
        );
      } else {
        throw error;
      }
    }

    if (!invCfgResult?.recordset?.length) {
      return NextResponse.json(
        { error: "Inventory configuration not found" },
        { status: 404 }
      );
    }

    const invCfgRaw = invCfgResult.recordset[0];

    // จัดการ database type - ตรวจสอบว่ามี fields หรือไม่
    let dbType = "MSSQL"; // default

    if ("dbType" in invCfgRaw && invCfgRaw.dbType) {
      dbType = String(invCfgRaw.dbType).toUpperCase().trim();
    } else if ("databaseType" in invCfgRaw && invCfgRaw.databaseType) {
      dbType = String(invCfgRaw.databaseType).toUpperCase().trim();
    }

    console.log(
      `Using Database Type: ${dbType} for inventory ${inventoryId} (database: ${dbName})`
    );

    const dbConfig = { ...invCfgRaw, databaseName: dbName, dbType };

    console.log(`Database Type: ${dbType}, Database: ${dbName}`);

    let tables: TableInfo[] = [];
    let relations: Relation[] = [];

    // 3) Query ตามชนิดฐานข้อมูล
    if (dbType === "MSSQL") {
      // ========== MSSQL ==========
      try {
        // Tables Query - ปรับจาก SQL_QUERIES.MSSQL.listTables
        const tablesQuery = `
          USE [${escapeString(dbName)}];
          ${SQL_QUERIES.MSSQL.listTables}
        `;

        console.log("Executing MSSQL Tables Query");
        const tablesResult = await queryDatabaseDirect(dbConfig, tablesQuery);
        // route.ts (เฉพาะส่วน map ตารางใน MSSQL)
        tables = (tablesResult?.recordset || []).map((row: any) => ({
          name: row.name,
          columns: Number(row.columns ?? row.column_count ?? 0), // รองรับทั้งสองชื่อ
          rows: Number(row.rows ?? row.row_count ?? 0), // ใช้ row_count ถ้าไม่มี rows
          type:
            String(row.table_type || "").toLowerCase() === "view"
              ? "view"
              : "table",
        }));

        console.log(`Found ${tables.length} tables`);
        // Relations Query
        if (includeRelations) {
          try {
            const relationsQuery = `
              USE [${escapeString(dbName)}];
              ${SQL_QUERIES.MSSQL.listRelations}
            `;

            console.log("Executing MSSQL Relations Query");
            const relationsResult = await queryDatabaseDirect(
              dbConfig,
              relationsQuery
            );

            relations = (relationsResult?.recordset || []).map((row: any) => ({
              id: row.constraint_name || `${row.from_table}_to_${row.to_table}`,
              fromTable: row.from_table,
              toTable: row.to_table,
              fromColumn: row.from_column,
              toColumn: row.to_column,
              type: "one-to-many" as const,
            }));

            console.log(`Found ${relations.length} relations`);
          } catch (relationError) {
            console.warn("Relations query failed:", relationError);
            relations = [];
          }
        }
      } catch (error) {
        console.error("MSSQL query error:", error);
        throw error;
      }
    } else if (dbType === "POSTGRES" || dbType === "POSTGRESQL") {
      // ========== PostgreSQL ==========
      try {
        // Tables Query
        console.log("Executing PostgreSQL Tables Query");
        const tablesResult = await queryDatabaseDirect(
          dbConfig,
          SQL_QUERIES.POSTGRES.listTables
        );

        // PostgreSQL อาจคืนเป็น array ธรรมดาหรือ recordset
        const tablesPg = tablesResult?.recordset || tablesResult || [];
        tables = tablesPg.map((row: any) => ({
          name: row.name,
          columns: Number(row.columns ?? row.column_count ?? 0),
          rows: Number(row.rows ?? row.row_count ?? 0),
          type:
            String(row.table_type || "").toLowerCase() === "view"
              ? "view"
              : "table",
        }));

        console.log(`Found ${tables.length} tables`);

        // Relations Query
        if (includeRelations) {
          try {
            console.log("Executing PostgreSQL Relations Query");
            const relationsResult = await queryDatabaseDirect(
              dbConfig,
              SQL_QUERIES.POSTGRES.listRelations
            );

            const relationsData =
              relationsResult?.recordset || relationsResult || [];
            relations = relationsData.map((row: any) => ({
              id: `${row.from_table}_to_${row.to_table}`,
              fromTable: row.from_table,
              toTable: row.to_table,
              fromColumn: row.from_column,
              toColumn: row.to_column,
              type: "one-to-many" as const,
            }));

            console.log(`Found ${relations.length} relations`);
          } catch (relationError) {
            console.warn("PostgreSQL relations query failed:", relationError);
            relations = [];
          }
        }
      } catch (error) {
        console.error("PostgreSQL query error:", error);
        throw error;
      }
    } else if (dbType === "MYSQL") {
      // ========== MySQL ==========
      try {
        // Tables Query - ต้องแทนที่ ? parameter ด้วยชื่อ database
        const tablesQuery = SQL_QUERIES.MYSQL.listTables.replace(
          "?",
          `'${escapeString(dbName)}'`
        );

        console.log("Executing MySQL Tables Query");
        const tablesResult = await queryDatabaseDirect(dbConfig, tablesQuery);

        const tablesMy = tablesResult?.recordset || tablesResult || [];
        tables = tablesMy.map((row: any) => ({
          name: row.name,
          columns: Number(row.columns ?? row.column_count ?? 0),
          rows: Number(row.rows ?? row.row_count ?? 0),
          type:
            String(row.table_type || "").toLowerCase() === "view"
              ? "view"
              : "table",
        }));

        console.log(`Found ${tables.length} tables`);

        // Relations Query
        if (includeRelations) {
          try {
            // MySQL relations query อาจต้องเพิ่ม WHERE clause สำหรับ database
            const relationsQuery = `
              ${SQL_QUERIES.MYSQL.listRelations}
              AND TABLE_SCHEMA = '${escapeString(dbName)}'
            `;

            console.log("Executing MySQL Relations Query");
            const relationsResult = await queryDatabaseDirect(
              dbConfig,
              relationsQuery
            );

            const relationsData =
              relationsResult?.recordset || relationsResult || [];
            relations = relationsData.map((row: any) => ({
              id: `${row.from_table}_to_${row.to_table}`,
              fromTable: row.from_table,
              toTable: row.to_table,
              fromColumn: row.from_column,
              toColumn: row.to_column,
              type: "one-to-many" as const,
            }));

            console.log(`Found ${relations.length} relations`);
          } catch (relationError) {
            console.warn("MySQL relations query failed:", relationError);
            relations = [];
          }
        }
      } catch (error) {
        console.error("MySQL query error:", error);
        throw error;
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported database type: ${dbType}` },
        { status: 400 }
      );
    }

    // 4) Return results
    const response = {
      tables,
      relations: includeRelations ? relations : undefined,
      database: dbName,
      count: tables.length,
      dbType,
    };

    console.log("API Response Summary:", {
      tablesCount: tables.length,
      relationsCount: relations.length,
      dbType,
      database: dbName,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("API Error:", error);
    const errorMessage = error?.message || String(error) || "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to fetch table list",
        details: errorMessage,
        database: dbName,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
