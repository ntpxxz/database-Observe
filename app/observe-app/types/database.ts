// types/database.ts
export type DbType = 'MSSQL' | 'POSTGRES' | 'MYSQL';

// Base interface สำหรับ properties ที่ทุก database ต้องมี
export interface BaseConnectionConfig {
  serverHost: string;
  port: number;
  connectionUsername: string;
  credentialReference: string;
  databaseName?: string;
  databaseType: DbType;
  connectionTimeout: number;
  appName?: string;
  
  // Pool settings (ทุก database สามารถใช้ได้)
  poolMax?: number;
  poolMin?: number;
  idleTimeout?: number;
}

// MSSQL specific configuration
export interface MSSQLConnectionConfig extends BaseConnectionConfig {
  databaseType: 'MSSQL';
  encrypt: boolean;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
  };
  requestTimeout?: number;
  
  // MSSQL specific properties
  server: string;  // MSSQL ใช้ 'server' แทน 'host'
  user: string;    // MSSQL ใช้ 'user'
  password: string; // MSSQL ใช้ 'password'
  database: string; // MSSQL ใช้ 'database'
}

// PostgreSQL specific configuration
export interface PostgreSQLConnectionConfig extends BaseConnectionConfig {
  databaseType: 'POSTGRES';
  
  // PostgreSQL specific properties
  host: string;    // PostgreSQL ใช้ 'host'
  user: string;    // PostgreSQL ใช้ 'user'
  password: string; // PostgreSQL ใช้ 'password'
  database: string; // PostgreSQL ใช้ 'database'
  
  // PostgreSQL specific options
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  schema?: string;
  searchPath?: string[];
}

// MySQL specific configuration
export interface MySQLConnectionConfig extends BaseConnectionConfig {
  databaseType: 'MYSQL';
  
  // MySQL specific properties
  host: string;    // MySQL ใช้ 'host'
  user: string;    // MySQL ใช้ 'user'
  password: string; // MySQL ใช้ 'password'
  database: string; // MySQL ใช้ 'database'
  
  // MySQL specific options
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
  charset?: string;
  timezone?: string;
  acquireTimeout?: number;
}

// Union type สำหรับทุก database configuration
export type DatabaseConnectionConfig = 
  | MSSQLConnectionConfig 
  | PostgreSQLConnectionConfig 
  | MySQLConnectionConfig;

// Type guards เพื่อตรวจสอบประเภทของ config
export function isMSSQLConfig(config: DatabaseConnectionConfig): config is MSSQLConnectionConfig {
  return config.databaseType === 'MSSQL';
}

export function isPostgreSQLConfig(config: DatabaseConnectionConfig): config is PostgreSQLConnectionConfig {
  return config.databaseType === 'POSTGRES';
}

export function isMySQLConfig(config: DatabaseConnectionConfig): config is MySQLConnectionConfig {
  return config.databaseType === 'MYSQL';
}

// Configuration factory functions
export class DatabaseConfigFactory {
  static createMSSQLConfig(baseData: {
    serverHost: string;
    port: number;
    connectionUsername: string;
    credentialReference: string;
    databaseName?: string;
  }): MSSQLConnectionConfig {
    return {
      ...baseData,
      databaseType: 'MSSQL',
      connectionTimeout: 10000,
      encrypt: false,
      server: baseData.serverHost,
      user: baseData.connectionUsername,
      password: baseData.credentialReference,
      database: baseData.databaseName || '',
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
      },
      requestTimeout: 30000,
      poolMax: 10,
      poolMin: 0,
      idleTimeout: 30000,
      appName: 'Database Connection'
    };
  }

  static createPostgreSQLConfig(baseData: {
    serverHost: string;
    port: number;
    connectionUsername: string;
    credentialReference: string;
    databaseName?: string;
  }): PostgreSQLConnectionConfig {
    return {
      ...baseData,
      databaseType: 'POSTGRES',
      connectionTimeout: 5000,
      host: baseData.serverHost,
      user: baseData.connectionUsername,
      password: baseData.credentialReference,
      database: baseData.databaseName || 'postgres',
      poolMax: 20,
      poolMin: 0,
      idleTimeout: 30000,
      appName: 'Database Connection',
      ssl: false
    };
  }

  static createMySQLConfig(baseData: {
    serverHost: string;
    port: number;
    connectionUsername: string;
    credentialReference: string;
    databaseName?: string;
  }): MySQLConnectionConfig {
    return {
      ...baseData,
      databaseType: 'MYSQL',
      connectionTimeout: 5000,
      host: baseData.serverHost,
      user: baseData.connectionUsername,
      password: baseData.credentialReference,
      database: baseData.databaseName || '',
      poolMax: 15,
      poolMin: 0,
      idleTimeout: 30000,
      appName: 'Database Connection',
      charset: 'utf8mb4',
      timezone: 'local'
    };
  }

  // Factory method ที่เลือก config type ตาม database type
  static createConfig(
    databaseType: DbType,
    baseData: {
      serverHost: string;
      port: number;
      connectionUsername: string;
      credentialReference: string;
      databaseName?: string;
    }
  ): DatabaseConnectionConfig {
    switch (databaseType) {
      case 'MSSQL':
        return this.createMSSQLConfig(baseData);
      case 'POSTGRES':
        return this.createPostgreSQLConfig(baseData);
      case 'MYSQL':
        return this.createMySQLConfig(baseData);
      default:
        throw new Error(`Unsupported database type: ${databaseType}`);
    }
  }
}