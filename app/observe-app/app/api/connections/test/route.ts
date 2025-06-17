import { NextResponse } from 'next/server';
import { Driver, ServerFormData, AnyPool, DbType } from '@/types'; // Adjust the import path as necessary

// Import all drivers (ensure paths are correct relative to this file)
import postgresDriver from '@/lib/drivers/postgresDriver';
import mysqlDriver from '@/lib/drivers/mysqlDriver';
import mssqlDriver from '@/lib/drivers/mssqlDriver';

// A map to easily select the correct driver based on the database type
const drivers: { [key in DbType]: Driver } = {
    POSTGRES: postgresDriver,
    MYSQL: mysqlDriver,
    MSSQL: mssqlDriver
};

/**
 * API route handler for testing database connections.
 * Expects a POST request with connection details in the body.
 */
export async function POST(request: Request) {
    let targetPool: AnyPool | undefined;
    let driver: Driver | undefined;
    
    try {
        const body: ServerFormData = await request.json();
        
        // Basic validation for required fields
        if (!body.databaseType || !body.serverHost || !body.port || !body.connectionUsername || !body.credentialReference
        ) {
             return NextResponse.json({ success: false, message: 'Missing required connection details.' }, { status: 400 });
        }

        driver = drivers[body.databaseType];

        if (!driver) {
            return NextResponse.json({ success: false, message: `Unsupported DB type: ${body.databaseType}` }, { status: 400 });
        }

        // Create the connection configuration object from the request body
        const connectionConfig = {
            host: body.serverHost,
            port: body.port,
            user: body.connectionUsername,
            password: body.credentialReference, // Using the plaintext password for the test
            database: body.databaseName,
            connectionTimeout: 5000, // Set a 5-second timeout for the connection attempt
        };

        // Attempt to connect using the selected driver
        console.log(`Attempting to connect to ${body.databaseType} at ${body.serverHost}...`);
        targetPool = await driver.connect(connectionConfig);
        console.log(`Successfully connected to ${body.serverHost}.`);

        // If connection is successful, we can consider the test passed.
        // The disconnect logic will run in the `finally` block.

        return NextResponse.json({ success: true, message: 'Connection successful!' });

    } catch (err: any) {
        // Log the detailed error on the server for debugging
        console.error("[Test Connection Error]", err.message);
        
        // Return a user-friendly, structured error message to the frontend
        return NextResponse.json({ success: false, message: `Connection failed: ${err.code || err.message}` }, { status: 400 });
    } finally {
        // IMPORTANT: Always ensure the connection pool is closed after the test.
        if (targetPool && driver?.disconnect) {
            try {
                await driver.disconnect(targetPool);
                console.log('Test connection pool closed.');
            } catch (disconnectErr: any) {
                console.error("Error during test connection disconnect:", disconnectErr.message);
            }
        }
    }
}
