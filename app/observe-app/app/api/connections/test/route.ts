import { NextRequest, NextResponse } from 'next/server';
import {
  ServerFormData,
  AnyPool,
  MSSQLConnectionConfig,
  PostgreSQLConnectionConfig,
  MySQLConnectionConfig,
  DbType,
} from '@/types';

import postgresDriver from '@/lib/drivers/postgresDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import mssqlDriver from '@/lib/drivers/mssqlDriver';

const TEST_CONNECTION_TIMEOUT = 15000;

export async function POST(request: NextRequest) {
  let targetPool: AnyPool | undefined;
  let body: ServerFormData | undefined;

  try {
    const parsedBody = await request.json();

    if (
      !parsedBody ||
      !parsedBody.databaseType ||
      !parsedBody.serverHost ||
      !parsedBody.port ||
      !parsedBody.connectionUsername ||
      !parsedBody.credentialReference
    ) {
      return NextResponse.json(
        { success: false, message: 'Missing required connection parameters' },
        { status: 400 }
      );
    }

    body = parsedBody as ServerFormData;

    const validationErrors = validateServerConnectionData(body);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid server connection parameters',
          errors: validationErrors,
        },
        { status: 400 }
      );
    }

    switch (body.databaseType) {
      case 'MSSQL':
        targetPool = await Promise.race([
          mssqlDriver.connect(createMSSQLConnectionConfig(body)),
          timeoutPromise(),
        ]);
        break;
      case 'POSTGRES':
        targetPool = await Promise.race([
          (postgresDriver as any).connect(createPostgreSQLConnectionConfig(body)),
          timeoutPromise(),
        ]);
        break;
      case 'MYSQL':
        targetPool = await Promise.race([
          (mysqlDriver as any).connect(createMySQLConnectionConfig(body)),
          timeoutPromise(),
        ]);
        break;
      default:
        throw new Error("Unsupported database type");
    }
    let availableDatabases: string[] = [];
    if (targetPool) {
      try {
        if (body.databaseType === 'MSSQL') {
          availableDatabases = await mssqlDriver.listDatabases(targetPool);
        } else if (body.databaseType === 'POSTGRES') {
          availableDatabases = await (postgresDriver as any).listDatabases(targetPool);
        } else if (body.databaseType === 'MYSQL') {
          availableDatabases = await (mysqlDriver as any).listDatabases(targetPool);
        }
      } catch (err) {
        console.warn('[TestServerConnection] Could not list databases:', err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully connected to ${body.databaseType} server!`,
      databaseType: body.databaseType,
      serverHost: body.serverHost,
      port: body.port,
      ...(availableDatabases.length > 0 && { availableDatabases }),
    });
  } catch (err: unknown) {
    const errorDetails = parseServerConnectionError(err, body?.databaseType);
    return NextResponse.json(
      {
        success: false,
        message: errorDetails.userMessage,
        errorType: errorDetails.type,
      },
      { status: errorDetails.statusCode }
    );
  } finally {
    if (targetPool && body?.databaseType) {
      try {
        if (body.databaseType === 'MSSQL') {
          await mssqlDriver.disconnect(targetPool);
        } else if (body.databaseType === 'POSTGRES') {
          await (postgresDriver as any).disconnect(targetPool);
        } else if (body.databaseType === 'MYSQL') {
          await (mysqlDriver as any).disconnect(targetPool);
        }
        console.log('[TestServerConnection] Server connection cleaned up successfully');
      } catch (cleanupErr) {
        console.warn('[TestServerConnection] Cleanup warning:', cleanupErr);
      }
    }
  }
}

function timeoutPromise(): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Server connection timeout')), TEST_CONNECTION_TIMEOUT)
  );
}

function validateServerConnectionData(body: ServerFormData): string[] {
  const errors: string[] = [];

  if (!body.databaseType) errors.push('Database type is required');
  if (!body.serverHost?.trim()) errors.push('Server host is required');
  if (!body.port || body.port < 1 || body.port > 65535) errors.push('Valid port (1–65535) is required');
  if (!body.connectionUsername?.trim()) errors.push('Username is required');
  if (!body.credentialReference?.trim()) errors.push('Password is required');
  if (body.databaseType === 'MSSQL' && !body.serverHost.includes('.')) {
    errors.push('MSSQL server host must be a valid hostname or IP address');
  }

  if (body.databaseType === 'POSTGRES' && !body.serverHost.includes('.')) {
    errors.push('PostgreSQL server host must be a valid hostname or IP address');
  }
  if (body.databaseType === 'MYSQL' && !body.serverHost.includes('.')) {
    errors.push('MySQL server host must be a valid hostname or IP address');
  }

  return errors;
}

// ✅ Config factories
function createMSSQLConnectionConfig(body: ServerFormData): MSSQLConnectionConfig {
  return {
    databaseType: 'MSSQL',
    serverHost: body.serverHost.trim(), // เปลี่ยนจาก server เป็น serverHost
    port: body.port,
    connectionUsername: body.connectionUsername.trim(), // เปลี่ยนจาก user เป็น connectionUsername
    credentialReference: body.credentialReference, // เปลี่ยนจาก password เป็น credentialReference
    databaseName: body.databaseName || "master", // เปลี่ยนจาก database เป็น databaseName
    options: {
      encrypt:true,
      trustServerCertificate: true,
      enableArithAbort: true,
      appName:'ObserveApp-Monitor'
    },
    requestTimeout: TEST_CONNECTION_TIMEOUT,
    connectionTimeout: TEST_CONNECTION_TIMEOUT,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

function createPostgreSQLConnectionConfig(body: ServerFormData): PostgreSQLConnectionConfig {
  return {
    databaseType: 'POSTGRES',
    serverHost: body.serverHost.trim(), // เปลี่ยนจาก host เป็น serverHost
    port: body.port,
    connectionUsername: body.connectionUsername.trim(), // เปลี่ยนจาก user เป็น connectionUsername
    credentialReference: body.credentialReference, // เปลี่ยนจาก password เป็น credentialReference
    databaseName: body.databaseName || 'postgres', // เปลี่ยนจาก database เป็น databaseName
    connectionTimeoutMillis: TEST_CONNECTION_TIMEOUT,
    idleTimeoutMillis: 30000,
    max: 10,
    min: 0,
    // ssl: // หากต้องการใช้ SSL สามารถเพิ่ม db.encrypt หรือ body.ssl ที่นี่
  };
}

function createMySQLConnectionConfig(body: ServerFormData): MySQLConnectionConfig {
  return {
    databaseType: 'MYSQL',
    serverHost: body.serverHost.trim(), // เปลี่ยนจาก host เป็น serverHost
    port: body.port,
    connectionUsername: body.connectionUsername.trim(), // เปลี่ยนจาก user เป็น connectionUsername
    credentialReference: body.credentialReference, // เปลี่ยนจาก password เป็น credentialReference
    databaseName: body.databaseName || "", // เปลี่ยนจาก database เป็น databaseName
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    connectTimeout: TEST_CONNECTION_TIMEOUT,
    idleTimeout: 30000,
    // ssl: // หากต้องการใช้ SSL สามารถเพิ่ม db.encrypt หรือ body.ssl ที่นี่
  };
}

function parseServerConnectionError(err: unknown, dbType?: DbType) {
  const message = err instanceof Error ? err.message : 'Unknown error occurred';

  if (message.includes('ECONNREFUSED') || message.includes('connection refused')) {
    return {
      type: 'SERVER_UNREACHABLE',
      message,
      userMessage: `Could not connect to ${dbType || 'database'} server.`,
      statusCode: 503,
    };
  }

  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return {
      type: 'SERVER_TIMEOUT',
      message,
      userMessage: 'Connection timed out.',
      statusCode: 408,
    };
  }

  if (
    message.includes('authentication') ||
    message.includes('login') ||
    message.includes('password') ||
    message.includes('access denied')
  ) {
    return {
      type: 'AUTH_FAILED',
      message,
      userMessage: 'Authentication failed.',
      statusCode: 401,
    };
  }

  if (message.includes('host') && (message.includes('not found') || message.includes('unknown'))) {
    return {
      type: 'HOST_NOT_FOUND',
      message,
      userMessage: 'Server host not found.',
      statusCode: 404,
    };
  }

  return {
    type: 'SERVER_ERROR',
    message,
    userMessage: 'Unexpected error occurred during connection.',
    statusCode: 500,
  };
}