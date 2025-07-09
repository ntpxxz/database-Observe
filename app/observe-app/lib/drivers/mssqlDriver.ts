// mssqlDriver.ts - Optimized version with proper API structure

import sql, { ConnectionPool, IResult } from "mssql";
import {
  Driver as IDriver,
  Metrics,
  QueryAnalysis,
  OptimizationSuggestions,
  PerformanceInsight,
  AnyPool,
  DatabaseConnectionConfig,
} from "@/types";
import { SQL_QUERIES } from "@/lib/sqlQueries"; // Import externalized queries
// Constants
const HIGH_TEMPDB_USAGE_MB = 100;
const LONG_RUNNING_THRESHOLD_MS = 5000;

const createInsight = (
  data: any,
  type: PerformanceInsight["type"],
  title: string,
  messageBuilder: (d: any) => string,
  severity: PerformanceInsight['severity'] = 'warning'
): PerformanceInsight => {
  const actualQuery =
    data.query_1 ||
    data.query_2 ||
    data.current_query ||
    data.query_text ||
    data.blocking_query ||
    data.query ||
    data.details?.query ||
    'N/A';

  const filteredData = { ...data };
  delete filteredData.query_text;
  delete filteredData.blocking_query;
  delete filteredData.query_1;
  delete filteredData.query_2;
  delete filteredData.current_query;
  delete filteredData.query;

  return {
    id: `${type}_${data.session_id || data.blocking_session_id || data.process_id_1 || Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    message: messageBuilder(data),
    details: {
      ...filteredData,
      query: actualQuery,
    },
    severity,
    timestamp: new Date().toISOString(),
  };
};

const isUserQuery = (q: any): boolean => {
  const programName = String(q.program_name || '').toLowerCase();
  const loginName = String(q.login_name || '').toLowerCase();
  const queryText = String(
    q.query_text || 
    q.current_query || 
    q.blocking_query || 
    q.query_1 || 
    q.query_2 || 
    q.query || 
    ''
  ).toLowerCase();

  const systemPrograms = [
    'observeapp',
    'sqlcmd',
    'ssms',
    'azure data studio',
    'microsoft sql server management studio',
    'datagrip',
    'dbeaver'
  ];

  if (systemPrograms.some(sys => programName.includes(sys))) {
    return false;
  }

  const systemQueryPatterns = [
    'dm_exec_', 'sys.dm_', 'dm_os_', 'dm_db_',
    'observeapp', 'health-check', 'monitor',
    'performance_counters', 'wait_stats',
    'sys.databases', 'sys.dm_exec_sessions',
    'sys.dm_exec_requests', 'sys.dm_exec_query_stats'
  ];

  if (systemQueryPatterns.some(pattern => queryText.includes(pattern))) {
    return false;
  }

  const systemLogins = ['monitor', 'system', 'health', 'observeapp'];
  if (systemLogins.some(sys => loginName.includes(sys))) {
    return false;
  }

  if (!programName && !queryText.trim()) {
    return false;
  }

  return true;
};


function generateInsights(data: {
  slowQueries: any[];
  runningQueries: any[];
  blockingQueries: any[];
  deadlocks: any[];
  tempdbUsage: any[];
}): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];

  data.slowQueries
    .filter(isUserQuery)
    .forEach(q => {
      insights.push(createInsight(q, 'slow_query', 'Slow Historical Query Detected', d => `Query averaging ${Math.round(d.mean_exec_time_ms / 1000)}s over ${d.calls} executions`));
    });

  data.runningQueries
    .filter(q => q.total_elapsed_time > LONG_RUNNING_THRESHOLD_MS)
    .filter(isUserQuery)
    .forEach(q => {
      insights.push(createInsight(q, 'long_running_query', 'Long Running Query', d => `Query has been running for ${Math.round(d.total_elapsed_time / 1000)}s (${d.percent_complete || 0}% complete)`));
    });

  data.blockingQueries
    .filter(isUserQuery)
    .forEach(q => {
      insights.push(createInsight(q, 'blocking_query', 'Query Blocking Detected', d => `Session ${d.blocking_session_id} (${d.blocker_login}) is blocking session ${d.blocked_session_id} (${d.blocked_login}) for ${Math.round(d.wait_duration_ms / 1000)}s`, 'critical'));
    });

  data.deadlocks.forEach(d => {
    insights.push(createInsight(d, 'deadlock_event', 'Deadlock Event Detected', d => `Deadlock occurred at ${d.deadlock_time} involving processes ${d.process_id_1} and ${d.process_id_2}`, 'critical'));
  });

  data.tempdbUsage
    .filter(t => t.usage_mb > HIGH_TEMPDB_USAGE_MB)
    .filter(isUserQuery)
    .forEach(t => {
      insights.push(createInsight(t, 'high_tempdb_usage', 'High TempDB Usage', d => `Session ${d.session_id} (${d.login_name}) is using ${Math.round(d.usage_mb)} MB of TempDB space`));
    });

  return insights;
}

const LIST_DATABASES_QUERY = `
  SELECT name FROM sys.databases
  WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
  ORDER BY name
`;

const mssqlDriver: IDriver = {
  // In mssqlDriver.ts
  connect: async (config: DatabaseConnectionConfig): Promise<AnyPool> => {
    const pool = new sql.ConnectionPool({
      server: config.server,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
      connectionTimeout: config.connectionTimeout || 30000,
      requestTimeout: config.requestTimeout || 30000,
      options: {
        encrypt: config.encrypt || false,
        trustServerCertificate: true,
        enableArithAbort: true,
        appName: 'ObserveApp-Monitor'
      },
      pool: {
        max: config.poolMax || 10,
        min: config.poolMin || 0,
        idleTimeoutMillis: config.idleTimeout || 30000
      }
    });

    await pool.connect();
    return pool;
  },


  disconnect: async (pool: AnyPool): Promise<void> => {
    await (pool as ConnectionPool).close();
  },

  getDatabases: async (pool: AnyPool): Promise<string[]> => {
    const mssqlPool = pool as ConnectionPool;
    const result = await mssqlPool.request().query(LIST_DATABASES_QUERY);
    return result.recordset.map((row: any) => row.name);
  },

  getMetrics: async (pool: AnyPool): Promise<Partial<Metrics>> => {
    const mssqlPool = pool as ConnectionPool;
    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.connections),
      mssqlPool.request().query(SQL_QUERIES.cacheHitRate),
      mssqlPool.request().query(SQL_QUERIES.cpuPressure),
      mssqlPool.request().query(SQL_QUERIES.dbSize),
      mssqlPool.request().input("threshold", sql.Int, LONG_RUNNING_THRESHOLD_MS).query(SQL_QUERIES.longRunningQueries),
      mssqlPool.request().query(SQL_QUERIES.blockingQueries),
      mssqlPool.request().query(SQL_QUERIES.slowQueriesHistorical),
      mssqlPool.request().query(SQL_QUERIES.deadlockAnalysis),
      mssqlPool.request().query(SQL_QUERIES.tempdbSessionUsage),
      mssqlPool.request().query(SQL_QUERIES.databaseInfo),
    ]);
    const getResult = (r: PromiseSettledResult<IResult<any>>) => r.status === 'fulfilled' ? r.value.recordset : [];

    const insights = generateInsights({
      runningQueries: getResult(results[4]),
      blockingQueries: getResult(results[5]),
      slowQueries: getResult(results[6]),
      deadlocks: getResult(results[7]),
      tempdbUsage: getResult(results[8]),
    });

    return {
      kpi: {
        connections: getResult(results[0])[0]?.connection_count || 0,
        cpu: Math.round(100 - (getResult(results[2])[0]?.cpu_pressure_percent || 0))
      },
      stats: {
        cache_hit_rate: Math.round(getResult(results[1])[0]?.cache_hit_ratio_percent || 0),
        databaseSize: Math.round(getResult(results[3])[0]?.total_size_mb || 0),
      },
      performanceInsights: insights,

      databaseInfo: getResult(results[9]).map(db => ({
        name: db.name,
        sizeMB: db.sizeMB,
        state: db.state_desc || 'ONLINE',
        recoveryModel: db.recovery_model_desc,
        compatibilityLevel: db.compatibility_level,
        collation: db.collation_name,
        createdDate: db.create_date,
      }))
      
      
    };
  },

  getQueryAnalysis: async (pool: AnyPool): Promise<QueryAnalysis> => {
    const mssqlPool = pool as ConnectionPool;
    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.runningQueries),
      mssqlPool.request().query(SQL_QUERIES.slowQueriesHistorical),
      mssqlPool.request().query(SQL_QUERIES.blockingQueries),
      mssqlPool.request().query(SQL_QUERIES.waitStats),
      mssqlPool.request().query(SQL_QUERIES.deadlockAnalysis),
      mssqlPool.request().query(SQL_QUERIES.tempdbSessionUsage),
    ]);
    const getResult = (r: PromiseSettledResult<IResult<any>>) => r.status === 'fulfilled' ? r.value.recordset : [];
    return {
      runningQueries: getResult(results[0]).filter(isUserQuery),
      slowQueries: getResult(results[1]).filter(isUserQuery),
      blockingQueries: getResult(results[2]).filter(isUserQuery),
      waitStats: getResult(results[3]),
      deadlocks: getResult(results[4]),
      tempdbUsage: getResult(results[5]).filter(isUserQuery),   
      
    };
  },

  getOptimizationSuggestions: async (pool: AnyPool): Promise<OptimizationSuggestions> => {
    const mssqlPool = pool as ConnectionPool;
    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.unusedIndexes),
      mssqlPool.request().query(SQL_QUERIES.fragmentedIndexes),
      mssqlPool.request().query(SQL_QUERIES.missingIndexes),
    ]);
    const getResult = (r: PromiseSettledResult<IResult<any>>) => r.status === 'fulfilled' ? r.value.recordset : [];
    return {
      unusedIndexes: getResult(results[0]),
      fragmentedIndexes: getResult(results[1]),
      missingIndexes: getResult(results[2]),
    };
  },

  analyzeDatabaseHealth: async (pool: AnyPool): Promise<any> => {
    const mssqlPool = pool as ConnectionPool;
    const results = await Promise.allSettled([
      mssqlPool.request().query(SQL_QUERIES.systemAnalysis),
      mssqlPool.request().query(SQL_QUERIES.connectionDetails),
      mssqlPool.request().query(SQL_QUERIES.performanceMetrics),
      mssqlPool.request().query(SQL_QUERIES.tempdbUsage),
    ]);
    const getResult = (r: PromiseSettledResult<IResult<any>>) => r.status === 'fulfilled' ? r.value.recordset : [];
    const connections = getResult(results[1]);
    const tempdb = getResult(results[3])[0] || {};

    const userConnections = connections.filter(isUserQuery);
    const programs = connections.map(c => ({
      from: c.client_net_address ?? 'unknown',
      details: c.program_name ?? 'unknown'
    }));

    return {
      system: getResult(results[0])[0] || {},
      connections: {
        total: connections.length,
        active: connections.filter(c => c.status === "running").length,
        user_connections: userConnections.length,
        details: userConnections,
        programs,
      },
      performance: getResult(results[2])[0] || {},
      tempdb: {
        ...tempdb,
        usage_percentage: tempdb.total_space_mb > 0
          ? Math.round(((tempdb.total_space_mb - tempdb.free_space_mb) / tempdb.total_space_mb) * 100)
          : 0
      },
      timestamp: new Date().toISOString(),
    };
  },
  getProblemQueries: function (pool: AnyPool): Promise<any> {
    throw new Error("Function not implemented.");
  },
  getPerformanceInsights: function (pool: AnyPool): Promise<PerformanceInsight[] | { error: string; }> {
    throw new Error("Function not implemented.");
  }
};

export default mssqlDriver;
