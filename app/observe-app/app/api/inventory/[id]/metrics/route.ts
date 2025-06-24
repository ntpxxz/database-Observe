// ไฟล์ Metrics/route.ts เวอร์ชันสำหรับ Debug
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
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  let targetPool: AnyPool | undefined;
  let driver: Driver | undefined;

  console.log(`[Metrics API] Received request for ID: ${id}`);

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
      console.error(
        `[Metrics API] Server config with ID '${id}' not found in database.`
      );
      
      return NextResponse.json(
        { message: `Server config with ID '${id}' not found.` },
        { status: 404 }
      );
    }

    const serverConfig: DatabaseInventory = result.recordset[0];
    // --- DEBUG LOG 1: ดูข้อมูล Config ที่ได้มา ---
    console.log(
      "[Metrics API] RAW server config object from DB:",
      result.recordset[0]
    );
    // แก้ปัญหา Case-Sensitive ของ databaseType
    const upperCaseDbType = serverConfig.databaseType.toUpperCase();
    driver = drivers[upperCaseDbType];

    if (!driver) {
      console.error(
        `[Metrics API] Unsupported DB type: '${serverConfig.databaseType}'. No driver found for key '${upperCaseDbType}'.`
      );
      return NextResponse.json(
        { message: `Unsupported DB type: ${serverConfig.databaseType}` },
        { status: 400 }
      );
    }

    console.log(`[Metrics API] Driver found for '${upperCaseDbType}'.`);

    const connectionConfig = {
      user: serverConfig.connectionUsername,
      password: serverConfig.credentialReference, // <--- ตรวจสอบว่านี่คือ Password จริงหรือไม่
      database: serverConfig.databaseName,
      port: serverConfig.port,
      host: serverConfig.serverHost,
      server: serverConfig.serverHost,
      connectionTimeout: 5000,
    };

    // --- DEBUG LOG 2: ดู Config ที่จะส่งให้ Driver ---
    console.log("[Metrics API] Prepared connection config (password hidden):", {
      ...connectionConfig,
      password: "***",
    });

    const dbMetricsPromise = (async () => {
      console.log("[Metrics API] Attempting to connect to target DB...");
      targetPool = await driver.connect(connectionConfig);
      console.log(
        "[Metrics API] Connection to target DB successful. Fetching metrics..."
      );
      const metrics = await driver.getMetrics(targetPool);
      // --- DEBUG LOG 3: ดูผลลัพธ์ที่ได้จาก Driver ---
      console.log(
        "[Metrics API] Received metrics from driver:",
        JSON.stringify(metrics, null, 2)
      );
      return metrics;
    })();

    const agentMetricsPromise = fetch(
      `http://${serverConfig.serverHost}:${
        process.env.NODE_EXPORTER_PORT || 9100
      }/metrics`,
      { timeout: 5000 }
    )
      .then((res) =>
        res.ok
          ? res.text()
          : Promise.reject(`Agent not reachable (status: ${res.status})`)
      )
      .then((text) => parseNodeExporterMetrics(text))
      .catch((err) => {
        console.warn(`[Metrics API] Agent fetch failed:`, err.message);
        return { error: true, message: err.message };
      });

    const [dbMetrics, hardwareMetrics] = await Promise.all([
      dbMetricsPromise,
      agentMetricsPromise,
    ]);

    const finalMetrics: Metrics = {
      kpi: {
        cpu: "error" in hardwareMetrics ? undefined : hardwareMetrics.cpu,
        memory: "error" in hardwareMetrics ? undefined : hardwareMetrics.memory,
        ...dbMetrics.kpi,
      },
      stats: dbMetrics.stats,
      performanceInsights: dbMetrics.performanceInsights,
      hardwareError:
        "error" in hardwareMetrics ? hardwareMetrics.message : null,
    };
    console.log(`[API FINAL CHECK] Preparing to send data for server ID: ${id}. Found ${finalMetrics.performanceInsights?.length || 0} insights.`);
    console.log(
      `[Metrics API] Successfully processed metrics for ID: ${id}. Sending response.`
    );
    return NextResponse.json(finalMetrics);
  } catch (err: any) {
    // --- DEBUG LOG 4: ดู Error ที่เกิดขึ้น ---
    console.error(`[Metrics API Error - ID: ${id}] Message:`, err.message);
    console.error(`[Metrics API Error - ID: ${id}] Stack:`, err.stack);
    
    return NextResponse.json(
      { message: `Failed to fetch metrics: ${err.message}` },
      { status: 500 }
    );
  } finally {
    if (targetPool && driver?.disconnect) {
      console.log(`[Metrics API] Disconnecting from target DB for ID: ${id}`);
      await driver.disconnect(targetPool);
    }
  }
}
