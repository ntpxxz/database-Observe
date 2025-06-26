import { NextResponse } from "next/server";
import { queryAppDb } from "@/lib/db";
import { Driver, DatabaseInventory, AnyPool } from "@/types";

// Import all drivers
import postgresDriver from "@/lib/drivers/postgresDriver";
import mysqlDriver from "@/lib/drivers/mysqlDriver";
import mssqlDriver from "@/lib/drivers/mssqlDriver";

// Import helper functions if you have them
import { parseNodeExporterMetrics } from "@/lib/metricParser";
import fetch from "node-fetch";

const drivers: { [key: string]: Driver } = {
    POSTGRES: postgresDriver,
    MYSQL: mysqlDriver,
    MSSQL: mssqlDriver,
};

// บังคับให้ Route นี้ดึงข้อมูลใหม่เสมอ ไม่ใช้ Cache
export const dynamic = 'force-dynamic';

/**
 * GET handler for /api/inventory/[id]/metrics
 * สามารถรับ Query Param 'level' เพื่อกำหนดความลึกของข้อมูลที่ต้องการ
 * ?level=basic (default) -> สำหรับ Dashboard หลัก
 * ?level=detailed -> สำหรับหน้าวิเคราะห์ Query
 * ?level=full -> สำหรับหน้าวิเคราะห์ + คำแนะนำ
 */
export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { id } = params;
    const url = new URL(request.url);
    const analysisLevel = url.searchParams.get('level') || 'basic'; // 'basic', 'detailed', 'full'
    
    let targetPool: AnyPool | undefined;
    let driver: Driver | undefined;

    console.log(`[API Route] Received request for ID: ${id}, Analysis Level: ${analysisLevel}`);

    try {
        // 1. ดึง Configuration ของ Server จากฐานข้อมูลหลัก
        const result = await queryAppDb(
            `SELECT 
                InventoryID as inventoryID, SystemName as systemName, ServerHost as serverHost, 
                Port as port, DatabaseName as databaseName, DatabaseType as databaseType, 
                ConnectionUsername as connectionUsername, CredentialReference as credentialReference
             FROM IT_ManagementDB.dbo.databaseInventory
             WHERE inventoryID = @id`,
            { id }
        );

        if (result.recordset.length === 0) {
            return NextResponse.json({ message: `Server config with ID '${id}' not found.` }, { status: 404 });
        }

        const serverConfig: DatabaseInventory = result.recordset[0];
        const upperCaseDbType = serverConfig.databaseType.toUpperCase();
        driver = drivers[upperCaseDbType];

        if (!driver) {
            return NextResponse.json({ message: `Unsupported DB type: ${serverConfig.databaseType}` }, { status: 400 });
        }

        // 2. สร้าง Configuration และเชื่อมต่อไปยังฐานข้อมูลเป้าหมาย
        const connectionConfig = {
            user: serverConfig.connectionUsername,
            password: serverConfig.credentialReference,
            database: serverConfig.databaseName,
            port: serverConfig.port,
            host: serverConfig.serverHost,
            server: serverConfig.serverHost, // for mssql
            connectionTimeout: 15000,
            requestTimeout: 60000, // เพิ่ม timeout สำหรับ analysis ที่อาจจะนาน
        };
        targetPool = await driver.connect(connectionConfig);

        // 3. เลือกว่าจะเรียกใช้ฟังก์ชันไหนใน Driver ตาม `analysisLevel`
        let responseData;

        switch (analysisLevel) {
            case 'full':
                console.log(`[API Route] Executing 'full' analysis...`);
                // สำหรับ level 'full' เราอาจจะต้องการข้อมูลทั้ง Analysis และ Optimization
                if (driver.getQueryAnalysis && driver.getOptimizationSuggestions) {
                    const [analysis, optimizations] = await Promise.all([
                        driver.getQueryAnalysis(targetPool),
                        driver.getOptimizationSuggestions(targetPool)
                    ]);
                    responseData = { ...analysis, ...optimizations, analysisLevel: 'full' };
                }
                break;
            
            case 'detailed':
                console.log(`[API Route] Executing 'detailed' analysis...`);
                if (driver.getQueryAnalysis) {
                    responseData = await driver.getQueryAnalysis(targetPool);
                    responseData.analysisLevel = 'detailed';
                }
                break;
            
            default: // 'basic'
                console.log(`[API Route] Executing 'basic' metrics fetch...`);
                // ดึงข้อมูล Hardware ควบคู่ไปกับ DB Metrics
                 const [dbMetrics, hardwareMetrics] = await Promise.all([
                    driver.getMetrics(targetPool),
                    fetch(`http://${serverConfig.serverHost}:${process.env.NODE_EXPORTER_PORT || 9100}/metrics`, { timeout: 5000 })
                        .then(res => res.ok ? res.text() : Promise.reject(`Agent not reachable`))
                        .then(text => parseNodeExporterMetrics(text))
                        .catch(err => ({ error: true, message: err.message }))
                ]);
                
                // ประกอบร่างข้อมูลสำหรับหน้า Dashboard
                responseData = {
                    kpi: {
                        cpu: "error" in hardwareMetrics ? undefined : hardwareMetrics.cpu,
                        memory: "error" in hardwareMetrics ? undefined : hardwareMetrics.memory,
                        ...dbMetrics.kpi,
                    },
                    stats: dbMetrics.stats,
                    performanceInsights: dbMetrics.performanceInsights || [],
                    hardwareError: "error" in hardwareMetrics ? hardwareMetrics.message : null,
                    analysisLevel: 'basic',
                    timestamp: new Date().toISOString()
                };
                break;
        }

        // 4. ส่งข้อมูลที่ได้กลับไป
        return NextResponse.json(responseData);

    } catch (err: any) {
        console.error(`[API Route Error - ID: ${id}] Message:`, err.message);
        return NextResponse.json({ message: `Failed to fetch metrics: ${err.message}` }, { status: 500 });
    } finally {
        if (targetPool && driver?.disconnect) {
            await driver.disconnect(targetPool);
        }
    }
}