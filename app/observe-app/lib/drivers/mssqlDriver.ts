import sql, { ConnectionPool, IResult } from "mssql";
import {
  Driver as IDriver,
  Metrics,
  AnyPool,
  QueryAnalysis,
  OptimizationSuggestions,
} from "@/types"; // สมมติว่า Type ของคุณหน้าตาประมาณนี้

/**
 * ศูนย์รวม SQL Queries สำหรับการตรวจสอบประสิทธิภาพของ MSSQL
 * จัดเก็บในที่เดียวเพื่อง่ายต่อการบำรุงรักษา
 */
const SQL_QUERIES = {
  /** นับจำนวนการเชื่อมต่อจากผู้ใช้ (Active or Idle) */
  connections: `
    SELECT count(session_id) as value 
    FROM sys.dm_exec_sessions 
    WHERE is_user_process = 1;
  `,

  /** ข้อมูลขนาดของ Database ปัจจุบัน */
  dbStats: `
    SELECT 
      SUM(size) * 8.0 / 1024 as total_size_mb,
      SUM(CASE WHEN type = 0 THEN size END) * 8.0 / 1024 as data_size_mb,
      SUM(CASE WHEN type = 1 THEN size END) * 8.0 / 1024 as log_size_mb
    FROM sys.database_files;
  `,

  /** * [Real-time] ค้นหา Query ที่กำลังทำงาน "ณ ขณะนี้" และใช้เวลานานเกินกำหนด
   * มาจาก sys.dm_exec_requests
   */
  runningQueries: `
    SELECT 
      s.session_id,
      r.status,
      r.command,
      r.start_time,
      r.total_elapsed_time,
      r.cpu_time,
      r.logical_reads,
      st.text AS query
    FROM sys.dm_exec_sessions s
    INNER JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
    WHERE s.is_user_process = 1 
      AND r.session_id <> @@SPID
      AND r.status <> 'sleeping'
      AND r.total_elapsed_time > 5000  -- กำหนดค่า Threshold: ทำงานนานกว่า 5 วินาที
    ORDER BY r.total_elapsed_time DESC;
  `,

  /**
   * [Real-time] ค้นหาสถานการณ์ Blocking ที่เกิดขึ้น "ณ ขณะนี้"
   * แก้ไข Bug เดิมโดยใช้ sys.dm_os_waiting_tasks เป็นตัวหลัก ทำให้หา Query ของตัวบล็อกได้แม่นยำขึ้น
   */
  blockingQueries: `
  SELECT
      wt.blocking_session_id,
      wt.session_id AS blocked_session_id,
      wt.wait_duration_ms,
      wt.wait_type,
      ISNULL(blocker_req.cpu_time, 0) as blocking_cpu_time,
      ISNULL(blocked_req.cpu_time, 0) as blocked_cpu_time,
      -- Query ของตัวที่กำลังบล็อก (The Blocker)
      ISNULL(
          SUBSTRING(blocker_text.text, blocker_req.statement_start_offset/2 + 1,
              (CASE WHEN blocker_req.statement_end_offset = -1
                  THEN DATALENGTH(blocker_text.text)
                  ELSE blocker_req.statement_end_offset
              END - blocker_req.statement_start_offset)/2 + 1),
          'N/A - System or No Active Request' 
      ) AS blocking_query,
      -- Query ของตัวที่โดนบล็อก (The Blocked)
      SUBSTRING(blocked_text.text, blocked_req.statement_start_offset/2 + 1,
          (CASE WHEN blocked_req.statement_end_offset = -1
              THEN DATALENGTH(blocked_text.text)
              ELSE blocked_req.statement_end_offset
          END - blocked_req.statement_start_offset)/2 + 1) AS blocked_query
  FROM sys.dm_os_waiting_tasks AS wt
  LEFT JOIN sys.dm_exec_requests AS blocked_req ON wt.session_id = blocked_req.session_id
  LEFT JOIN sys.dm_exec_requests AS blocker_req ON wt.blocking_session_id = blocker_req.session_id
  OUTER APPLY sys.dm_exec_sql_text(blocked_req.sql_handle) AS blocked_text
  OUTER APPLY sys.dm_exec_sql_text(blocker_req.sql_handle) AS blocker_text
  WHERE wt.session_id <> @@SPID;
`,
  /**
   * [Historical] ค้นหา Query ที่ใช้ทรัพยากร "สะสม" สูงสุด (CPU, I/O)
   * ข้อมูลมาจาก Plan Cache ซึ่งเป็นข้อมูลในอดีตตั้งแต่ Server เปิดหรือ Plan ถูกล้างล่าสุด
   */
  slowQueriesHistorical: `
    SELECT TOP 20
      SUBSTRING(st.text, (qs.statement_start_offset/2) + 1, 
        ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) 
          ELSE qs.statement_end_offset END - qs.statement_start_offset)/2) + 1) AS query,
      qs.total_worker_time / 1000.0 AS total_exec_time_ms,
      qs.execution_count AS calls,
      (qs.total_worker_time / qs.execution_count) / 1000.0 AS mean_exec_time_ms,
      qs.total_logical_reads as total_logical_reads,
      (qs.total_logical_reads / qs.execution_count) as avg_logical_reads,
      qs.last_execution_time,
      qs.creation_time
    FROM sys.dm_exec_query_stats AS qs
    CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
    WHERE qs.execution_count > 1 
      AND (qs.total_worker_time / qs.execution_count) / 1000.0 > 1000 -- กำหนดค่า Threshold: เฉลี่ยแล้วช้ากว่า 1 วินาที
    ORDER BY (qs.total_worker_time / qs.execution_count) DESC;
  `,

  /** [Analysis] ค้นหา Index ที่ไม่ได้ถูกใช้งานเลย */
  unusedIndexes: `
    SELECT 
      OBJECT_NAME(i.object_id) as tableName,
      i.name as indexName,
      ps.used_page_count * 8 / 1024 as sizeMB,
      'Consider dropping - never used since last restart/rebuild' as suggestion
    FROM sys.indexes i
    LEFT JOIN sys.dm_db_index_usage_stats ius ON i.object_id = ius.object_id AND i.index_id = ius.index_id AND ius.database_id = DB_ID()
    INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
    WHERE ius.index_id IS NULL AND i.type > 0 AND i.is_primary_key = 0 AND i.is_unique_constraint = 0
    ORDER BY sizeMB DESC;
  `,

  /** [Analysis] ค้นหา Index ที่มี Fragmentation สูง */
  fragmentedIndexes: `
    SELECT 
      OBJECT_NAME(ips.object_id) as tableName,
      i.name as indexName,
      ips.avg_fragmentation_in_percent as fragmentation,
      ips.page_count,
      CASE 
        WHEN ips.avg_fragmentation_in_percent > 30 THEN 'REBUILD recommended'
        WHEN ips.avg_fragmentation_in_percent > 5 THEN 'REORGANIZE recommended'
        ELSE 'OK'
      END as suggestion
    FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
    INNER JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
    WHERE ips.avg_fragmentation_in_percent > 5 AND ips.page_count > 1000 -- Threshold
    ORDER BY ips.avg_fragmentation_in_percent DESC;
  `,

  /** [Analysis] ค้นหา Index ที่ระบบแนะนำว่าควรสร้าง (Missing Indexes) */
  missingIndexes: `
    SELECT TOP 10
      migs.avg_total_user_cost * (migs.avg_user_impact / 100.0) * (migs.user_seeks + migs.user_scans) as improvement_measure,
      'CREATE INDEX IX_Missing_' + FORMAT(GETDATE(), 'yyyyMMdd_HHmmss') + '_' + CAST(NEWID() AS VARCHAR(36)) + 
      ' ON ' + mid.statement + ' (' + 
      ISNULL(mid.equality_columns, '') + 
      CASE WHEN mid.equality_columns IS NOT NULL AND mid.inequality_columns IS NOT NULL THEN ',' ELSE '' END +
      ISNULL(mid.inequality_columns, '') + ')' +
      ISNULL(' INCLUDE (' + mid.included_columns + ')', '') as suggested_index,
      mid.statement as tableName,
      mid.equality_columns,
      mid.inequality_columns,
      mid.included_columns
    FROM sys.dm_db_missing_index_group_stats migs
    INNER JOIN sys.dm_db_missing_index_groups mig ON migs.group_handle = mig.index_group_handle
    INNER JOIN sys.dm_db_missing_index_details mid ON mig.index_handle = mid.index_handle
    WHERE mid.database_id = DB_ID()
    ORDER BY improvement_measure DESC;
  `,
  
  /** [Analysis] ข้อมูล Wait Stats เพื่อหาคอขวดของระบบ */
  waitStats: `
    SELECT TOP 20
      wait_type as waitType,
      waiting_tasks_count as waitingTasksCount,
      wait_time_ms as waitTimeMs
    FROM sys.dm_os_wait_stats
    WHERE wait_type NOT IN (
      'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SLEEP_TASK',
      'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH', 'WAITFOR', 'LOGMGR_QUEUE',
      'CHECKPOINT_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT'
    )
    ORDER BY wait_time_ms DESC;
  `,

  /** [Real-time] ค้นหา Query ที่กำลังทำงาน "ณ ขณะนี้" และใช้เวลานานเกินกำหนด (ปรับปรุงใหม่) */
  longRunningQueries: `
    SELECT 
      s.session_id,
      r.status,
      r.command,
      r.start_time,
      r.total_elapsed_time,
      r.cpu_time,
      r.logical_reads,
      st.text AS query
    FROM sys.dm_exec_sessions s
    INNER JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
    WHERE s.is_user_process = 1 
      AND r.session_id <> @@SPID
      AND r.status <> 'sleeping'
      AND r.total_elapsed_time > 10000  -- กำหนดค่า Threshold: ทำงานนานกว่า 10 วินาที
    ORDER BY r.total_elapsed_time DESC;
  `,

  /** [Real-time] ค้นหา Chain ของ Blocking ที่เกิดขึ้น "ณ ขณะนี้" (ปรับปรุงใหม่) */
  blockingChains: `
  WITH BlockingCTE AS (
    SELECT
      wt.blocking_session_id,
      wt.session_id AS blocked_session_id,
      wt.wait_duration_ms,
      wt.wait_type,
      1 AS level
    FROM sys.dm_os_waiting_tasks AS wt
    WHERE wt.blocking_session_id <> 0
      AND wt.session_id <> @@SPID

    UNION ALL

    SELECT
      wt.blocking_session_id,
      wt.session_id AS blocked_session_id,
      wt.wait_duration_ms,
      wt.wait_type,
      cte.level + 1
    FROM sys.dm_os_waiting_tasks AS wt
    INNER JOIN BlockingCTE cte ON wt.session_id = cte.blocking_session_id
    WHERE wt.blocking_session_id <> 0
      AND wt.session_id <> @@SPID
  )
  SELECT
      b1.blocking_session_id,
      b1.blocked_session_id,
      b1.wait_duration_ms,
      b1.wait_type,
      CAST(STRING_AGG(CONVERT(VARCHAR(20), b2.blocked_session_id), ' -> ') AS VARCHAR(MAX)) AS blocking_chain
  FROM BlockingCTE b1
  JOIN BlockingCTE b2 ON b1.blocking_session_id = b2.session_id
  GROUP BY b1.blocking_session_id, b1.blocked_session_id, b1.wait_duration_ms, b1.wait_type
  ORDER BY b1.wait_duration_ms DESC;
`,

  /** [Real-time] ค้นหา Query ที่ใช้ทรัพยากรสูงในขณะนี้ (CPU, Memory, I/O) (ปรับปรุงใหม่) */
  resourceIntensiveQueries: `
    SELECT TOP 20
      s.session_id,
      r.status,
      r.command,
      r.start_time,
      r.total_elapsed_time,
      r.cpu_time,
      r.logical_reads,
      r.writes,
      st.text AS query
    FROM sys.dm_exec_sessions s
    INNER JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
    WHERE s.is_user_process = 1 
      AND r.session_id <> @@SPID
      AND r.status <> 'sleeping'
    ORDER BY r.cpu_time DESC, r.total_elapsed_time DESC;
  `,

  /** [Analysis] ข้อมูล Wait Stats โดยละเอียด */
  detailedWaitStats: `
    SELECT 
      wait_type,
      wait_time_ms,
      waiting_tasks_count,
      100.0 * wait_time_ms / SUM(wait_time_ms) OVER () AS percentage
    FROM sys.dm_os_wait_stats
    WHERE wait_type NOT IN (
      'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SLEEP_TASK',
      'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH', 'WAITFOR', 'LOGMGR_QUEUE',
      'CHECKPOINT_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT'
    )
    ORDER BY wait_time_ms DESC;
  `,

  /** [Analysis] การวิเคราะห์การเชื่อมต่อ (Active, Idle, Problematic) */
  connectionAnalysis: `
    SELECT 
      c.client_net_address,
      c.session_id,
      s.status,
      s.login_name,
      s.host_name,
      s.program_name,
      s.cpu_time,
      s.total_elapsed_time,
      s.logical_reads,
      s.writes,
      s.reads,
      s.creation_time,
      s.last_request_start_time,
      s.last_request_end_time,
      DATEDIFF(SECOND, s.creation_time, GETDATE()) AS age_seconds,
      CASE 
        WHEN s.status = 'running' THEN 'Active'
        WHEN s.status = 'sleeping' AND DATEDIFF(MINUTE, s.last_request_end_time, GETDATE()) < 5 THEN 'Idle'
        ELSE 'Problematic'
      END AS connection_state
    FROM sys.dm_exec_sessions s
    JOIN sys.dm_exec_connections c ON s.session_id = c.session_id
    WHERE s.is_user_process = 1
    ORDER BY s.total_elapsed_time DESC;
  `,

  /** [Analysis] การวิเคราะห์ประสิทธิภาพโดยรวม (CPU, Memory, I/O) */
  performanceCounters: `
    SELECT TOP 10
      object_name,
      counter_name,
      instance_name,
      cntr_value
    FROM sys.dm_os_performance_counters
    WHERE object_name LIKE '%Processor%' OR object_name LIKE '%Memory%' OR object_name LIKE '%Disk%'
    ORDER BY cntr_value DESC;
  `,

  // Update the system analysis queries
  systemAnalysis: `
    SELECT 
      @@SERVERNAME as server_name,
      @@VERSION as sql_version,
      DB_NAME() as current_database,
      (SELECT COUNT(*) FROM sys.dm_exec_connections) as connection_count,
      (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE status = 'running') as active_requests
  `,

  // Update connection analysis to use correct DMVs
  connectionDetails: `
    SELECT 
      c.connection_id,
      c.connect_time,
      c.num_reads,
      c.num_writes,
      c.last_read,
      c.last_write,
      c.client_net_address,
      s.host_name,
      s.program_name,
      s.login_name,
      r.command,
      r.status,
      r.wait_type,
      r.wait_time,
      r.cpu_time,
      r.total_elapsed_time
    FROM sys.dm_exec_connections c
    LEFT JOIN sys.dm_exec_sessions s 
      ON c.most_recent_session_id = s.session_id
    LEFT JOIN sys.dm_exec_requests r 
      ON s.session_id = r.session_id
    WHERE s.is_user_process = 1
  `,

  // Add performance metrics
  performanceMetrics: `
    SELECT 
      (SELECT COUNT(*) FROM sys.dm_exec_requests WHERE status = 'running') as active_queries,
      (SELECT AVG(CAST(wait_time as BIGINT)) FROM sys.dm_exec_requests WHERE wait_time > 0) as avg_wait_time_ms,
      (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) as user_connections
  `
};

/**
 * MSSQL Driver Implementation
 */
const mssqlDriver: IDriver = {
  /**
   * Establishes a connection to the MSSQL server.
   */
  connect: async (config: any): Promise<AnyPool> => {
    if (typeof config.server !== "string") {
      throw new Error(`Invalid config.server: ${typeof config.server}. Must be a string.`);
    }
    console.log("Connecting to MSSQL with config:", config.server, config.port, config.database);

    const pool = new sql.ConnectionPool({
      server: config.server,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      options: config.options || {
        encrypt: process.env.NODE_ENV === 'production', // Encrypt by default in production
        trustServerCertificate: true, // Be cautious with this in production
        enableArithAbort: true,
      },
      connectionTimeout: config.connectionTimeout || 15000,
      requestTimeout: config.requestTimeout || 30000,
    });

    return await pool.connect();
  },

  /**
   * Closes the connection pool.
   */
  disconnect: async (pool: AnyPool): Promise<void> => {
    await (pool as ConnectionPool).close();
  },

  /**
   * Gathers key performance metrics and generates actionable insights.
   */
  getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
    const mssqlPool = pool as ConnectionPool;
    try {
      console.log('[MSSQL Driver] Executing metrics queries...');

      const [connRes, slowRes, runningRes, blockingRes, dbStatsRes] = await Promise.all([
        mssqlPool.request().query(SQL_QUERIES.connections),
        mssqlPool.request().query(SQL_QUERIES.slowQueriesHistorical),
        mssqlPool.request().query(SQL_QUERIES.runningQueries),
        mssqlPool.request().query(SQL_QUERIES.blockingQueries),
        mssqlPool.request().query(SQL_QUERIES.dbStats),
      ]);

      const performanceInsights = [];

      // 1. Insights for Slow Historical Queries
      slowRes.recordset.forEach((row, index) => {
        const severity = row.mean_exec_time_ms > 10000 ? 'critical' : 'warning';
        performanceInsights.push({
          id: `slow_query_hist_${index}`, type: 'slow_query', severity,
          title: `Historically Slow Query`,
          message: `Query averages ${Math.round(row.mean_exec_time_ms)}ms. Executed ${row.calls} times.`,
          details: { query: row.query, avgExecutionTimeMs: Math.round(row.mean_exec_time_ms), totalExecutions: row.calls, lastExecution: row.last_execution_time },
          timestamp: new Date().toISOString()
        });
      });

      // 2. Insights for Currently Long-Running Queries
      runningRes.recordset.forEach((row, index) => {
        performanceInsights.push({
          id: `running_query_${index}`, type: 'long_running_query', severity: 'warning',
          title: `Long-Running Query`,
          message: `Query has been running for ${Math.round(row.total_elapsed_time / 1000)} seconds.`,
          details: { sessionId: row.session_id, query: row.query, elapsedTimeSec: Math.round(row.total_elapsed_time / 1000), status: row.status },
          timestamp: new Date().toISOString()
        });
      });

      // 3. Insights for Blocking Queries
      blockingRes.recordset.forEach((row, index) => {
        performanceInsights.push({
          id: `blocking_query_${index}`, type: 'blocking_query', severity: 'critical',
          title: `Query Blocking Detected`,
          message: `Session ${row.blocking_session_id} is blocking session ${row.blocked_session_id} for ${row.wait_duration_ms}ms.`,
          details: { ...row },
          timestamp: new Date().toISOString()
        });
      });
      
      const dbStats = dbStatsRes.recordset[0];
      return {
        kpi: {
          connections: connRes.recordset[0]?.value ?? 0,
          databaseSize: Math.round(dbStats?.total_size_mb || 0),
        },
        stats: {
          runningQueries: runningRes.recordset.length,
          blockingQueries: blockingRes.recordset.length,
          slowQueries: slowRes.recordset.length, // Represents historical slow queries
        },
        performanceInsights: performanceInsights,
      };

    } catch (err: any) {
      console.error("[MSSQL Driver] Metrics error:", err.message);
      return {
        kpi: { connections: 0 }, stats: {},
        performanceInsights: [{
          id: 'error_metrics_001', type: 'error', severity: 'critical',
          title: 'Metrics Collection Failed',
          message: 'Failed to fetch metrics. Ensure the user has VIEW SERVER STATE permission.',
          details: { error: err.message, hint: "GRANT VIEW SERVER STATE TO [your_user];" },
          timestamp: new Date().toISOString()
        }],
        error: `Failed to fetch metrics: ${err.message}`
      };
    }
  },

  /**
   * Retrieves detailed raw data for analysis across different performance aspects.
   */
  getQueryAnalysis: async (pool: AnyPool): Promise<QueryAnalysis> => {
    const mssqlPool = pool as ConnectionPool;
    try {
      const [runningRes, slowRes, blockingRes, waitRes] = await Promise.all([
        mssqlPool.request().query(SQL_QUERIES.runningQueries),
        mssqlPool.request().query(SQL_QUERIES.slowQueriesHistorical),
        mssqlPool.request().query(SQL_QUERIES.blockingQueries),
        mssqlPool.request().query(SQL_QUERIES.waitStats),
      ]);

      return {
        runningQueries: runningRes.recordset,
        slowQueries: slowRes.recordset, // Historical
        blockingQueries: blockingRes.recordset,
        waitStats: waitRes.recordset,
      };
    } catch (err: any) {
      console.error("MSSQL analysis error:", err.message);
      throw new Error(`Failed to get query analysis: ${err.message}`);
    }
  },

  /**
   * Generates specific optimization suggestions related to indexes.
   */
  getOptimizationSuggestions: async (pool: AnyPool): Promise<OptimizationSuggestions> => {
    const mssqlPool = pool as ConnectionPool;
    try {
      const [unusedRes, fragmentedRes, missingRes] = await Promise.all([
        mssqlPool.request().query(SQL_QUERIES.unusedIndexes),
        mssqlPool.request().query(SQL_QUERIES.fragmentedIndexes),
        mssqlPool.request().query(SQL_QUERIES.missingIndexes),
      ]);

      return {
        unusedIndexes: unusedRes.recordset,
        fragmentedIndexes: fragmentedRes.recordset,
        missingIndexes: missingRes.recordset,
      };
    } catch (err: any) {
      console.error("MSSQL optimization error:", err.message);
      throw new Error(`Failed to get optimization suggestions: ${err.message}`);
    }
  },

  /**
   * วิเคราะห์สุขภาพของฐานข้อมูลอย่างละเอียด
   */
  analyzeDatabaseHealth: async (pool: AnyPool): Promise<any> => {
    const mssqlPool = pool as ConnectionPool;
    
    try {
      console.log('[MSSQL Driver] Starting comprehensive database analysis...');
      
      const [system, connections, performance] = await Promise.all([
        mssqlPool.request().query(SQL_QUERIES.systemAnalysis),
        mssqlPool.request().query(SQL_QUERIES.connectionDetails),
        mssqlPool.request().query(SQL_QUERIES.performanceMetrics)
      ]);

      return {
        system: system.recordset[0],
        connections: {
          total: connections.recordset.length,
          active: connections.recordset.filter(c => c.status === 'running').length,
          details: connections.recordset
        },
        performance: performance.recordset[0],
        timestamp: new Date().toISOString()
      };

    } catch (err: any) {
      console.error('[MSSQL Driver] Analysis error:', err.message);
      throw new Error(`Database analysis failed: ${err.message}`);
    }
  }
};

export default mssqlDriver;

import { Driver as IDriver, Metrics, AnyPool, DatabaseAnalysis } from "@/types";

interface EnhancedDatabaseAnalysis extends DatabaseAnalysis {
  queryPerformance: {
    longRunning: any[];
    blocking: any[];
    resourceIntensive: any[];
    slowHistorical: any[];
  };
  systemHealth: {
    waitStats: any[];
    connections: any;
    performance: any;
  };
  storageAnalysis: {
    databaseSize: number;
    tablesSizes: any[];
    logSpace: any;
  };
}