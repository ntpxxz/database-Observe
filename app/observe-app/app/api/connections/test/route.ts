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

    driver = drivers[body.databaseType];
    if (!driver) {
      return NextResponse.json(
        { success: false, message: `Unsupported DB type: ${body.databaseType}` },
        { status: 400 }
      );
    }

    // Create standardized DatabaseConnectionConfig
    const connectionConfig = {
      serverHost: body.serverHost,
      port: body.port,
      connectionUsername: body.connectionUsername,
      credentialReference: body.credentialReference,
      databaseType: body.databaseType,
      encrypt: body.databaseType === 'MSSQL' ? false : undefined,
      // Add any other required properties based on your DatabaseConnectionConfig type
      connectionTimeout: body.databaseType === 'MSSQL' ? 10000 : 5000,
      // MSSQL specific options
      ...(body.databaseType === 'MSSQL' && {
        trustServerCertificate: true,
        enableArithAbort: true
      })
    };

    console.log(`[TestConnection] config:`, {
      ...connectionConfig,
      credentialReference: '***'
    });

    targetPool = await driver.connect(connectionConfig);
    return NextResponse.json({ success: true, message: 'Connection successful!' });

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
    console.error('[Test Connection Error]', errorMessage);
    return NextResponse.json(
      { success: false, message: errorMessage },
      { status: 400 }
    );
  } finally {
    if (targetPool && driver?.disconnect) {
      await driver.disconnect(targetPool);
    }
  }
}