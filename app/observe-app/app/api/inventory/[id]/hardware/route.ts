import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { queryAppDb } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  let pool: sql.ConnectionPool | undefined;

  try {
    // ขั้นตอนที่ 1: ดึงข้อมูล Config ของ Server เป้าหมายจาก DB หลักของคุณ
    const result = await queryAppDb(
      `SELECT 
                InventoryID as inventoryID, SystemName as systemName, ServerHost as serverHost, 
                Port as port, DatabaseName as databaseName, DatabaseType as databaseType, 
                ConnectionUsername as connectionUsername, CredentialReference as credentialReference
             FROM IT_ManagementDB.dbo.databaseInventory
             WHERE inventoryID = @id`,
      { id }
    );
    if (!result.recordset || result.recordset.length === 0) {
      return NextResponse.json(
        { error: "Server configuration not found." },
        { status: 404 }
      );
    }

    const serverConfig = result.recordset[0];

    if (!serverConfig.credentialReference) {
      return NextResponse.json(
        { error: "Server connection password is not configured." },
        { status: 400 }
      );
    }

    // ขั้นตอนที่ 2: สร้าง Config และเชื่อมต่อไปยัง Server เป้าหมาย
    const connectionConfig: sql.config = {
      user: serverConfig.connectionUsername,
      password: serverConfig.credentialReference,
      database: serverConfig.databaseName,
      port: serverConfig.port,
      server: serverConfig.serverHost,
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
      connectionTimeout: 15000,
      requestTimeout: 60000,
    };
    pool = new sql.ConnectionPool(connectionConfig);
    const poolConnection = await pool.connect();

    // ขั้นตอนที่ 3: Execute Queries
    const cpuQuery = `
   SELECT
        CAST(100.0 * SUM(signal_wait_time_ms) / SUM(wait_time_ms) AS NUMERIC(20, 2)) AS cpu_pressure_percent
    FROM sys.dm_os_wait_stats
    WHERE 
        wait_time_ms > 0 AND
      
        wait_type NOT IN (
            'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SLEEP_TASK',
            'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH', 'WAITFOR', 'LOGMGR_QUEUE',
            'CHECKPOINT_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_EVENTHANDLER',
            'BROKER_RECEIVE_WAITFOR', 'FT_IFTS_SCHEDULER_IDLE_WAIT', 'XE_DISPATCHER_WAIT',
            'PREEMPTIVE_OS_GETPROCADDRESS', 'PREEMPTIVE_OS_AUTHENTICATIONOPS', 'PREEMPTIVE_OS_GENERICOPS',
            'PREEMPTIVE_OS_SCHEDULYIELD', 'PREEMPTIVE_OS_WAITFORSINGLEOBJECT', 'PWAIT_ALL_COMPONENTS_INITIALIZED',
            'BROKER_TASK_STOP', 'DIRTY_PAGE_POLL', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION',
            'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP', 'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP'
        );;
    `;

    const dbMetricsQuery = `WITH MemoryUsage AS (SELECT database_id, COUNT(*) * 8.0 / 1024 AS memory_used_mb FROM
    sys.dm_os_buffer_descriptors GROUP BY database_id), DiskUsage AS (SELECT database_id, SUM(CASE WHEN type_desc = 'ROWS' 
    THEN size * 8.0 / 1024 END) AS data_file_mb, SUM(CASE WHEN type_desc = 'LOG' THEN size * 8.0 / 1024 END) AS log_file_mb 
    FROM sys.master_files GROUP BY database_id), IOStats AS (SELECT database_id, SUM(num_of_reads) AS total_reads, SUM(num_of_writes) 
    AS total_writes FROM sys.dm_io_virtual_file_stats(NULL, NULL) GROUP BY database_id) SELECT d.name AS database_name, ISNULL(du.data_file_mb, 0) AS data_size_mb, 
    ISNULL(du.log_file_mb, 0) AS log_size_mb, ISNULL(mu.memory_used_mb, 0) AS memory_in_buffer_mb, ISNULL(io.total_reads, 0) 
    AS total_reads_count, ISNULL(io.total_writes, 0) AS total_writes_count FROM sys.databases d 
    LEFT JOIN MemoryUsage mu ON d.database_id = mu.database_id LEFT JOIN DiskUsage du ON d.database_id = du.database_id 
    LEFT JOIN IOStats io ON d.database_id = io.database_id WHERE d.database_id > 4 ORDER BY d.name;`;

    
    // [เพิ่มใหม่ 1/3] เพิ่ม SQL Query สำหรับ Cache Hit Rate
    const cacheHitRateQuery = `SELECT (CAST(c1.cntr_value AS DECIMAL(18,2)) * 100.0) / CAST(c2.cntr_value AS DECIMAL(18,2)) AS cache_hit_ratio_percent FROM sys.dm_os_performance_counters c1 JOIN sys.dm_os_performance_counters c2 ON c1.object_name = c2.object_name WHERE c1.object_name LIKE '%Buffer Manager%' AND c1.counter_name = 'Buffer cache hit ratio' AND c2.object_name LIKE '%Buffer Manager%' AND c2.counter_name = 'Buffer cache hit ratio base';`;
    const [cpuResult, dbMetricsResult,cacheHitRateResult] = await Promise.all([
      poolConnection.query(cpuQuery),
      poolConnection.query(dbMetricsQuery),
      poolConnection.query(cacheHitRateQuery)

    ]);

    const responseData = {
      cpuUsage: cpuResult.recordset[0]?.sql_server_cpu_usage_percent || 0,
      databaseMetrics: dbMetricsResult.recordset,
      stats: {       
        cache_hit_rate: cacheHitRateResult.recordset[0]?.cache_hit_ratio_percent || 0,
      },
    };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error(`[API Hardware Error] for ID ${id}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch hardware metrics.", details: error.message },
      { status: 500 }
    );
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}
