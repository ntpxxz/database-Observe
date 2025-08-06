import { NextRequest, NextResponse } from "next/server";
import {
  DatabaseInventory,
  DriverMap,
  AnyPool,
  Metrics,
  QueryAnalysis,
  OptimizationSuggestions,
  BaseDriver
} from "@/types";

import mssqlDriver from "@/lib/drivers/mssqlDriver";
import postgresDriver from "@/lib/drivers/postgresDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import { queryAppDb as queryAppStaticDb } from "@/lib/appDb";

const drivers: DriverMap = {
  MSSQL: mssqlDriver,
  POSTGRES: postgresDriver,
  MYSQL: mysqlDriver,
};

const VALID_ANALYSIS_LEVELS = ["basic", "detailed", "full"] as const;
type AnalysisLevel = (typeof VALID_ANALYSIS_LEVELS)[number];

// --- 3. ประมวลผล Metrics ตาม Level ที่เลือก ---
async function processRequest(
  level: AnalysisLevel,
  driver: BaseDriver<any, any>, 
  pool: AnyPool,
): Promise<
  Partial<Metrics> | QueryAnalysis | (QueryAnalysis & OptimizationSuggestions)
> {
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
      throw new Error(
        `'detailed' analysis is not implemented for this driver.`,
      );

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
          statsKeys: result.stats ? Object.keys(result.stats) : []
        });
        return result;
      }
      throw new Error(`'basic' metrics are not implemented for this driver.`);
  }
}

/**
 * [FIXED VERSION] The primary API endpoint for fetching all server metrics.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const startTime = Date.now();
  const params = await context.params;
  const { id } = params || { id: request.nextUrl.searchParams.get("id") || "" };

  let targetPool: AnyPool | undefined;
  let driver: BaseDriver<any, any> | undefined;

  try {
    // --- 1. Validate Input ---
    const url = new URL(request.url);
    const levelParam = url.searchParams.get("level")?.toLowerCase() || "basic";
    if (!VALID_ANALYSIS_LEVELS.includes(levelParam as AnalysisLevel)) {
      return NextResponse.json(
        { error: `Invalid analysis level. Valid levels are: ${VALID_ANALYSIS_LEVELS.join(', ')}` },
        { status: 400 },
      );
    }
    const analysisLevel = levelParam as AnalysisLevel;

    console.log(
      `[API Route] Processing request - ID: ${id}, Level: ${analysisLevel}`,
    );

    // --- 2. Fetch Config & Select Driver ---
    const result = await queryAppStaticDb(
      `SELECT 
                InventoryID as inventoryID, SystemName as systemName, ServerHost as serverHost, 
                Port as port, DatabaseType as databaseType, 
                ConnectionUsername as connectionUsername, CredentialReference as credentialReference
              FROM IT_ManagementDB.dbo.DatabaseInventory
              WHERE inventoryID = @id`,
      { id },
    );
    
    if (result.recordset.length === 0) {
      console.log(`[API Route] Server config not found for ID: ${id}`);
      return NextResponse.json(
        { message: `Server config with ID '${id}' not found.` },
        { status: 404 },
      );
    }
    
    const raw = result.recordset[0];
    const serverConfig: DatabaseInventory = {
      ...raw,
      database: raw.database || raw.database || "master",
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
        { status: 400 },
      );
    }

    // --- 3. Connect to Target Database ---
    console.log(`[API Route] Attempting connection for ${dbType}...`);
    targetPool = await driver.connect(serverConfig);
    console.log(`[API Route] Connection established for ID: ${id}`);

    // --- 4. Process Request ---
    if (!targetPool) {
      return NextResponse.json(
        { error: "Connection pool could not be established." },
        { status: 500 }
      );
    }
    
    const resultData = await processRequest(analysisLevel, driver, targetPool);
    const duration = Date.now() - startTime;

    console.log(
      `[API Route] Request completed successfully - ID: ${id}, Duration: ${duration}ms`,
    );

    // --- 5. Ensure proper response structure ---
    const response = {
      // Spread all result data first
      ...resultData,
      // Add metadata
      meta: {
        id,
        analysisLevel,
        duration,
        timestamp: new Date().toISOString(),
        serverInfo: {
          systemName: serverConfig.systemName,
          serverHost: serverConfig.serverHost,
          databaseType: serverConfig.databaseType,
          port: serverConfig.port
        }
      },
    };

    console.log("[API Route] Response structure:", {
      hasKpi: !!(response as any).kpi,
      hasStats: !!(response as any).stats,
      hasInsights: !!(response as any).performanceInsights,
      hasMeta: !!response.meta,
      responseKeys: Object.keys(response)
    });

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const duration = Date.now() - startTime;
    
    console.error(
      `[API Route] ERROR - ID: ${id}, Duration: ${duration}ms`,
      {
        message,
        stack: error instanceof Error ? error.stack : undefined,
        error
      }
    );

    // Return structured error response
    return NextResponse.json(
      {
        error: "Internal server error", 
        details: message,
        meta: {
          id,
          duration,
          timestamp: new Date().toISOString(),
          success: false
        },
        // Provide fallback empty data structure
        kpi: {
          connections: 0,
          cpu: undefined,
          memory: undefined,
          disk: undefined
        },
        stats: {},
        performanceInsights: [{
          id: 'api_error',
          type: 'error',
          severity: 'critical',
          title: 'API Error',
          message: `Failed to fetch metrics: ${message}`,
          query: '',
          timestamp: new Date().toISOString(),
          details: { error: message }
        }]
      },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      },     
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
          cleanupError,
        );
      }
    }
  }
}