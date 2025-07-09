import sql from 'mssql';

// Static config สำหรับฐานข้อมูลกลาง (IT_ManagementDB)
const config: sql.config = {
  user: process.env.MSSQL_USER || 'sa',
  password: process.env.MSSQL_PASSWORD || '123456',
  server: process.env.MSSQL_HOST || 'localhost',
  database: process.env.MSSQL_DATABASE || 'IT_ManagementDB',
  options: {
    trustServerCertificate: true,
    encrypt: true,
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

declare global {
  var appDbPool: Promise<sql.ConnectionPool> | undefined;
}

function getAppDbConnection(): Promise<sql.ConnectionPool> {
  if (!global.appDbPool) {
    global.appDbPool = new sql.ConnectionPool(config)
      .connect()
      .then(pool => {
        console.log("Connected to App DB");
        pool.on("error", err => console.error("App DB Pool Error:", err));
        return pool;
      })
      .catch(err => {
        console.error("Failed to connect to App DB:", err);
        global.appDbPool = undefined;
        throw err;
      });
  }
  return global.appDbPool;
}

// Generic query helper
export async function queryAppDb(
  queryTemplate: string,
  params: { [key: string]: any } = {}
) {
  const pool = await getAppDbConnection();
  const request = pool.request();

  for (const key in params) {
    request.input(key, params[key]);
  }

  return request.query(queryTemplate);
}

// Load inventory config by ID
export async function getInventoryById(id: string) {
  const result = await queryAppDb(
    `SELECT * FROM Inventory WHERE id = @id`,
    { id }
  );

  if (!result.recordset[0]) throw new Error(`Inventory ID not found: ${id}`);

  const row = result.recordset[0];

  return {
    id: row.id,
    name: row.name,
    server: row.serverHost,
    user: row.connectionUsername,
    password: row.connectionPassword,
    port: row.port || 1433,
    database: row.databaseName,
    encrypt: true, // ปรับตามต้องการ
    poolMax: 10,
    poolMin: 0,
    idleTimeout: 30000
  };
}
