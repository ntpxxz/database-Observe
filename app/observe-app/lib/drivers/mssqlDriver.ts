import sql, { ConnectionPool } from 'mssql';
import { Driver as IDriver, Metrics, AnyPool, PerformanceInsight } from '@/types';

const mssqlDriver: IDriver = {
    
    connect: async (config: any): Promise<AnyPool> => {
     
        if (typeof config.server !== 'string') {
            throw new Error(`Invalid config.server: ${typeof config.server}. Must be a string.`);
        }
        
        console.log("Connecting to MSSQL with config:", config.server, config.port, config.database);
        
        const pool = new sql.ConnectionPool({
            server: config.server,          // ใช้ config.server
            user: config.user,              // เปลี่ยนจาก connectionUsername
            password: config.password,      // เปลี่ยนจาก credentialReference  
            database: config.database,      // เปลี่ยนจาก databaseName
            port: config.port,
            options: config.options || {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            },
            connectionTimeout: config.connectionTimeout || 10000
        });
        
        return await pool.connect();
    },

    disconnect: async (pool: AnyPool): Promise<void> => {
        await (pool as ConnectionPool).close();
    },

    getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
        const mssqlPool = pool as ConnectionPool;
        const QUERIES = {
            connections: "SELECT count(session_id) as value FROM sys.dm_exec_sessions WHERE status = 'running'",
            by_total_time: `
                SELECT TOP 10
                    SUBSTRING(st.text, (qs.statement_start_offset/2) + 1, 
                    ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) ELSE qs.statement_end_offset END - qs.statement_start_offset)/2) + 1) AS query,
                    qs.total_worker_time / 1000 AS total_exec_time_ms,
                    qs.execution_count AS calls,
                    (qs.total_worker_time / qs.execution_count) / 1000 AS mean_exec_time_ms
                FROM sys.dm_exec_query_stats AS qs
                CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
                ORDER BY qs.total_worker_time DESC;
            `,
            by_io: `
                SELECT TOP 10
                    SUBSTRING(st.text, (qs.statement_start_offset/2) + 1, 
                    ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) ELSE qs.statement_end_offset END - qs.statement_start_offset)/2) + 1) AS query,
                    (qs.total_physical_reads + qs.total_logical_reads) as io_read,
                    qs.execution_count AS calls
                FROM sys.dm_exec_query_stats AS qs
                CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
                ORDER BY (qs.total_physical_reads + qs.total_logical_reads) DESC;
            `
        };

        try {
            const [connRes, timeRes, ioRes] = await Promise.all([
                mssqlPool.request().query(QUERIES.connections),
                mssqlPool.request().query(QUERIES.by_total_time),
                mssqlPool.request().query(QUERIES.by_io),
            ]);
            
            return {
                kpi: { connections: connRes.recordset[0]?.value ?? 0 },
                performanceInsights: {
                    byTotalTime: timeRes.recordset as PerformanceInsight[],
                    byIo: ioRes.recordset as PerformanceInsight[],
                }
            };
        } catch (err: any) {
             console.error("MSSQL metrics error:", err.message);
             return { 
                performanceInsights: { 
                    byTotalTime: [], 
                    byIo: [],
                    error: "Failed to fetch metrics. Ensure the user has 'VIEW SERVER STATE' permission."
                } 
            };
        }
    },
// ดึงข้อมูลการทำงานสำหรับการวิเคราะห์
    getQueryAnalysis: async (pool: AnyPool): Promise<QueryAnalysis> => {
        const mssqlPool = pool as ConnectionPool;
        
        const QUERIES = {
            // คิวรีที่กำลังรันอยู่
            runningQueries: `
                SELECT 
                    s.session_id as sessionId,
                    s.login_name as loginName,
                    s.host_name as hostName,
                    s.program_name as programName,
                    r.status,
                    r.command,
                    r.start_time as startTime,
                    r.total_elapsed_time as elapsedTime,
                    r.cpu_time as cpuTime,
                    r.logical_reads as logicalReads,
                    r.writes,
                    SUBSTRING(st.text, (r.statement_start_offset/2) + 1, 
                        ((CASE r.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) 
                          ELSE r.statement_end_offset END - r.statement_start_offset)/2) + 1) AS query
                FROM sys.dm_exec_sessions s
                INNER JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
                CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
                WHERE s.is_user_process = 1 AND r.status <> 'sleeping'
                ORDER BY r.total_elapsed_time DESC;
            `,

            // คิวรีที่ช้าที่สุด (Top 20)
            slowQueries: `
                SELECT TOP 20
                    SUBSTRING(st.text, (qs.statement_start_offset/2) + 1, 
                        ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(st.text) 
                          ELSE qs.statement_end_offset END - qs.statement_start_offset)/2) + 1) AS query,
                    qs.total_worker_time / 1000 AS totalExecutionTime,
                    (qs.total_worker_time / qs.execution_count) / 1000 AS avgExecutionTime,
                    qs.execution_count as executionCount,
                    qs.total_logical_reads as totalLogicalReads,
                    qs.total_logical_reads / qs.execution_count AS avgLogicalReads,
                    qs.last_execution_time as lastExecutionTime
                FROM sys.dm_exec_query_stats AS qs
                CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS st
                ORDER BY qs.total_worker_time DESC;
            `,

            // คิวรีที่ Blocking กัน
            blockingQueries: `
                SELECT 
                    blocking.session_id as blockingSessionId,
                    blocked.session_id as blockedSessionId,
                    blocking_text.text as blockingQuery,
                    blocked_text.text as blockedQuery,
                    blocked.wait_time as waitTime,
                    blocked.wait_type as waitType
                FROM sys.dm_exec_requests blocked
                INNER JOIN sys.dm_exec_sessions blocking ON blocked.blocking_session_id = blocking.session_id
                CROSS APPLY sys.dm_exec_sql_text(blocked.sql_handle) blocked_text
                CROSS APPLY sys.dm_exec_sql_text(blocking.most_recent_sql_handle) blocking_text
                WHERE blocked.blocking_session_id <> 0;
            `,

            // การใช้ทรัพยากรแต่ละฐานข้อมูล
            resourceUsage: `
                SELECT 
                    DB_NAME(database_id) as databaseName,
                    CAST(SUM(cpu_time_ms) * 100.0 / SUM(SUM(cpu_time_ms)) OVER() AS DECIMAL(5,2)) as cpuPercent,
                    CAST(SUM(logical_reads + physical_reads) * 100.0 / SUM(SUM(logical_reads + physical_reads)) OVER() AS DECIMAL(5,2)) as ioPercent,
                    SUM(log_bytes_used) / 1024 / 1024 as logSpaceUsed,
                    SUM(tempdb_allocations) / 128 as tempdbUsage
                FROM sys.dm_exec_query_stats qs
                CROSS APPLY sys.dm_exec_plan_attributes(qs.plan_handle) pa
                WHERE pa.attribute = 'dbid'
                GROUP BY database_id
                ORDER BY cpuPercent DESC;
            `,

            // การใช้งาน Index
            indexUsage: `
                SELECT TOP 50
                    OBJECT_NAME(ius.object_id) as tableName,
                    i.name as indexName,
                    ius.user_seeks as userSeeks,
                    ius.user_scans as userScans,
                    ius.user_lookups as userLookups,
                    ius.user_updates as userUpdates,
                    ius.last_user_seek as lastUserSeek,
                    (SELECT SUM(used_page_count) * 8 / 1024 
                     FROM sys.dm_db_partition_stats ps 
                     WHERE ps.object_id = ius.object_id AND ps.index_id = ius.index_id) as sizeMB
                FROM sys.dm_db_index_usage_stats ius
                INNER JOIN sys.indexes i ON ius.object_id = i.object_id AND ius.index_id = i.index_id
                WHERE ius.database_id = DB_ID()
                ORDER BY (ius.user_seeks + ius.user_scans + ius.user_lookups) DESC;
            `,

            // Wait Statistics
            waitStats: `
                SELECT TOP 20
                    wait_type as waitType,
                    waiting_tasks_count as waitingTasksCount,
                    wait_time_ms as waitTimeMs,
                    max_wait_time_ms as maxWaitTimeMs,
                    signal_wait_time_ms as signalWaitTimeMs
                FROM sys.dm_os_wait_stats
                WHERE wait_type NOT IN (
                    'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SLEEP_TASK',
                    'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH', 'WAITFOR', 'LOGMGR_QUEUE',
                    'CHECKPOINT_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT'
                )
                ORDER BY wait_time_ms DESC;
            `
        };

        try {
            const [runningRes, slowRes, blockingRes, resourceRes, indexRes, waitRes] = await Promise.all([
                mssqlPool.request().query(QUERIES.runningQueries),
                mssqlPool.request().query(QUERIES.slowQueries),
                mssqlPool.request().query(QUERIES.blockingQueries),
                mssqlPool.request().query(QUERIES.resourceUsage),
                mssqlPool.request().query(QUERIES.indexUsage),
                mssqlPool.request().query(QUERIES.waitStats)
            ]);

            return {
                runningQueries: runningRes.recordset,
                slowQueries: slowRes.recordset,
                blockingQueries: blockingRes.recordset,
                resourceUsage: resourceRes.recordset,
                indexUsage: indexRes.recordset,
                waitStats: waitRes.recordset
            };
        } catch (err: any) {
            console.error("MSSQL analysis error:", err.message);
            throw new Error(`Failed to get query analysis: ${err.message}`);
        }
    },

    // ฟังก์ชันแนะนำการ Optimize
    getOptimizationSuggestions: async (pool: AnyPool): Promise<any> => {
        const mssqlPool = pool as ConnectionPool;
        
        const OPTIMIZATION_QUERIES = {
            // Index ที่ไม่ถูกใช้งาน
            unusedIndexes: `
                SELECT 
                    OBJECT_NAME(i.object_id) as tableName,
                    i.name as indexName,
                    ps.used_page_count * 8 / 1024 as sizeMB,
                    'Consider dropping - never used' as suggestion
                FROM sys.indexes i
                LEFT JOIN sys.dm_db_index_usage_stats ius ON i.object_id = ius.object_id AND i.index_id = ius.index_id
                INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
                WHERE ius.index_id IS NULL AND i.type > 0 AND i.is_primary_key = 0 AND i.is_unique_constraint = 0
                ORDER BY sizeMB DESC;
            `,

            // Index ที่ต้อง Rebuild
            fragmentedIndexes: `
                SELECT 
                    OBJECT_NAME(ips.object_id) as tableName,
                    i.name as indexName,
                    ips.avg_fragmentation_in_percent as fragmentation,
                    ips.page_count,
                    CASE 
                        WHEN ips.avg_fragmentation_in_percent > 30 THEN 'REBUILD recommended'
                        WHEN ips.avg_fragmentation_in_percent > 10 THEN 'REORGANIZE recommended'
                        ELSE 'OK'
                    END as suggestion
                FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
                INNER JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
                WHERE ips.avg_fragmentation_in_percent > 10 AND ips.page_count > 1000
                ORDER BY ips.avg_fragmentation_in_percent DESC;
            `,

            // Missing Indexes
            missingIndexes: `
                SELECT TOP 10
                    mid.statement as tableName,
                    mid.equality_columns,
                    mid.inequality_columns,
                    mid.included_columns,
                    migs.avg_total_user_cost * (migs.avg_user_impact / 100.0) * (migs.user_seeks + migs.user_scans) as improvement_measure,
                    'CREATE INDEX IX_' + REPLACE(REPLACE(REPLACE(mid.statement, '[', ''), ']', ''), '.', '_') + '_' + 
                    CAST(NEWID() AS VARCHAR(36)) + ' ON ' + mid.statement + ' (' + 
                    ISNULL(mid.equality_columns, '') + 
                    CASE WHEN mid.equality_columns IS NOT NULL AND mid.inequality_columns IS NOT NULL THEN ',' ELSE '' END +
                    ISNULL(mid.inequality_columns, '') + ')' +
                    CASE WHEN mid.included_columns IS NOT NULL THEN ' INCLUDE (' + mid.included_columns + ')' ELSE '' END as suggested_index
                FROM sys.dm_db_missing_index_details mid
                INNER JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
                INNER JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
                ORDER BY improvement_measure DESC;
            `
        };

        try {
            const [unusedRes, fragmentedRes, missingRes] = await Promise.all([
                mssqlPool.request().query(OPTIMIZATION_QUERIES.unusedIndexes),
                mssqlPool.request().query(OPTIMIZATION_QUERIES.fragmentedIndexes),
                mssqlPool.request().query(OPTIMIZATION_QUERIES.missingIndexes)
            ]);

            return {
                unusedIndexes: unusedRes.recordset,
                fragmentedIndexes: fragmentedRes.recordset,
                missingIndexes: missingRes.recordset
            };
        } catch (err: any) {
            console.error("MSSQL optimization error:", err.message);
            throw new Error(`Failed to get optimization suggestions: ${err.message}`);
        }
    }

  }
export default mssqlDriver;

