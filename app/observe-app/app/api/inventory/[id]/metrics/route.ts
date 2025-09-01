import { NextRequest, NextResponse } from "next/server";
import {
  DatabaseInventory,
  DriverMap,
  AnyPool,
  Metrics,
  QueryAnalysis,
  OptimizationSuggestions,
  BaseDriver,
} from "@/types";

import mssqlDriver from "@/lib/drivers/mssqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import { queryAppDb as queryAppStaticDb } from "@/lib/appDb";
import { unstable_noStore as noStore } from "next/cache";

// ===== Hard cache off for App Router =====
export const dynamic = "force-dynamic";
export const revalidate = 0;
// ถ้ารันบน Edge ให้เปิดบรรทัดนี้ด้วย
// export const runtime = "edge";

const drivers: DriverMap = {
  MSSQL: mssqlDriver,
  POSTGRES: postgresDriver,
  MYSQL: mysqlDriver,
};

const VALID_ANALYSIS_LEVELS = ["basic", "detailed", "full"] as const;
type AnalysisLevel = (typeof VALID_ANALYSIS_LEVELS)[number];

// --- Process by level (คง logic เดิม) ---
async function processRequest(
  level: AnalysisLevel,
  driver: BaseDriver<any, any>,
  pool: AnyPool
): Promise<Partial<Metrics> | QueryAnalysis | (QueryAnalysis & OptimizationSuggestions)> {
  console.log(`[ProcessRequest] Starting ${level} analysis`);

  switch (level) {
    case "full":
      if (driver.getQueryAnalysis && driver.getOptimizationSuggestions) {
        console.log("[ProcessRequest] Executing full analysis...");
        const [analysis, optimizations] = await Promise.all([
          driver.getQueryAnalysis(pool),
          driver.getOptimizationSuggestions(pool),
        ]);
        console.log("[ProcessRequest] Full analysis completed");
        return { ...analysis, ...optimizations };
      }
      throw new Error(`'full' analysis is not implemented for this driver.`);

    case "detailed":
      if (driver.getQueryAnalysis) {
        console.log("[ProcessRequest] Executing detailed analysis...");
        const result = await driver.getQueryAnalysis(pool);
        console.log("[ProcessRequest] Detailed analysis completed");
        return result;
      }
      throw new Error(`'detailed' analysis is not implemented for this driver.`);

    case "basic":
    default:
      if (driver.getMetrics) {
        console.log("[ProcessRequest] Executing basic metrics...");
        const result = await driver.getMetrics(pool);
        console.log("[ProcessRequest] Basic metrics completed:", {
          hasKpi: !!result.kpi,
          hasStats: !!result.stats,
          hasInsights: !!result.performanceInsights,
          kpiKeys: result.kpi ? Object.keys(result.kpi) : [],
          statsKeys: result.stats ? Object.keys(result.stats) : [],
        });
        return result;
      }
      throw new Error(`'basic' metrics are not implemented for this driver.`);
  }
}

/**
 * Primary API endpoint for fetching server metrics.
 * Path example: /api/inventory/[id]/metrics?level=basic|detailed|full
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> } // ✅ Fixed: params is a Promise in App Router
) {
  noStore(); // ✅ Disable route/segment caching
  const startTime = Date.now();

  try {
    // ✅ Await the params Promise
    const { id: paramId } = await context.params;
    const id = paramId || request.nextUrl.searchParams.get("id") || "";

    if (!id) {
      return NextResponse.json(
        { error: "Missing inventory ID." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    let targetPool: AnyPool | undefined;
    let driver: BaseDriver<any, any> | undefined;

    try {
      // Parse level (default basic)
      const url = new URL(request.url);
      const levelParam = (url.searchParams.get("level") || "basic").toLowerCase();
      if (!VALID_ANALYSIS_LEVELS.includes(levelParam as AnalysisLevel)) {
        return NextResponse.json(
          { error: `Invalid analysis level. Valid levels: ${VALID_ANALYSIS_LEVELS.join(", ")}` },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
      const analysisLevel = levelParam as AnalysisLevel;

      console.log(`[API Route] Processing request - ID: ${id}, Level: ${analysisLevel}`);

      // 1) Load server config
      const result = await queryAppStaticDb(
        `SELECT 
           InventoryID as inventoryID, SystemName as systemName, ServerHost as serverHost, 
           Port as port, DatabaseType as databaseType, 
           ConnectionUsername as connectionUsername, CredentialReference as credentialReference
         FROM IT_ManagementDB.dbo.DatabaseInventory
         WHERE inventoryID = @id`,
        { id }
      );

      if (!result.recordset?.length) {
        console.log(`[API Route] Server config not found for ID: ${id}`);
        return NextResponse.json(
          { message: `Server config with ID '${id}' not found.` },
          { status: 404, headers: { "Cache-Control": "no-store" } }
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

      console.log(`[API Route] Server config loaded:`, {
        inventoryID: serverConfig.inventoryID,
        systemName: serverConfig.systemName,
        serverHost: serverConfig.serverHost,
        port: serverConfig.port,
        databaseType: serverConfig.databaseType,
      });

      const dbType = serverConfig.databaseType.toUpperCase() as keyof DriverMap;
      driver = drivers[dbType];

      if (!driver) {
        console.log(`[API Route] Unsupported database type: ${serverConfig.databaseType}`);
        return NextResponse.json(
          { message: `Unsupported DB type: ${serverConfig.databaseType}` },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }

      // 2) Connect to target DB
      console.log(`[API Route] Attempting connection for ${dbType}...`);
      targetPool = await driver.connect(serverConfig);
      console.log(`[API Route] Connection established for ID: ${id}`);

      // 3) Process request by level
      if (!targetPool) {
        throw new Error('Connection pool is not initialized');
      }
      const resultData = await processRequest(analysisLevel, driver, targetPool);
      const duration = Date.now() - startTime;

      // 4) Build response (ensure changing timestamp)
      const response = {
        ...resultData,
        meta: {
          id,
          analysisLevel,
          duration,
          timestamp: new Date().toISOString(), // ✅ changes every call
          serverInfo: {
            systemName: serverConfig.systemName,
            serverHost: serverConfig.serverHost,
            databaseType: serverConfig.databaseType,
            port: serverConfig.port,
          },
        },
      };

      console.log("[API Route] Response structure:", {
        hasKpi: !!(response as any).kpi,
        hasStats: !!(response as any).stats,
        hasInsights: !!(response as any).performanceInsights,
        hasMeta: !!response.meta,
        responseKeys: Object.keys(response),
      });

      return NextResponse.json(response, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const duration = Date.now() - startTime;

      console.error(`[API Route] ERROR - ID: ${id}, Duration: ${duration}ms`, {
        message,
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });

      return NextResponse.json(
        {
          error: "Internal server error",
          details: message,
          meta: {
            id,
            duration,
            timestamp: new Date().toISOString(),
            success: false,
          },
          // Fallback empty data to avoid client-side crashes
          kpi: { connections: 0, cpu: undefined, memory: undefined, disk: undefined },
          stats: {},
          performanceInsights: [
            {
              id: "api_error",
              type: "error",
              severity: "critical",
              title: "API Error",
              message: `Failed to fetch metrics: ${message}`,
              query: "",
              timestamp: new Date().toISOString(),
              details: { error: message },
            },
          ],
        },
        { status: 500, headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } }
      );
    } finally {
      // 5) Cleanup
      if (targetPool && driver?.disconnect) {
        try {
          await driver.disconnect(targetPool);
          console.log(`[API Route] Disconnected successfully for ID: ${id}`);
        } catch (cleanupError) {
          console.error(`[API Route] Driver cleanup failed for ID: ${id}:`, cleanupError);
        }
      }
    }
  } catch (paramsError) {
    // Handle params parsing error
    return NextResponse.json(
      { error: "Failed to parse request parameters" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}