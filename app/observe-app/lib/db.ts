import sql from 'mssql';

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
  // eslint-disable-next-line no-var
  var mssqlPool: Promise<sql.ConnectionPool> | undefined;
}

function getConnection(): Promise<sql.ConnectionPool> {
  if (!global.mssqlPool) {
    console.log('Creating new MSSQL connection pool...');
    global.mssqlPool = new sql.ConnectionPool(config).connect()
      .then(pool => {
        console.log('Connected to MSSQL');
        pool.on('error', err => console.error('MSSQL Pool Error:', err));
        return pool;
      })
      .catch(err => {
        console.error('Database Connection Failed:', err);
        global.mssqlPool = undefined;
        throw err;
      });
  }
  return global.mssqlPool;
} export { getConnection };

/**
 * A helper function to execute parameterized queries against the MSSQL database.
 * @param queryTemplate The SQL query string with named parameters (e.g., SELECT * FROM users WHERE id = @id).
 * @param params An object mapping parameter names to their values (e.g., { id: 1 }).
 * @returns The result of the query.
 */
export async function queryAppDb(queryTemplate: string, params: { [key: string]: any } = {}) {
    const pool = await getConnection();
    const request = pool.request();
    
    // Add parameters to the request
    for (const key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
            // This is a simplified type mapping. For production, you might need more specific types.
            request.input(key, params[key]);
        }
    }
    
    return request.query(queryTemplate);
}

export { sql };
