import sql from 'mssql';

const config: sql.config = {
  user: 'sa',
  password: '123456',
  server: 'localhost',
  database: 'IT_ManagementDB',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    enableArithAbort: true
  },
  requestTimeout: 30000, // Increase timeout to 30 seconds
  connectionTimeout: 30000,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolConnection: Promise<sql.ConnectionPool> | null = null;

export async function getConnection(): Promise<sql.ConnectionPool> {
  if (!poolConnection) {
    poolConnection = new sql.ConnectionPool(config).connect()
      .then(pool => {
        console.log('Connected to MSSQL');
        return pool;
      })
      .catch(err => {
        console.error('Database connection failed:', err);
        poolConnection = null;
        throw err;
      });
  }

  return poolConnection;
}

export { sql, poolConnection as pool };
