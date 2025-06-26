// mssqlDriver.ts - เวอร์ชันที่รวมจุดแข็งจากโค้ดชุดแรกและชุดที่สอง

import sql, { ConnectionPool } from "mssql";
import {
  Driver as IDriver,
  Metrics,
  QueryAnalysis,
  OptimizationSuggestions,
  PerformanceInsight,
  AnyPool,
} from "@/types";
import { ms } from "zod/v4/locales";
const SQL_QUERIES = {
  connections: `
  SELECT COUNT(*) as value FROM sys.dm_exec_connections
`,
  slowQueriesHistorical: `
  SELECT TOP 10
    qs.sql_handle,
    qs.execution_count as calls,
    qs.total_elapsed_time / qs.execution_count as mean_exec_time_ms,
    st.text as query_text
  FROM sys.dm_exec_query_stats qs
  CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
  WHERE qs.execution_count > 0
  ORDER BY mean_exec_time_ms DESC
`,
  longRunningQueries: `
  SELECT
    r.session_id,
    r.status,
    r.start_time,
    r.command,
    r.total_elapsed_time,
    t.text as query_text
  FROM sys.dm_exec_requests r
  CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
  WHERE r.status = 'running'
  ORDER BY r.total_elapsed_time DESC
`,
  blockingQueries: `
  SELECT
    blocking_session_id,
    session_id as blocked_session_id,
    wait_type,
    wait_time,
    wait_resource
  FROM sys.dm_exec_requests
  WHERE blocking_session_id <> 0
`,
  dbStats: `
  SELECT
    SUM(size) * 8 / 1024 as total_size_mb
  FROM sys.master_files
  WHERE database_id = DB_ID()
`,
  runningQueries: `
  SELECT
    r.session_id,
    r.status,
    r.start_time,
    r.command,
    r.total_elapsed_time,
    t.text as query_text
  FROM sys.dm_exec_requests r
  CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t
  WHERE r.status = 'running'
  ORDER BY r.total_elapsed_time DESC
`,
  waitStats: `
  SELECT
    wait_type,
    waiting_tasks_count,
    wait_time_ms,
    max_wait_time_ms,
    signal_wait_time_ms
  FROM sys.dm_os_wait_stats
  ORDER BY wait_time_ms DESC
`,
  unusedIndexes: `
  SELECT
    OBJECT_NAME(i.object_id) as table_name,
    i.name as index_name,
    i.index_id,
    s.user_seeks,
    s.user_scans,
    s.user_lookups,
    s.user_updates
  FROM sys.indexes AS i
  INNER JOIN sys.dm_db_index_usage_stats AS s
    ON i.object_id = s.object_id AND i.index_id = s.index_id
  WHERE OBJECTPROPERTY(i.object_id,'IsUserTable') = 1
    AND i.type_desc = 'NONCLUSTERED'
    AND s.user_seeks = 0 AND s.user_scans = 0 AND s.user_lookups = 0
`,
  fragmentedIndexes: `
  SELECT
    dbschemas.[name] as 'Schema',
    dbtables.[name] as 'Table',
    dbindexes.[name] as 'Index',
    indexstats.avg_fragmentation_in_percent
  FROM sys.dm_db_index_physical_stats (DB_ID(), NULL, NULL, NULL, 'LIMITED') indexstats
  INNER JOIN sys.tables dbtables on dbtables.[object_id] = indexstats.[object_id]
  INNER JOIN sys.schemas dbschemas on dbtables.[schema_id] = dbschemas.[schema_id]
  INNER JOIN sys.indexes AS dbindexes ON dbindexes.[object_id] = indexstats.[object_id]
    AND indexstats.index_id = dbindexes.index_id
  WHERE indexstats.database_id = DB_ID()
    AND indexstats.avg_fragmentation_in_percent > 20
`,
  missingIndexes: `
  SELECT
    migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans) AS improvement_measure,
    mid.statement AS table_name,
    mid.equality_columns,
    mid.inequality_columns,
    mid.included_columns
  FROM sys.dm_db_missing_index_group_stats AS migs
  INNER JOIN sys.dm_db_missing_index_groups AS mig
    ON migs.group_handle = mig.index_group_handle
  INNER JOIN sys.dm_db_missing_index_details AS mid
    ON mig.index_handle = mid.index_handle
  ORDER BY improvement_measure DESC
`,
  systemAnalysis: `
  SELECT
    SERVERPROPERTY('ProductVersion') as version,
    SERVERPROPERTY('ProductLevel') as product_level,
    SERVERPROPERTY('Edition') as edition,
    SERVERPROPERTY('EngineEdition') as engine_edition
`,
  connectionDetails: `
  SELECT
    session_id,
    login_name,
    status,
    host_name,
    program_name,
    client_interface_name
  FROM sys.dm_exec_sessions
  WHERE is_user_process = 1
`,
  performanceMetrics: `
  SELECT
    cpu_count,
    hyperthread_ratio,
    physical_memory_kb,
    committed_kb,
    committed_target_kb
  FROM sys.dm_os_sys_info
`,
  tempdb_overallUsage: `
SELECT
  SUM(user_object_reserved_page_count) * 8 / 1024.0 as user_objects_mb,
  SUM(internal_object_reserved_page_count) * 8 / 1024.0 as internal_objects_mb,
  SUM(unallocated_extent_page_count) * 8 / 1024.0 as free_space_mb,
  SUM(total_page_count) * 8 / 1024.0 as total_space_mb
FROM sys.dm_db_file_space_usage;
`,

  /**
   * ตรวจสอบว่า Session ใดกำลังใช้งาน TempDB อยู่บ้าง
   * เหมาะสำหรับการหาต้นตอของปัญหา TempDB โตผิดปกติ
   */
  tempdb_sessionUsage: `
  SELECT
    s.session_id,
    s.login_name,
    s.host_name,
    s.program_name,
    (tsu.user_objects_alloc_page_count + tsu.internal_objects_alloc_page_count) * 8 / 1024.0 as usage_mb,
    req_text.text as query_text
  FROM sys.dm_db_session_space_usage AS tsu
  INNER JOIN sys.dm_exec_sessions AS s ON tsu.session_id = s.session_id
  LEFT JOIN sys.dm_exec_requests AS req ON s.session_id = req.session_id
  OUTER APPLY sys.dm_exec_sql_text(req.sql_handle) AS req_text
  WHERE (tsu.user_objects_alloc_page_count + tsu.internal_objects_alloc_page_count) > 0
  ORDER BY usage_mb DESC;
`,
  // === [NEW] Deadlock Analysis Query ===
  /**
   * ดึงข้อมูล Deadlock graph จาก Extended Events (system_health session)
   * นี่คือวิธีมาตรฐานและดีที่สุดในการตรวจสอบ Deadlock ที่เคยเกิดขึ้น
   */
  analysis_deadlocks: `
WITH DeadlockReport AS (
  SELECT
    CAST(event_data AS xml) AS event_xml
  FROM sys.fn_xe_file_target_read_file(
    'system_health*.xel',
    NULL, NULL, NULL
  )
  WHERE object_name = 'xml_deadlock_report'
)
SELECT
  event_xml.value('(//@timestamp)[1]', 'datetime2') AS deadlock_time,
  event_xml.value('(//process-list/process/@id)[1]', 'varchar(100)') AS process_id_1,
  event_xml.value('(//process-list/process/inputbuf)[1]', 'nvarchar(max)') AS query_1,
  event_xml.value('(//process-list/process/@id)[2]', 'varchar(100)') AS process_id_2,
  event_xml.value('(//process-list/process/inputbuf)[2]', 'nvarchar(max)') AS query_2,
  event_xml.value('(//resource-list/objectlock/@objectname)[1]', 'sysname') as locked_resource,
  event_xml AS deadlock_graph
FROM DeadlockReport
ORDER BY deadlock_time DESC;
`,

HitRatio:
`SELECT
    (CAST(c1.cntr_value AS DECIMAL(18, 2)) / CAST(c2.cntr_value AS DECIMAL(18, 2))) * 100.0 AS cache_hit_ratio_percent
FROM
    sys.dm_os_performance_counters c1
JOIN
    sys.dm_os_performance_counters c2 ON c1.object_name = c2.object_name
WHERE
    c1.object_name LIKE '%Buffer Manager%' AND c1.counter_name = 'Buffer cache hit ratio'
AND
    c2.object_name LIKE '%Buffer Manager%' AND c2.counter_name = 'Buffer cache hit ratio base'`;
};

/**
 * Insight Generator - รวม logic แปลง query result เป็น PerformanceInsight
 */
function generateInsights(data: {
  slowQueries: any[];
  runningQueries: any[];
  blockingQueries: any[];
  deadlocks: any[]; // เพิ่ม parameter ใหม่
  tempdbUsage: any[]; // เพิ่ม parameter ใหม่
}): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];

  data.slowQueries.forEach((q, i) => {
    const severity = q.mean_exec_time_ms > 10000 ? "critical" : "warning";
    insights.push({
      id: `slow_${i}`,
      type: "slow_query",
      severity,
      title: "Slow Historical Query",
      message: `Executed ${q.calls} times, avg ${Math.round(
        q.mean_exec_time_ms
      )}ms`,
      details: q,
      timestamp: new Date().toISOString(),
    });
  });

  data.deadlocks.forEach((d, i) => {
    insights.push({
      id: `deadlock_${i}`,
      type: "deadlock_event",
      severity: "critical",
      title: "Deadlock Detected",
      message: `Deadlock occurred at ${d.deadlock_time}, involving processes ${d.process_id_1} and ${d.process_id_2}.`,
      details: d, // ส่ง deadlock_graph ทั้งหมดไปใน details
      timestamp: new Date().toISOString(),
    });
  });

  // [NEW] Insight for TempDB Usage
  data.tempdbUsage.forEach((t, i) => {
    // สร้าง insight ก็ต่อเมื่อมีการใช้งานเกินเกณฑ์ที่กำหนด (เช่น 500MB)
    if (t.usage_mb > 500) {
      insights.push({
        id: `tempdb_high_usage_${i}`,
        type: "high_tempdb_usage",
        severity: "warning",
        title: "High TempDB Usage",
        message: `Session ${t.session_id} (${
          t.login_name
        }) is using ${Math.round(t.usage_mb)} MB of TempDB.`,
        details: t,
        timestamp: new Date().toISOString(),
      });
    }
  });

  data.runningQueries.forEach((q, i) => {
    insights.push({
      id: `running_${i}`,
      type: "long_running_query",
      severity: "warning",
      title: "Long Running Query",
      message: `Running ${Math.round(q.total_elapsed_time / 1000)} sec`,
      details: q,
      timestamp: new Date().toISOString(),
    });
  });

  data.blockingQueries.forEach((q, i) => {
    insights.push({
      id: `blocking_${i}`,
      type: "blocking_query",
      severity: "critical",
      title: "Blocking Detected",
      message: `Session ${q.blocking_session_id} blocking ${q.blocked_session_id}`,
      details: q,
      timestamp: new Date().toISOString(),
    });
  });

  return insights;
}

const mssqlDriver: IDriver = {
  connect: async (config: any): Promise<AnyPool> => {
    const pool = new sql.ConnectionPool({
      server: config.server,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      options: config.options || {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    });
    return await pool.connect();
  },

  disconnect: async (pool: AnyPool): Promise<void> => {
    await (pool as ConnectionPool).close();
  },

// ในไฟล์ mssqlDriver.ts

getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
  const mssqlPool = pool as ConnectionPool;
  try {
    // เรารันแค่ 5 Queries พื้นฐานที่ทำงานได้แน่นอน
    const [conn, slow, run, block, dbStat] = await Promise.all([
      mssqlPool.request().query(SQL_QUERIES.connections),
      mssqlPool.request().query(SQL_QUERIES.slowQueriesHistorical),
      mssqlPool.request().query(SQL_QUERIES.longRunningQueries),
      mssqlPool.request().query(SQL_QUERIES.blockingQueries),
      mssqlPool.request().query(SQL_QUERIES.dbStats),
    ]);

    // FIX: ส่ง Array ว่างเปล่าสำหรับข้อมูลที่เราไม่ได้ดึงมา
    // เพื่อไม่ให้เกิด Error `undefined.recordset`
    const insights = generateInsights({
      slowQueries: slow.recordset,
      runningQueries: run.recordset,
      blockingQueries: block.recordset,
      deadlocks: [], // <-- FIX: ส่งค่าว่างไปก่อน
      tempdbUsage: [], // <-- FIX: ส่งค่าว่างไปก่อน
    });

    const db = dbStat.recordset[0];

    return {
      kpi: {
        connections: conn.recordset[0]?.value ?? 0,
        databaseSize: Math.round(db?.total_size_mb || 0),
      },
      stats: {
        slowQueries: slow.recordset.length,
        runningQueries: run.recordset.length,
        blockingQueries: block.recordset.length,
        deadlocks: 0, // <-- FIX: กำหนดค่าเริ่มต้นเป็น 0
      },
      performanceInsights: insights,
    };
  } catch (err: any) {
    // ส่วนของ Error handling เดิม
    console.error("[MSSQL Driver] Metrics error:", err.message);
    return {
      performanceInsights: [{
        id: 'error_metrics_001',
        type: 'error',
        severity: 'critical',
        title: 'Metrics Collection Failed',
        message: err.message,
        timestamp: new Date().toISOString(),
        details: { query: 'N/A - No query text available' },
      }],
      error: err.message,
    };
  }
},

  getQueryAnalysis: async (pool: AnyPool): Promise<QueryAnalysis> => {
    const mssqlPool = pool as ConnectionPool;
    const [run, slow, block, wait, deadlocks, tempdb ] = await Promise.all([
      mssqlPool.request().query(SQL_QUERIES.runningQueries),
      mssqlPool.request().query(SQL_QUERIES.slowQueriesHistorical),
      mssqlPool.request().query(SQL_QUERIES.blockingQueries),
      mssqlPool.request().query(SQL_QUERIES.waitStats),
      mssqlPool.request().query(SQL_QUERIES.analysis_deadlocks), // เพิ่มการดึงข้อมูล Deadlock
      mssqlPool.request().query(SQL_QUERIES.tempdb_sessionUsage), // เพิ่มการดึงข้อมูล TempDB Session Usage
    ]);
    return {
      runningQueries: run.recordset,
      slowQueries: slow.recordset,
      blockingQueries: block.recordset,
      waitStats: wait.recordset,
      deadlocks: deadlocks.recordset,
      tempdbUsage: tempdb.recordset, // เพิ่ม TempDB Usage
    };
  },

  getOptimizationSuggestions: async (
    pool: AnyPool
  ): Promise<OptimizationSuggestions> => {
    const mssqlPool = pool as ConnectionPool;
    const [unused, fragmented, missing] = await Promise.all([
      mssqlPool.request().query(SQL_QUERIES.unusedIndexes),
      mssqlPool.request().query(SQL_QUERIES.fragmentedIndexes),
      mssqlPool.request().query(SQL_QUERIES.missingIndexes),
    ]);
    return {
      unusedIndexes: unused.recordset,
      fragmentedIndexes: fragmented.recordset,
      missingIndexes: missing.recordset,
    };
  },

  analyzeDatabaseHealth: async (pool: AnyPool): Promise<any> => {
    const mssqlPool = pool as ConnectionPool;
    const [system, connections, performance] = await Promise.all([
      mssqlPool.request().query(SQL_QUERIES.systemAnalysis),
      mssqlPool.request().query(SQL_QUERIES.connectionDetails),
      mssqlPool.request().query(SQL_QUERIES.performanceMetrics),
    ]);

    return {
      system: system.recordset[0],
      connections: {
        total: connections.recordset.length,
        active: connections.recordset.filter((c) => c.status === "running")
          .length,
        details: connections.recordset,
      },
      performance: performance.recordset[0],
      timestamp: new Date().toISOString(),
    };
  },
};

export default mssqlDriver;

// sqlQueries.ts - MSSQL queries used by mssqlDriver
