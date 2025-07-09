import { NextRequest, NextResponse } from "next/server";
import {
  DatabaseInventory,
  Driver,
  AnyPool,
  Metrics,
  QueryAnalysis,
  OptimizationSuggestions,
} from "@/types";

import mssqlDriver from "@/lib/drivers/mssqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import { queryAppDb } from "@/lib/connectionManager";

const drivers: { [key: string]: Driver } = {
  MSSQL: mssqlDriver,
  POSTGRES: postgresDriver,
  MYSQL: mysqlDriver,
};

const VALID_ANALYSIS_LEVELS = ["basic", "detailed", "full"] as const;
type AnalysisLevel = (typeof VALID_ANALYSIS_LEVELS)[number];

/**
 * [REFACTORED] ฟังก์ชันหลักที่จัดการ Logic การดึงข้อมูลตาม analysisLevel
 */
async function processRequest(
  level: AnalysisLevel,
  driver: Driver,
  pool: AnyPool
): Promise<
  Partial<Metrics> | QueryAnalysis | (QueryAnalysis & OptimizationSuggestions)
> {
  switch (level) {
    case "full":
      if (driver.getQueryAnalysis && driver.getOptimizationSuggestions) {
        const [analysis, optimizations] = await Promise.all([
          driver.getQueryAnalysis(pool),
          driver.getOptimizationSuggestions(pool),
        ]);
        return { ...analysis, ...optimizations };
      }
      throw new Error(`'full' analysis is not implemented for this driver.`);

    case "detailed":
      if (driver.getQueryAnalysis) {
        return await driver.getQueryAnalysis(pool);
      }
      throw new Error(
        `'detailed' analysis is not implemented for this driver.`
      );

    case "basic":
    default:
      if (driver.getMetrics) {
        return await driver.getMetrics(pool);
      }
      throw new Error(`'basic' metrics are not implemented for this driver.`);
  }
}

/**
 * [FINAL VERSION] The primary API endpoint for fetching all server metrics.
 */
export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const startTime = Date.now();
  const { id } = context.params.id
    ? context.params
    : { id: request.nextUrl.searchParams.get("id") || "" };

  let targetPool: AnyPool | undefined;
  let driver: Driver | undefined;

  try {
    // --- 1. Validate Input ---
    const url = new URL(request.url);
    const levelParam = url.searchParams.get("level")?.toLowerCase() || "basic";
    if (!VALID_ANALYSIS_LEVELS.includes(levelParam as AnalysisLevel)) {
      return NextResponse.json(
        { error: `Invalid analysis level.` },
        { status: 400 }
      );
    }
    const analysisLevel = levelParam as AnalysisLevel;

    console.log(
      `[API Route] Processing request - ID: ${id}, Level: ${analysisLevel}`
    );

    // --- 2. Fetch Config & Select Driver ---
    const result = await queryAppDb(
      `SELECT 
                InventoryID as inventoryID, SystemName as systemName, ServerHost as serverHost, 
                Port as port, DatabaseType as databaseType, 
                ConnectionUsername as connectionUsername, CredentialReference as credentialReference
              FROM IT_ManagementDB.dbo.DatabaseInventory
              WHERE inventoryID = @id`,
      { id }
    );
    if (result.recordset.length === 0) {
      return NextResponse.json(
        { message: `Server config with ID '${id}' not found.` },
        { status: 404 }
      );
    }
    const raw = result.recordset[0];
    const serverConfig: DatabaseInventory = {
      ...raw,
      database: raw.database || "master",
      server: raw.serverHost,
      user: raw.connectionUsername,
      password: raw.credentialReference,
    };

    driver = drivers[serverConfig.databaseType.toUpperCase()];
    if (!driver) {
      return NextResponse.json(
        { message: `Unsupported DB type: ${serverConfig.databaseType}` },
        { status: 400 }
      );
    }

    // --- 3. Connect to Target Database ---
    targetPool = await driver.connect(serverConfig);
    console.log(`[API Route] Connection established for ID: ${id}`);

    // --- 4. Process Request ---
    const resultData = await processRequest(analysisLevel, driver, targetPool);

    const duration = Date.now() - startTime;
    console.log(
      `[API Route] Request completed successfully - ID: ${id}, Duration: ${duration}ms`
    );

    // --- 5. Return Success Response ---
    return NextResponse.json({
      ...resultData, // 👈 spread ทุก field เช่น performanceInsights, kpi, stats
      meta: {
        id,
        analysisLevel,
        duration,
        timestamp: new Date().toISOString(),
      },
      
    });
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(
      `[API Route] CRITICAL ERROR - ID: ${id}, Duration: ${duration}ms`,
      err
    );
    return NextResponse.json(
      {
        error: `Internal server error: ${err.message}`,
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  } finally {
    // --- 6. Cleanup ---
    if (targetPool && driver?.disconnect) {
      try {
        await driver.disconnect(targetPool);
        console.log(`[API Route] Disconnected successfully for ID: ${id}`);
      } catch (cleanupError) {
        console.error(
          `[API Route] Driver cleanup failed for ID: ${id}:`,
          cleanupError
        );
      }
    }
  }
}
