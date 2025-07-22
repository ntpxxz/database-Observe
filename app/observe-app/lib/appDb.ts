import sql from "mssql";
import { DatabaseInventory } from "@/types";

const config: sql.config = {
  user: process.env.MSSQL_USER || "sa",
  password: process.env.MSSQL_PASSWORD || "123456",
  server: process.env.MSSQL_HOST || "localhost",
  database: process.env.MSSQL_DATABASE || "IT_ManagementDB",
  options: {
    trustServerCertificate: true,
    encrypt: true,
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

declare global {
  var appDbPool: Promise<sql.ConnectionPool> | undefined;
}

function getAppDbConnection(): Promise<sql.ConnectionPool> {
  if (!global.appDbPool) {
    global.appDbPool = new sql.ConnectionPool(config)
      .connect()
      .then((pool) => {
        console.log("Connected to App DB");
        pool.on("error", (err) => console.error("App DB Pool Error:", err));
        return pool;
      })
      .catch((err) => {
        console.error("Failed to connect to App DB:", err);
        global.appDbPool = undefined;
        throw err;
      });
  }
  return global.appDbPool;
}

export async function queryAppDb(
  queryTemplate: string,
  params: { [key: string]: any } = {},
) {
  const pool = await getAppDbConnection();
  const request = pool.request();

  for (const key in params) {
    request.input(key, params[key]);
  }

  return request.query(queryTemplate);
}
export async function getInventoryById(id: string) {
  const result = await queryAppDb(
    `SELECT 
      InventoryID as inventoryID,
      SystemName as systemName,
      ServerHost as serverHost,
      Port as port,
      Zone as zone,
      DatabaseType as databaseType,
      ConnectionUsername as connectionUsername,
      CredentialReference as credentialReference
    FROM IT_ManagementDB.dbo.DatabaseInventory
    WHERE InventoryID = @id`,
    { id },
  );

  if (!result.recordset[0]) {
    throw new Error(`Inventory ID not found: ${id}`);
  }

  return result.recordset[0];
}

export async function updateInventoryById(id: string, data: DatabaseInventory) {
  await queryAppDb(
    `UPDATE IT_ManagementDB.dbo.DatabaseInventory SET
      SystemName = @systemName,
      ServerHost = @serverHost,
      Port = @port,
      Zone = @zone,
      DatabaseType = @databaseType,
      ConnectionUsername = @connectionUsername,
      CredentialReference = @credentialReference,
      PurposeNotes = @purposeNotes,
      OwnerContact = @ownerContact
    WHERE InventoryID = @inventoryID`,
    {
      inventoryID: id,
      systemName: data.systemName,
      serverHost: data.serverHost,
      port: data.port,
      zone: data.zone,
      databaseType: data.databaseType,
      connectionUsername: data.connectionUsername,
      credentialReference: data.credentialReference,
      purposeNotes: data.purposeNotes || "",
      ownerContact: data.ownerContact || "",
    },
  );
}
