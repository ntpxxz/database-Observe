// lib/connectionManager.ts
import sql, { ConnectionPool, config as SQLConfig } from 'mssql';
import { DatabaseInventory } from '@/types'; // ต้องมี interface config

// Global pool cache (per server by unique key = inventoryID or hash)
const poolMap: Map<string, ConnectionPool> = new Map();

/**
 * Convert a `DatabaseInventory` object to an MSSQL config
 */
function buildSqlConfig(db: DatabaseInventory): SQLConfig {
  return {
    user: db.connectionUsername,
    password: db.connectionPassword,
    server: db.serverHost,
    database: db.databaseName,
    port: db.port || 1433,
    options: {
      trustServerCertificate: true,
      encrypt: false,
      enableArithAbort: true
    },
    requestTimeout: 30000,
    connectionTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

/**
 * Main function to get or create connection pool for specific inventory
 */
export async function getSQLConnectionByInventory(db: DatabaseInventory): Promise<ConnectionPool> {
  const key = db.id || `${db.serverHost}:${db.databaseName}`;

  const existingPool = poolMap.get(key);
  if (existingPool && existingPool.connected) return existingPool;

  const config = buildSqlConfig(db);
  const newPool = new sql.ConnectionPool(config);

  try {
    await newPool.connect();
    newPool.on('error', err => {
      console.error(`MSSQL pool error for ${key}:`, err);
      poolMap.delete(key);
    });

    poolMap.set(key, newPool);
    console.log(`[✓] Connected MSSQL for ${key}`);
    return newPool;
  } catch (err) {
    console.error(`[X] Failed to connect MSSQL for ${key}:`, err);
    throw err;
  }
}

/**
 * Optional: disconnect all pools
 */
export async function disconnectAllSQLPools() {
  for (const [key, pool] of poolMap.entries()) {
    await pool.close();
    poolMap.delete(key);
    console.log(`Disconnected MSSQL pool: ${key}`);
  }
}
