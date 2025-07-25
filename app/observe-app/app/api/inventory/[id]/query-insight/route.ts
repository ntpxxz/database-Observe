import { NextRequest, NextResponse } from "next/server";
import { queryAppDb as queryStaticAppDb } from "@/lib/appDb";
import { getSQLConnectionByInventory } from "@/lib/connectionManager";
import mssqlDriver from "@/lib/drivers/mssqlDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";
import { ConnectionPool as MSSQLConnectionPool } from "mssql"; // Import actual MSSQL ConnectionPool
import { Pool as PgNativePool } from "pg"; // Import actual PostgreSQL Pool
import { Pool as MySQLNativePool } from "mysql2/promise"; // Import actual MySQL Pool from mysql2/promise

import {
  DriverMap,
  MSSQLPool,
  MySQLPool, 
  PostgreSQLPool, 
  BaseDriver,
  MSSQLConnectionConfig,
  MySQLConnectionConfig,
  PostgreSQLConnectionConfig,
  QueryAnalysis,
} from "@/types";

const drivers: DriverMap = {
  MSSQL: mssqlDriver,
  POSTGRES: postgresDriver,
  MYSQL: mysqlDriver,
};

function tagWithType(data: any[] | undefined, type: string): any[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({ ...item, type }));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  console.log("🚀 [QueryInsight API] Called with ID:", id);

  try {
    const result = await queryStaticAppDb(
      `SELECT * FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id },
    );

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { message: "Database not found" },
        { status: 404 },
      );
    }

    const db = result.recordset[0];
    const rawPool = await getSQLConnectionByInventory(db);
    // Removed DEBUG console logs from here

    if (!rawPool) {
      return NextResponse.json(
        { message: "Failed to connect to DB or unsupported type" },
        { status: 500 },
      );
    }

    console.log("🔗 Connection established");

    let rawInsights: QueryAnalysis;

    // rawPool เป็น AnyPool (อ็อบเจกต์ wrapper ที่มีคุณสมบัติ 'type' และ 'pool')
    switch (rawPool.type) {
      case "mssql": {
        // เปลี่ยน MSSQLPool เป็น MSSQLConnectionPool เพื่อให้ตรงกับประเภทของ (rawPool as MSSQLPool).pool
        const driver = drivers.MSSQL as unknown as BaseDriver<MSSQLConnectionConfig, MSSQLConnectionPool>;
        // ส่ง actual MSSQL pool ไปยัง driver
        rawInsights = await driver.getQueryAnalysis((rawPool as MSSQLPool).pool);
        break;
      }
      case "postgresql": {
        // เปลี่ยน PostgreSQLPool เป็น PgNativePool เพื่อให้ตรงกับประเภทของ (rawPool as PostgreSQLPool).pool
        const driver = drivers.POSTGRES as unknown as BaseDriver<PostgreSQLConnectionConfig, PgNativePool>;
        // ส่ง actual PostgreSQL pool ไปยัง driver
        rawInsights = await driver.getQueryAnalysis((rawPool as PostgreSQLPool).pool);
        break;
      }
      case "mysql": {
        // เปลี่ยน MySQLPool เป็น MySQLNativePool เพื่อให้ตรงกับประเภทของ (rawPool as MySQLPool).pool
        const driver = drivers.MYSQL as unknown as BaseDriver<MySQLConnectionConfig, MySQLNativePool>;
        // ส่ง actual MySQL pool ไปยัง driver
        rawInsights = await driver.getQueryAnalysis((rawPool as MySQLPool).pool);
        break;
      }
      default:
        return NextResponse.json(
          { message: "Unsupported or unknown database type" },
          { status: 400 },
        );
    }

    console.log("📦 Raw insights received");

    const finalInsights = {
      runningQueries: tagWithType(rawInsights.runningQueries, "running_query"),
      slowQueries: tagWithType(rawInsights.slowQueries, "slow_query"),
      blockingQueries: tagWithType(rawInsights.blockingQueries, "blocking_query"),
      waitStats: tagWithType(rawInsights.waitStats, "wait_stats"),
      deadlocks: tagWithType(rawInsights.deadlocks, "deadlock_event"),
      tempDbUsage: tagWithType(
        rawInsights.tempDbUsage || rawInsights.tempDbUsage,
        "high_tempdb_usage",
      ),
    };

    Object.entries(finalInsights).forEach(([key, items]) => {
      console.log(`📊 ${key}: ${items.length} item(s)`);
    });

    return NextResponse.json(finalInsights);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[QueryInsight] ❌ ID: ${id} -`, message);
    return NextResponse.json(
      {
        message: "Failed to load query insights",
        details: message,
      },
      { status: 500 },
    );
  }
}