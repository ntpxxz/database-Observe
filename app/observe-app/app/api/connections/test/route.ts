import { NextResponse } from 'next/server';
import { Driver, ServerFormData, AnyPool, DbType } from '@/types'; // ปรับ path ตามความจำเป็น

// Import drivers
import postgresDriver from '@/lib/drivers/postgresDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import mssqlDriver from '@/lib/drivers/mssqlDriver';
const drivers: { [key in DbType]: Driver } = {
    MSSQL: mssqlDriver,
    POSTGRES: postgresDriver,
    MYSQL: mysqlDriver
};

export async function POST(request: Request) {
    let targetPool: AnyPool | undefined;
    let driver: Driver | undefined;
    
    try {
        const body: ServerFormData = await request.json();
        console.log('--- RAW REQUEST BODY RECEIVED ---:', body);
        if (!body.databaseType || !body.serverHost || !body.port || !body.connectionUsername || !body.credentialReference) {
            return NextResponse.json({ success: false, message: 'Missing required connection details.' }, { status: 400 });
        }

        driver = drivers[body.databaseType];

        if (!driver) {
            return NextResponse.json({ success: false, message: `Unsupported DB type: ${body.databaseType}` }, { status: 400 });
        }

        // --- FINAL FIX: ใช้ switch-case เพื่อแยกการสร้าง Config อย่างเด็ดขาด ---
        
        let connectionConfig: any;

        switch (body.databaseType) {
            
            case 'MSSQL':
                connectionConfig = {
                    server: body.serverHost,  // Use server instead of serverHost for MSSQL
                    user: body.connectionUsername,
                    password: body.credentialReference,
                    database: body.databaseName,
                    port: body.port,
                    options: {
                        encrypt: false,
                        trustServerCertificate: true,
                        enableArithAbort: true
                    },
                    connectionTimeout: 10000
                };
                break;

            case 'POSTGRES':
            case 'MYSQL':
                connectionConfig = {
                    host: body.serverHost,
                    user: body.connectionUsername,
                    password: body.credentialReference,
                    database: body.databaseName,
                    port: body.port,
                    connectionTimeout: 5000,
                };
                break;

            default:
                // ในกรณีที่ databaseType ไม่ตรงกับเคสไหนเลย
                return NextResponse.json({ success: false, message: `Invalid database type: ${body.databaseType}`}, { status: 400 });
        }
        
        // --- จบส่วนที่แก้ไข ---
        
        console.log(`Final connection config for ${body.databaseType}:`, {
            ...connectionConfig,
            password: '***REDACTED***'
        });
        
        targetPool = await driver.connect(connectionConfig);
        console.log(`Successfully connected to ${body.serverHost}.`);

        return NextResponse.json({ success: true, message: 'Connection successful!' });

    } catch (err: any) {
        console.error("[Test Connection Error]", err.message);
        
        return NextResponse.json({ 
            success: false, 
            message: err.message || 'An unknown connection error occurred.'
        }, { status: 400 });

    } finally {
        if (targetPool && driver?.disconnect) {
            await driver.disconnect(targetPool);
            console.log('Test connection pool closed.');
        }
    }
}