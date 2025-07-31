// sqlQueries.ts - เพิ่ม Comments เพื่อระบุว่าเป็น Monitoring Queries

export const SQL_QUERIES = {
  connections: `
    /* ObserveApp-Monitor:Connections */
    SELECT COUNT(*) as connection_count 
    FROM sys.dm_exec_sessions 
    WHERE is_user_process = 1`,

  cacheHitRate: `
    /* ObserveApp-Monitor:CacheHitRate */
    SELECT 
      ROUND(
        (SELECT CAST(cntr_value AS FLOAT) FROM sys.dm_os_performance_counters WHERE counter_name = 'Buffer cache hit ratio' AND object_name LIKE '%Buffer Manager%') /
        (SELECT CAST(cntr_value AS FLOAT) FROM sys.dm_os_performance_counters WHERE counter_name = 'Buffer cache hit ratio base' AND object_name LIKE '%Buffer Manager%') * 100, 2
      ) as cache_hit_ratio_percent`,

  cpuPressure: `
    /* ObserveApp-Monitor:CPUPressure */
    SELECT 
      100 - AVG(record.value('(Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int')) as cpu_pressure_percent
    FROM (
      SELECT TOP 10 CONVERT(xml, record) as record
      FROM sys.dm_os_ring_buffers
      WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
        AND record LIKE '%<SystemHealth>%'
      ORDER BY timestamp DESC
    ) as rb`,
  serverMemoryUsage: `
    /* ObserveApp-Monitor:ServerMemoryUsage */
SELECT 
  (total_physical_memory_kb - available_physical_memory_kb) / 1024 AS used_memory_mb
FROM sys.dm_os_sys_memory;
  `,
  dbSize: `
    /* ObserveApp-Monitor:DatabaseSize */
    SELECT 
      SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS BIGINT) * 8.0 / 1024) as total_size_mb
    FROM sys.database_files`,

  longRunningQueries: `
    /* ObserveApp-Monitor:LongRunningQueries */
    SELECT 
      r.session_id,
      r.request_id,
      r.start_time,
      r.status,
      r.command,
      r.total_elapsed_time,
      r.percent_complete,
      s.program_name,
      s.login_name,
      s.host_name,
      SUBSTRING(st.text, (r.statement_start_offset/2)+1,
        ((CASE r.statement_end_offset
          WHEN -1 THEN DATALENGTH(st.text)
          ELSE r.statement_end_offset
          END - r.statement_start_offset)/2)+1) as current_query
    FROM sys.dm_exec_requests r
    INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
    WHERE r.total_elapsed_time > @threshold
      AND r.session_id != @@SPID`,

  blockingQueries: `
    /* ObserveApp-Monitor:BlockingQueries */
    SELECT 
      blocking.session_id as blocking_session_id,
      blocked.session_id as blocked_session_id,
      blocking_session.login_name as blocker_login,
      blocked_session.login_name as blocked_login,
      blocking_session.program_name as blocker_program,
      blocked_session.program_name as blocked_program,
      blocked.wait_duration_ms,
      blocked.wait_type,
      SUBSTRING(blocking_text.text, (blocking.statement_start_offset/2)+1,
        ((CASE blocking.statement_end_offset
          WHEN -1 THEN DATALENGTH(blocking_text.text)
          ELSE blocking.statement_end_offset
          END - blocking.statement_start_offset)/2)+1) as blocking_query,
      SUBSTRING(blocked_text.text, (blocked_req.statement_start_offset/2)+1,
        ((CASE blocked_req.statement_end_offset
          WHEN -1 THEN DATALENGTH(blocked_text.text)
          ELSE blocked_req.statement_end_offset
          END - blocked_req.statement_start_offset)/2)+1) as blocked_query
    FROM sys.dm_exec_requests blocked
    INNER JOIN sys.dm_exec_sessions blocked_session ON blocked.session_id = blocked_session.session_id
    INNER JOIN sys.dm_exec_requests blocking ON blocked.blocking_session_id = blocking.session_id
    INNER JOIN sys.dm_exec_sessions blocking_session ON blocking.session_id = blocking_session.session_id
    LEFT JOIN sys.dm_exec_requests blocked_req ON blocked.session_id = blocked_req.session_id
    CROSS APPLY sys.dm_exec_sql_text(blocking.sql_handle) blocking_text
    CROSS APPLY sys.dm_exec_sql_text(blocked_req.sql_handle) blocked_text
    WHERE blocked.blocking_session_id != 0`,

  slowQueriesHistorical: `
    /* ObserveApp-Monitor:SlowQueriesHistorical */
    SELECT TOP 20
      qs.query_hash,
      qs.execution_count as calls,
      qs.total_elapsed_time / qs.execution_count / 1000 as mean_exec_time_ms,
      qs.total_logical_reads / qs.execution_count as mean_logical_reads,
      qs.total_physical_reads / qs.execution_count as mean_physical_reads,
      qs.last_execution_time,
      SUBSTRING(qt.text, (qs.statement_start_offset/2)+1,
        ((CASE qs.statement_end_offset
          WHEN -1 THEN DATALENGTH(qt.text)
          ELSE qs.statement_end_offset
          END - qs.statement_start_offset)/2)+1) as query_text
    FROM sys.dm_exec_query_stats qs
    CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
    WHERE qs.total_elapsed_time / qs.execution_count > 1000000 -- 1 second
    ORDER BY mean_exec_time_ms DESC`,

  // Removed duplicate tempdbSessionUsage definition

  runningQueries: `
    /* ObserveApp-Monitor:RunningQueries */
    SELECT 
      r.session_id,
      r.request_id,
      r.start_time,
      r.status,
      r.command,
      r.total_elapsed_time,
      r.percent_complete,
      r.cpu_time,
      r.logical_reads,
      r.reads,
      r.writes,
      s.program_name,
      s.login_name,
      s.host_name,
      SUBSTRING(st.text, (r.statement_start_offset/2)+1,
        ((CASE r.statement_end_offset
          WHEN -1 THEN DATALENGTH(st.text)
          ELSE r.statement_end_offset
          END - r.statement_start_offset)/2)+1) as current_query
    FROM sys.dm_exec_requests r
    INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
    CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
    WHERE r.session_id != @@SPID`,

  waitStats: `
    /* ObserveApp-Monitor:WaitStats */
    SELECT TOP 20
      wait_type,
      waiting_tasks_count,
      wait_time_ms,
      max_wait_time_ms,
      signal_wait_time_ms,
      wait_time_ms - signal_wait_time_ms as resource_wait_time_ms
    FROM sys.dm_os_wait_stats
    WHERE wait_type NOT IN (
      'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SQLTRACE_BUFFER_FLUSH',
      'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'WAITFOR', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION',
      'CHECKPOINT_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH',
      'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT', 'DISPATCHER_QUEUE_SEMAPHORE',
      'FT_IFTS_SCHEDULER_IDLE_WAIT', 'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN'
    )
    ORDER BY wait_time_ms DESC`,

  unusedIndexes: `
    /* ObserveApp-Monitor:UnusedIndexes */
    SELECT 
      SCHEMA_NAME(o.schema_id) as schema_name,
      OBJECT_NAME(i.object_id) as table_name,
      i.name as index_name,
      i.type_desc as index_type,
      us.user_seeks,
      us.user_scans,
      us.user_lookups,
      us.user_updates
    FROM sys.indexes i
    INNER JOIN sys.objects o ON i.object_id = o.object_id
    LEFT JOIN sys.dm_db_index_usage_stats us ON i.object_id = us.object_id AND i.index_id = us.index_id
    WHERE o.type = 'U'
      AND i.type > 0
      AND (us.user_seeks + us.user_scans + us.user_lookups) = 0
      AND us.user_updates > 0
    ORDER BY us.user_updates DESC`,

  fragmentedIndexes: `
    /* ObserveApp-Monitor:FragmentedIndexes */
    SELECT TOP 20
      SCHEMA_NAME(o.schema_id) as schema_name,
      OBJECT_NAME(ips.object_id) as table_name,
      i.name as index_name,
      ips.avg_fragmentation_in_percent,
      ips.page_count,
      ips.record_count
    FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
    INNER JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
    INNER JOIN sys.objects o ON ips.object_id = o.object_id
    WHERE ips.avg_fragmentation_in_percent > 30
      AND ips.page_count > 100
      AND o.type = 'U'
    ORDER BY ips.avg_fragmentation_in_percent DESC`,

  missingIndexes: `
    /* ObserveApp-Monitor:MissingIndexes */
    SELECT TOP 20
      mid.statement as table_name,
      migs.avg_total_user_cost * (migs.avg_user_impact / 100.0) * (migs.user_seeks + migs.user_scans) as improvement_measure,
      'CREATE INDEX [IX_' + REPLACE(REPLACE(REPLACE(ISNULL(mid.equality_columns,''),', ','_'),'[',''),']','') + 
      CASE WHEN mid.inequality_columns IS NOT NULL THEN '_' + REPLACE(REPLACE(REPLACE(mid.inequality_columns,', ','_'),'[',''),']','') ELSE '' END + '] ON ' + mid.statement +
      ' (' + ISNULL(mid.equality_columns,'') + 
      CASE WHEN mid.equality_columns IS NOT NULL AND mid.inequality_columns IS NOT NULL THEN ',' ELSE '' END +
      ISNULL(mid.inequality_columns, '') + ')' + 
      ISNULL(' INCLUDE (' + mid.included_columns + ')', '') as create_index_statement,
      migs.user_seeks,
      migs.user_scans,
      migs.avg_total_user_cost,
      migs.avg_user_impact
    FROM sys.dm_db_missing_index_details mid
    INNER JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
    INNER JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
    WHERE migs.avg_total_user_cost * (migs.avg_user_impact / 100.0) * (migs.user_seeks + migs.user_scans) > 10
    ORDER BY improvement_measure DESC`,

  systemAnalysis: `
    /* ObserveApp-Monitor:SystemAnalysis */
    SELECT 
      @@SERVERNAME as server_name,
      @@VERSION as sql_version,
      (SELECT COUNT(*) FROM sys.databases WHERE state = 0) as online_databases,
      (SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1) as total_sessions,
      DATEDIFF(minute, sqlserver_start_time, GETDATE()) as uptime_minutes
    FROM sys.dm_os_sys_info`,

  connectionDetails: `
    /* ObserveApp-Monitor:ConnectionDetails */
    SELECT 
      s.session_id,
      s.login_name,
      s.program_name,
      s.host_name,
      s.client_interface_name,
      c.client_net_address,
      s.login_time,
      s.last_request_start_time,
      s.last_request_end_time,
      s.status,
      s.reads,
      s.writes,
      s.logical_reads
    FROM sys.dm_exec_sessions s
    LEFT JOIN sys.dm_exec_connections c ON s.session_id = c.session_id
    WHERE s.is_user_process = 1`,

  performanceMetrics: `
    /* ObserveApp-Monitor:PerformanceMetrics */
    SELECT 
      (SELECT cntr_value FROM sys.dm_os_performance_counters WHERE counter_name = 'Batch Requests/sec') as batch_requests_per_sec,
      (SELECT cntr_value FROM sys.dm_os_performance_counters WHERE counter_name = 'SQL Compilations/sec') as compilations_per_sec,
      (SELECT cntr_value FROM sys.dm_os_performance_counters WHERE counter_name = 'SQL Re-Compilations/sec') as recompilations_per_sec,
      (SELECT cntr_value FROM sys.dm_os_performance_counters WHERE counter_name = 'Transactions/sec' AND instance_name = '_Total') as transactions_per_sec`,

  tempdbUsage: `
    /* ObserveApp-Monitor:TempDBUsage */
    SELECT 
      SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS BIGINT) * 8.0 / 1024) as used_space_mb,
      SUM(size * 8.0 / 1024) as total_space_mb,
      SUM(size * 8.0 / 1024) - SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS BIGINT) * 8.0 / 1024) as free_space_mb
    FROM tempdb.sys.database_files
    WHERE type_desc = 'ROWS'`,
  tempdbSessionUsage: `
    SELECT TOP 20
      s.session_id,
      s.login_name,
      s.host_name,
      s.program_name,
      (tsu.user_objects_alloc_page_count + tsu.internal_objects_alloc_page_count) * 8 / 1024.0 as usage_mb,
      tsu.user_objects_alloc_page_count * 8 / 1024.0 as user_objects_mb,
      tsu.internal_objects_alloc_page_count * 8 / 1024.0 as internal_objects_mb,
      req_text.text as current_query
    FROM sys.dm_db_session_space_usage AS tsu
    INNER JOIN sys.dm_exec_sessions AS s ON tsu.session_id = s.session_id
    LEFT JOIN sys.dm_exec_requests AS req ON s.session_id = req.session_id
    OUTER APPLY sys.dm_exec_sql_text(req.sql_handle) AS req_text
    WHERE (tsu.user_objects_alloc_page_count + tsu.internal_objects_alloc_page_count) > 0
      AND s.session_id <> @@SPID
      -- Filter out sessions from the monitoring application
      AND s.program_name <> 'ObserveApp'
    ORDER BY usage_mb DESC
  `,

  deadlockAnalysis: `
    WITH DeadlockEvents AS (
      SELECT
        CAST(event_data AS xml) AS event_xml,
        file_name,
        file_offset
      FROM sys.fn_xe_file_target_read_file('system_health*.xel', NULL, NULL, NULL)
      WHERE object_name = 'xml_deadlock_report'
    )
    SELECT TOP 10
      event_xml.value('(/event/@timestamp)[1]', 'datetime2') AS deadlock_time,
      event_xml.value('(/event/data[@name="xml_report"]/value/deadlock/process-list/process/@id)[1]', 'varchar(100)') AS process_id_1,
      event_xml.value('(/event/data[@name="xml_report"]/value/deadlock/process-list/process/@id)[2]', 'varchar(100)') AS process_id_2,
      event_xml.value('(/event/data[@name="xml_report"]/value/deadlock/process-list/process/inputbuf)[1]', 'nvarchar(max)') AS query_1,
      event_xml.value('(/event/data[@name="xml_report"]/value/deadlock/process-list/process/inputbuf)[2]', 'nvarchar(max)') AS query_2,
      event_xml.value('(/event/data[@name="xml_report"]/value/deadlock/resource-list/objectlock/@objectname)[1]', 'sysname') as locked_resource,
      event_xml AS deadlock_graph
    FROM DeadlockEvents
    ORDER BY deadlock_time DESC
  `,
  databaseInfo: `
 SELECT 
  d.name,
  d.state_desc,
  d.recovery_model_desc,
  d.compatibility_level,
  d.collation_name,
  d.create_date,
  CAST(SUM(mf.size) * 8.0 / 1024 AS DECIMAL(18,2)) AS sizeMB
FROM 
  sys.databases d
JOIN 
  sys.master_files mf ON d.database_id = mf.database_id
GROUP BY 
  d.name, d.state_desc, d.recovery_model_desc, d.compatibility_level, d.collation_name, d.create_date
ORDER BY 
  sizeMB DESC;
;`,
};

export type SqlQueries = typeof SQL_QUERIES;
