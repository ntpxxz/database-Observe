// Enhanced Metrics Route with comprehensive query analysis
import { NextResponse } from "next/server";
import { queryAppDb } from "@/lib/db";
import { Driver, DatabaseInventory, AnyPool, Metrics } from "@/types";
import postgresDriver from "@/lib/drivers/postgresDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import mssqlDriver from "@/lib/drivers/mssqlDriver";
import { parseNodeExporterMetrics } from "@/lib/metricParser";
import fetch from "node-fetch";

const drivers: { [key: string]: Driver } = {
  POSTGRES: postgresDriver,
  MYSQL: mysqlDriver,
  MSSQL: mssqlDriver,
};

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const url = new URL(request.url);
  const analysisLevel = url.searchParams.get('level') || 'basic'; // basic, detailed, full
  
  let targetPool: AnyPool | undefined;
  let driver: Driver | undefined;

  console.log(`[Enhanced Metrics API] Request for ID: ${id}, Level: ${analysisLevel}`);

  try {
    const result = await queryAppDb(
      `SELECT 
        InventoryID as inventoryID,
        SystemName as systemName,
        ServerHost as serverHost,
        Port as port,                       
        DatabaseName as databaseName,
        Zone as zone,
        DatabaseType as databaseType,
        ConnectionUsername as connectionUsername,
        CredentialReference as credentialReference,
        PurposeNotes as purposeNotes,
        OwnerContact as ownerContact,
        CreatedDate as createdDate 
      FROM IT_ManagementDB.dbo.databaseInventory
      WHERE inventoryID = @id`,
      { id }
    );

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { message: `Server config with ID '${id}' not found.` },
        { status: 404 }
      );
    }

    const serverConfig: DatabaseInventory = result.recordset[0];
    const upperCaseDbType = serverConfig.databaseType.toUpperCase();
    driver = drivers[upperCaseDbType];

    if (!driver) {
      return NextResponse.json(
        { message: `Unsupported DB type: ${serverConfig.databaseType}` },
        { status: 400 }
      );
    }

    const connectionConfig = {
      user: serverConfig.connectionUsername,
      password: serverConfig.credentialReference,
      database: serverConfig.databaseName,
      port: serverConfig.port,
      host: serverConfig.serverHost,
      server: serverConfig.serverHost,
      connectionTimeout: 5000,
    };

    // Connect to target database
    targetPool = await driver.connect(connectionConfig);
    console.log(`[Enhanced Metrics API] Connected to ${upperCaseDbType} database`);

    // Prepare promises based on analysis level
    const promises: Promise<any>[] = [];
    
    // Basic metrics (always included)
    promises.push(driver.getMetrics(targetPool));
    
    // Hardware metrics (always included)
    promises.push(
      fetch(`http://${serverConfig.serverHost}:${process.env.NODE_EXPORTER_PORT || 9100}/metrics`, { timeout: 5000 })
        .then(res => res.ok ? res.text() : Promise.reject(`Agent not reachable (status: ${res.status})`))
        .then(text => parseNodeExporterMetrics(text))
        .catch(err => {
          console.warn(`[Enhanced Metrics API] Agent fetch failed:`, err.message);
          return { error: true, message: err.message };
        })
    );

    // Detailed analysis (if requested)
    if (analysisLevel === 'detailed' || analysisLevel === 'full') {
      if (driver.getQueryAnalysis) {
        promises.push(driver.getQueryAnalysis(targetPool));
      }
    }

    // Full analysis (if requested)
    if (analysisLevel === 'full') {
      if (driver.getOptimizationSuggestions) {
        promises.push(driver.getOptimizationSuggestions(targetPool));
      }
      // เพิ่ม detailed performance analysis ถ้า driver รองรับ
      if (driver.getDetailedPerformanceAnalysis) {
        promises.push(driver.getDetailedPerformanceAnalysis(targetPool));
      }
    }

    const results = await Promise.all(promises);
    
    const [dbMetrics, hardwareMetrics, queryAnalysis, optimizationSuggestions, detailedAnalysis] = results;

    // สร้าง response object ตาม analysis level
    const baseMetrics: Metrics = {
      kpi: {
        cpu: "error" in hardwareMetrics ? undefined : hardwareMetrics.cpu,
        memory: "error" in hardwareMetrics ? undefined : hardwareMetrics.memory,
        ...dbMetrics.kpi,
      },
      stats: {
        ...dbMetrics.stats,
        analysisLevel: analysisLevel,
        timestamp: new Date().toISOString()
      },
      performanceInsights: dbMetrics.performanceInsights || [],
      hardwareError: "error" in hardwareMetrics ? hardwareMetrics.message : null,
    };

    // เพิ่มข้อมูลตาม analysis level
    if (analysisLevel === 'detailed' || analysisLevel === 'full') {
      if (queryAnalysis) {
        baseMetrics.queryAnalysis = queryAnalysis;
        
        // เพิ่ม summary statistics
        baseMetrics.stats.detailedStats = {
          totalRunningQueries: queryAnalysis.runningQueries?.length || 0,
          totalSlowQueries: queryAnalysis.slowQueries?.length || 0,
          totalBlockingQueries: queryAnalysis.blockingQueries?.length || 0,
          totalSystemBottlenecks: queryAnalysis.systemBottlenecks?.length || 0,
          criticalIssues: [
            ...(queryAnalysis.runningQueries?.filter(q => q.total_elapsed_time > 60000) || []).map(q => ({
              type: 'critical_long_running',
              sessionId: q.session_id,
              elapsedSeconds: Math.round(q.total_elapsed_time / 1000)
            })),
            ...(queryAnalysis.blockingQueries?.filter(q => q.wait_duration_ms > 30000) || []).map(q => ({
              type: 'critical_blocking',
              blockingChain: q.blocking_chain,
              waitSeconds: Math.round(q.wait_duration_ms / 1000)
            }))
          ]
        };
      }
    }

    if (analysisLevel === 'full') {
      if (optimizationSuggestions) {
        baseMetrics.optimizationSuggestions = optimizationSuggestions;
        
        // เพิ่ม optimization summary
        baseMetrics.stats.optimizationSummary = {
          potentialSpaceSavingMB: optimizationSuggestions.unusedIndexes?.reduce((sum, idx) => sum + (idx.size_mb || 0), 0) || 0,
          criticalFragmentedIndexes: optimizationSuggestions.fragmentedIndexes?.filter(idx => idx.avg_fragmentation_in_percent > 30).length || 0,
          highImpactMissingIndexes: optimizationSuggestions.missingIndexes?.filter(idx => idx.improvement_measure > 1000).length || 0
        };
      }

      if (detailedAnalysis) {
        baseMetrics.detailedAnalysis = detailedAnalysis;
        
        // เพิ่ม system health indicators
        baseMetrics.stats.systemHealth = {
          connectionEfficiency: detailedAnalysis.connectionAnalysis?.idleConnections ? 
            Math.round((1 - detailedAnalysis.connectionAnalysis.idleConnections / detailedAnalysis.connectionAnalysis.totalConnections) * 100) : 100,
          recommendationCount: detailedAnalysis.recommendations?.length || 0,
          criticalRecommendations: detailedAnalysis.recommendations?.filter(r => r.type.includes('memory') || r.type.includes('critical')).length || 0
        };
      }
    }

    // Get comprehensive analysis
    if (driver.analyzeDatabaseHealth) {
      try {
        const analysis = await driver.analyzeDatabaseHealth(targetPool);
        return NextResponse.json({
          ...baseMetrics,
          databaseAnalysis: analysis,
          timestamp: new Date().toISOString()
        });
      } catch (err: any) {
        console.warn(`[Enhanced Metrics API] Database analysis failed:`, err.message);
        // Continue with base metrics if analysis fails
        return NextResponse.json({
          ...baseMetrics,
          analysisError: err.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log(`[Enhanced Metrics API] Successfully processed ${analysisLevel} analysis for ID: ${id}`);
    console.log(`[Enhanced Metrics API] Found ${baseMetrics.performanceInsights?.length || 0} insights`);
    
    return NextResponse.json(baseMetrics);

  } catch (err: any) {
    console.error(`[Enhanced Metrics API Error - ID: ${id}] Message:`, err.message);
    console.error(`[Enhanced Metrics API Error - ID: ${id}] Stack:`, err.stack);
    
    return NextResponse.json(
      { 
        message: `Failed to fetch enhanced metrics: ${err.message}`,
        analysisLevel: analysisLevel,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  } finally {
    if (targetPool && driver?.disconnect) {
      console.log(`[Enhanced Metrics API] Disconnecting from target DB for ID: ${id}`);
      await driver.disconnect(targetPool);
    }
  }
}

// เพิ่ม endpoint สำหรับ real-time monitoring
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const body = await request.json();
  const { action, parameters } = body;

  let targetPool: AnyPool | undefined;
  let driver: Driver | undefined;

  try {
    // Get server config (same as GET)
    const result = await queryAppDb(
      `SELECT * FROM IT_ManagementDB.dbo.databaseInventory WHERE inventoryID = @id`,
      { id }
    );

    if (result.recordset.length === 0) {
      return NextResponse.json({ message: 'Server not found' }, { status: 404 });
    }

    const serverConfig = result.recordset[0];
    const upperCaseDbType = serverConfig.databaseType.toUpperCase();
    driver = drivers[upperCaseDbType];

    if (!driver) {
      return NextResponse.json({ message: 'Unsupported DB type' }, { status: 400 });
    }

    const connectionConfig = {
      user: serverConfig.connectionUsername,
      password: serverConfig.credentialReference,
      database: serverConfig.databaseName,
      port: serverConfig.port,
      host: serverConfig.serverHost,
      server: serverConfig.serverHost,
      connectionTimeout: 5000,
    };

    targetPool = await driver.connect(connectionConfig);

    // Handle different actions
    switch (action) {
      case 'kill_session':
        if (parameters?.sessionId && upperCaseDbType === 'MSSQL') {
          const mssqlPool = targetPool as any;
          await mssqlPool.request().query(`KILL ${parameters.sessionId}`);
          return NextResponse.json({ message: `Session ${parameters.sessionId} terminated` });
        }
        break;

      case 'get_query_plan':
        if (parameters?.sessionId && upperCaseDbType === 'MSSQL') {
          const mssqlPool = targetPool as any;
          const result = await mssqlPool.request().query(`
            SELECT query_plan 
            FROM sys.dm_exec_requests r
            CROSS APPLY sys.dm_exec_query_plan(r.plan_handle)
            WHERE r.session_id = ${parameters.sessionId}
          `);
          return NextResponse.json({ queryPlan: result.recordset[0]?.query_plan });
        }
        break;

      case 'get_blocking_tree':
        if (upperCaseDbType === 'MSSQL') {
          const mssqlPool = targetPool as any;
          const result = await mssqlPool.request().query(`
            WITH BlockingTree AS (
              SELECT session_id, blocking_session_id, wait_duration_ms, 0 as level
              FROM sys.dm_os_waiting_tasks 
              WHERE blocking_session_id IS NOT NULL
              UNION ALL
              SELECT w.session_id, w.blocking_session_id, w.wait_duration_ms, bt.level + 1
              FROM sys.dm_os_waiting_tasks w
              INNER JOIN BlockingTree bt ON w.blocking_session_id = bt.session_id
            )
            SELECT * FROM BlockingTree ORDER BY level, wait_duration_ms DESC
          `);
          return NextResponse.json({ blockingTree: result.recordset });
        }
        break;

      default:
        return NextResponse.json({ message: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json({ message: 'Action completed' });

  } catch (err: any) {
    console.error(`[Enhanced Metrics API Action Error] ${action}:`, err.message);
    return NextResponse.json(
      { message: `Failed to execute ${action}: ${err.message}` },
      { status: 500 }
    );
  } finally {
    if (targetPool && driver?.disconnect) {
      await driver.disconnect(targetPool);
    }
  }
}