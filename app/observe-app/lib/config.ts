import { config as SQLConfig } from 'mssql';

export const appDbConfig: SQLConfig = {
  user: process.env.APP_DB_USER || 'sa',
  password: process.env.APP_DB_PASS || '123456',
  server: process.env.APP_DB_HOST || 'localhost',
  port: Number(process.env.APP_DB_PORT) || 1433,
  database: 'master',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  requestTimeout: 30000,
  connectionTimeout: 30000
};
