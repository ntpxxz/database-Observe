import sql, { ConnectionPool, config as SQLConfig } from "mssql";
import { DatabaseInventory } from "@/types";

const poolMap: Map<string, ConnectionPool> = new Map();

function buildSqlConfig(db: DatabaseInventory): SQLConfig {
  return {
    user: db.connectionUsername,
    password: db.credentialReference,
    server: db.serverHost || "localhost",
    database: "master",
    port: db.port || 1433,
    options: {
      trustServerCertificate: true,
      encrypt: false,
      enableArithAbort: true,
    },
    requestTimeout: 30000,
    connectionTimeout: 30000,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

export async function getSQLConnectionByInventory(
  db: DatabaseInventory,
): Promise<ConnectionPool> {
  const key = db.inventoryID || `${db.serverHost}:${db.systemName}`;
  const existingPool = poolMap.get(key);
  if (existingPool && existingPool.connected) return existingPool;

  const config = buildSqlConfig(db);
  const newPool = new sql.ConnectionPool(config);

  try {
    await newPool.connect();
    newPool.on("error", (err) => {
      console.error(`MSSQL pool error for ${key}:`, err);
      poolMap.delete(key);
    });
    poolMap.set(key, newPool);
    return newPool;
  } catch (err) {
    console.error(`Failed to connect MSSQL for ${key}:`, err);
    throw err;
  }
}

export async function queryAppDb(
  db: DatabaseInventory,
  queryTemplate: string,
  params: { [key: string]: any } = {},
) {
  const pool = await getSQLConnectionByInventory(db);
  const request = pool.request();

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      request.input(key, params[key]);
    }
  }

  return request.query(queryTemplate);
}

export async function disconnectAllSQLPools() {
  for (const [key, pool] of poolMap.entries()) {
    await pool.close();
    poolMap.delete(key);
  }
}
