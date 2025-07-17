import { NextRequest, NextResponse } from "next/server";
import { queryAppDb as queryStaticAppDb } from "@/lib/appDb";
import { getSQLConnectionByInventory } from "@/lib/connectionManager";
import mssqlDriver from "@/lib/drivers/mssqlDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";
import { Driver } from "@/types";

// Supported drivers map
const drivers: Record<string, Driver> = {
  MSSQL: mssqlDriver,
  MYSQL: mysqlDriver,
  POSTGRES: postgresDriver,
};

// Helper: Add type to each query record
function tagWithType(data: any[] | undefined, type: string): any[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({ ...item, type }));
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  console.log("🚀 [QueryInsight API] Called with ID:", id);

  try {
    // 1. Lookup database config by inventory ID
    const result = await queryStaticAppDb(
      `SELECT * FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id }
    );

    if (result.recordset.length === 0) {
      console.warn("❌ No database found for ID:", id);
      return NextResponse.json({ message: "Database not found" }, { status: 404 });
    }

    const db = result.recordset[0];
    const dbType = (db.databaseType || "").toUpperCase();
    const driver = drivers[dbType];

    console.log("🗄️ DB Config:", db);
    console.log("🔧 DB Type:", dbType, "| Driver found:", !!driver);

    if (!driver || !driver.getQueryAnalysis) {
      return NextResponse.json({
        message: `Driver not supported or getQueryAnalysis not implemented for: ${dbType}`,
      }, { status: 400 });
    }

    // 2. Connect and analyze
    const pool = await getSQLConnectionByInventory(db);
    console.log("🔗 Connection established");

    const rawInsights = await driver.getQueryAnalysis(pool);
    console.log("📦 Raw insights received");

    // 3. Add `type` to each category
    const finalInsights = {
      runningQueries: tagWithType(rawInsights.runningQueries, "running_query"),
      slowQueries: tagWithType(rawInsights.slowQueries, "slow_query"),
      blockingQueries: tagWithType(rawInsights.blockingQueries, "blocking_query"),
      waitStats: tagWithType(rawInsights.waitStats, "wait_stats"),
      deadlocks: tagWithType(rawInsights.deadlocks, "deadlock_event"),
      tempDbUsage: tagWithType(
        rawInsights.tempDbUsage || rawInsights.tempdbUsage,
        "high_tempdb_usage"
      ),
    };

    // 4. Summary log
    Object.entries(finalInsights).forEach(([key, items]) => {
      console.log(`📊 ${key}: ${items.length} item(s)`);
    });

    // 5. Send result to frontend
    return NextResponse.json(finalInsights);
  } catch (error: unknown) {
    console.error("❌ Error in /query-insight route:", error.message);
    return NextResponse.json(
      { message: "Failed to load query insights", error: error.message },
      { status: 500 }
    );
  }
}
