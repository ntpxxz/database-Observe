import { NextRequest, NextResponse } from 'next/server';
import { Driver, ServerFormData, AnyPool, DbType } from '@/types';

import postgresDriver from '@/lib/drivers/postgresDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import mssqlDriver from '@/lib/drivers/mssqlDriver';

const drivers: { [key in DbType]: Driver } = {
  MSSQL: mssqlDriver,
  POSTGRES: postgresDriver,
  MYSQL: mysqlDriver
};

export async function POST(request: NextRequest) {
  let targetPool: AnyPool | undefined;
  let driver: Driver | undefined;

  try {
    const body: ServerFormData = await request.json();

    if (
      !body.databaseType ||
      !body.serverHost?.trim() ||
      !body.port ||
      !body.connectionUsername ||
      !body.credentialReference
    ) {
      return NextResponse.json(
        { success: false, message: 'Missing required connection details.' },
        { status: 400 }
      );
    }
console.log(`[TestConnection] Received body:`, body);
    driver = drivers[body.databaseType];
    if (!driver) {
      return NextResponse.json(
        { success: false, message: `Unsupported DB type: ${body.databaseType}` },
        { status: 400 }
      );
    }

    const connectionConfig =
      body.databaseType === 'MSSQL'
        ? {
            serverHost: body.serverHost,
            user: body.connectionUsername,
            password: body.credentialReference,
            database: '', // allow empty to connect to server only
            port: body.port,
            options: {
              encrypt: false,
              trustServerCertificate: true,
              enableArithAbort: true
            },
            connectionTimeout: 10000
          }
        : {
            host: body.serverHost,
            user: body.connectionUsername,
            password: body.credentialReference,
            database: '', // leave empty
            port: body.port,
            connectionTimeout: 5000
          };

    console.log(`[TestConnection] config:`, {
      ...connectionConfig,
      password: '***REDACTED***' // redact sensitive info
    });

    targetPool = await driver.connect(connectionConfig);
    return NextResponse.json({ success: true, message: 'Connection successful!' });

  } catch (err: any) {
    console.error('[Test Connection Error]', err.message);
    return NextResponse.json(
      { success: false, message: err.message || 'An unknown error occurred.' },
      { status: 400 }
    );
  } finally {
    if (targetPool && driver?.disconnect) {
      await driver.disconnect(targetPool);
    }
  }
}
