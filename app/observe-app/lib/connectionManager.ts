// lib/connectionManager.ts
import { ConnectionPool as MSSQLConnectionPool, config as MSSQLNativeConfig } from "mssql";
import { Pool as PgPool, PoolConfig as PgNativeConfig } from "pg";
import mysql, { PoolOptions as MySQLNativeConfig } from "mysql2/promise";
import {
  AnyPool,
  DatabaseInventory,

  MSSQLPool,
  PostgreSQLPool,
  MySQLPool,
  // ไม่จำเป็นต้อง import *ConnectionConfig types ที่นี่ เพราะ build*Config จะคืนค่าเป็น native types
} from "@/types";

const poolMap = new Map<string, AnyPool>();

// ปรับปรุงให้ return ค่าที่เป็น native driver config type
function buildMSSQLConfig(db: DatabaseInventory): MSSQLNativeConfig {
  return {
    user: db.connectionUsername,
    password: db.credentialReference,
    server: db.serverHost || "localhost",
    port: db.port || 1433,
    database: db.databaseName || "master", // เพิ่ม database name
    options: {
      encrypt: db.encrypt ?? true, // ใช้ db.encrypt ถ้ามี หรือค่า default เป็น true
      enableArithAbort: true,
      trustServerCertificate: true,
      appName: 'ObserveApp-Monitorr',
    },
    requestTimeout: 30000,
    connectionTimeout: 30000,
    pool: { // ตรงกับโครงสร้าง pool ของ native mssql config
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

// ปรับปรุงให้ return ค่าที่เป็น native driver config type
function buildPostgreSQLConfig(db: DatabaseInventory): PgNativeConfig {
  return {
    user: db.connectionUsername,
    password: db.credentialReference,
    host: db.serverHost || "localhost",
    port: db.port || 5432,
    database: db.databaseName || "postgres", // เพิ่ม database name
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    // สามารถเพิ่ม ssl config ได้ที่นี่ หากต้องการ
  };
}

// ปรับปรุงให้ return ค่าที่เป็น native driver config type
function buildMySQLConfig(db: DatabaseInventory): MySQLNativeConfig {
  return {
    user: db.connectionUsername,
    password: db.credentialReference,
    host: db.serverHost || "localhost",
    port: db.port || 3306,
    database: db.databaseName || "", // เพิ่ม database name
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 30000,
    // idleTimeout ใน mysql2/promise มักจะถูกจัดการผ่าน connectionLimit/connectTimeout
  };
}

export async function getSQLConnectionByInventory(
  db: DatabaseInventory,
): Promise<AnyPool | null> {
  // ใช้ db.databaseType ตามที่นิยามใน @/types/index.ts
  const dbType = db.databaseType;

  const key = db.inventoryID || `${db.serverHost}:${db.systemName}`;

  const existing = poolMap.get(key);
  if (existing) {
    if (existing.type === "mssql" && !(existing as MSSQLPool).pool.connected) {
      poolMap.delete(key);
    } else {
      return existing;
    }
  }

  switch (dbType) {
    case "MSSQL": {
      const config = buildMSSQLConfig(db);
      const pool = new MSSQLConnectionPool(config);
      await pool.connect();

      pool.on("error", (err) => {
        console.error(`MSSQL pool error for ${key}:`, err);
        poolMap.delete(key);
      });

      const wrapped: MSSQLPool = { type: "mssql", pool };
      poolMap.set(key, wrapped);
      return wrapped;
    }
    case "POSTGRES": {
      const config = buildPostgreSQLConfig(db);
      const pool = new PgPool(config);
      pool.on("error", (err) => {
        console.error(`PostgreSQL pool error for ${key}:`, err);
        poolMap.delete(key);
      });
      const wrapped: PostgreSQLPool = { type: "postgresql", pool };
      poolMap.set(key, wrapped);
      return wrapped;
    }
    case "MYSQL": {
      const config = buildMySQLConfig(db);
      const pool = mysql.createPool(config);
      pool.on("error", (err) => {
        console.error(`MySQL pool error for ${key}:`, err);
        poolMap.delete(key);
      });
      const wrapped: MySQLPool = { type: "mysql", pool };
      poolMap.set(key, wrapped);
      return wrapped;
    }
    default:
      console.warn(`Unsupported database type: ${db.databaseType}`);
      return null;
  }
}

export async function queryAppDb(
  db: DatabaseInventory,
  queryTemplate: string,
  params: { [key: string]: any } = {},
) {
  const wrappedPool = await getSQLConnectionByInventory(db);

  if (!wrappedPool || wrappedPool.type !== "mssql") {
    throw new Error("queryAppDb only supports MSSQL connections.");
  }

  const pool = (wrappedPool as MSSQLPool).pool;
  const request = pool.request();

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      request.input(key, params[key]);
    }
  }

  return request.query(queryTemplate);
}

export async function disconnectAllSQLPools() {
  for (const [key, wrappedPool] of poolMap.entries()) {
    try {
      switch (wrappedPool.type) {
        case "mssql":
          await (wrappedPool as MSSQLPool).pool.close();
          break;
        case "postgresql":
          await (wrappedPool as PostgreSQLPool).pool.end();
          break;
        case "mysql":
          await (wrappedPool as MySQLPool).pool.end();
          break;
        default:
          console.warn(`Unknown pool type encountered during disconnect for ${key}.`);
      }
    } catch (err) {
      console.warn(`Error disconnecting pool for ${key}:`, err);
    }
    poolMap.delete(key);
  }
}