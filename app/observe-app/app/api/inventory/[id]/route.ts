import { NextResponse } from 'next/server';
import { getConnection, sql, } from '@/lib/db';
import { DatabaseInventory } from '@/types'

export async function GET(
    _request: Request,
    { params }: { params: { id: string } }
): Promise<NextResponse> {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, parseInt(params.id))
            .query(`
                SELECT * FROM IT_ManagementDB.dbo.DatabaseInventory
                WHERE InventoryID = @id
            `);

        if (!result.recordset[0]) {
            return NextResponse.json(
                { success: false, error: 'Inventory not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: result.recordset[0]
        });
    } catch (err) {
        console.error('Failed to fetch inventory:', err);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch database inventory' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
): Promise<NextResponse> {
    try {
        const data: DatabaseInventory = await request.json();
        
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, parseInt(params.id))
            .input('systemName', sql.NVarChar, data.systemName)
            .input('serverHost', sql.NVarChar, data.serverHost)
            .input('port', sql.Int, data.port)
            .input('databaseName', sql.NVarChar, data.databaseName)
            .input('databaseType', sql.NVarChar, data.databaseType)
            .input('connectionUsername', sql.NVarChar, data.connectionUsername)
            .input('credentialReference', sql.NVarChar, data.credentialReference)
            .input('purposeNotes', sql.NVarChar, data.purposeNotes)
            .input('ownerContact', sql.NVarChar, data.ownerContact)
            .query(`
                UPDATE IT_ManagementDB.dbo.DatabaseInventory
                SET 
                    SystemName = @systemName,
                    ServerHost = @serverHost,
                    Port = @port,
                    @Zone = @zone,
                    DatabaseName = @databaseName,
                    DatabaseType = @databaseType,
                    ConnectionUsername = @connectionUsername,
                    CredentialReference = @credentialReference,
                    PurposeNotes = @purposeNotes,
                    OwnerContact = @ownerContact
                WHERE InventoryID = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return NextResponse.json(
                { success: false, error: 'Inventory not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: { ...data, inventoryID: parseInt(params.id) }
        });
    } catch (err) {
        console.error('Failed to update inventory:', err);
        return NextResponse.json(
            { success: false, error: 'Failed to update database inventory' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: { id: string } }
): Promise<NextResponse> {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('id', sql.Int, parseInt(params.id))
            .query(`
                DELETE FROM IT_ManagementDB.dbo.DatabaseInventory
                WHERE InventoryID = @id
            `);

        if (result.rowsAffected[0] === 0) {
            return NextResponse.json(
                { success: false, error: 'Inventory not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            data: { inventoryID: parseInt(params.id) }
        });
    } catch (err) {
        console.error('Failed to delete inventory:', err);
        return NextResponse.json(
            { success: false, error: 'Failed to delete database inventory' },
            { status: 500 }
        );
    }
}