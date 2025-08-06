import { NextRequest, NextResponse } from "next/server";
import { queryAppDb as queryStaticAppDb } from "@/lib/appDb";
import { getSQLConnectionByInventory } from "@/lib/connectionManager";
import mssqlDriver from "@/lib/drivers/mssqlDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";

import {
  DriverMap,
  
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

    if (!rawPool) {
      return NextResponse.json(
        { message: "Failed to connect to DB or unsupported type" },
        { status: 500 },
      );
    }

    console.log("🔗 Connection established");

    let rawInsights: QueryAnalysis;

    // rawPool เป็น AnyPool (wrapper object ที่มี type และ pool)
    // ส่ง rawPool ทั้งก้อนไปให้ driver โดยตรง
    switch (rawPool.type) {
      case "mssql": {
        const driver = drivers.MSSQL;
        // ส่ง AnyPool wrapper ไปให้ driver (ไม่ใช่ native pool)
        rawInsights = await driver.getQueryAnalysis(rawPool);
        break;
      }
      case "postgresql": {
        const driver = drivers.POSTGRES;
        // ส่ง AnyPool wrapper ไปให้ driver (ไม่ใช่ native pool)
        rawInsights = await driver.getQueryAnalysis(rawPool);
        break;
      }
      case "mysql": {
        const driver = drivers.MYSQL;
        // ส่ง AnyPool wrapper ไปให้ driver (ไม่ใช่ native pool)
        rawInsights = await driver.getQueryAnalysis(rawPool);
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