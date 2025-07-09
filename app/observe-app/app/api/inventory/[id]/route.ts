import { NextRequest, NextResponse } from 'next/server';
import { queryAppDb } from '@/lib/connectionManager';

// GET /api/inventory/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const { id } = params;

    try {
        // ดึงข้อมูล server
        const result = await queryAppDb(
            `SELECT * FROM IT_ManagementDB.dbo.databaseInventory WHERE InventoryID = @id`,
            { id }
        );

        if (result.recordset.length === 0) {
            return NextResponse.json({ message: 'Not found' }, { status: 404 });
        }

        const server = result.recordset[0];

        const databaseList = await queryAppDb(`
            SELECT name, sizeMB = CAST(size AS FLOAT) / 128, state_desc as state
            FROM sys.databases
            WHERE state_desc = 'ONLINE'
        `);

        return NextResponse.json({
            ...server,
            databases: databaseList.recordset,
        });
    } catch (error: any) {
        return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
    }
}
// PUT /api/inventory/[id]
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    const { id } = params;

    try {
        const body = await request.json();
        if (!body || typeof body.port === 'undefined') {
            return NextResponse.json({ message: 'Missing required field: port' }, { status: 400 });
        }
        const {
            systemName,
            serverHost,
            port,
            databaseName,
            zone,
            databaseType,
            connectionUsername,
            credentialReference,
            purposeNotes,
            ownerContact
        } = body;   
        if (!systemName || !serverHost || !port || !databaseName || !zone || !databaseType || !connectionUsername || !credentialReference || !purposeNotes || !ownerContact) {
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }


        const result = await queryAppDb(
            `UPDATE IT_ManagementDB.dbo.DatabaseInventory SET 
                SystemName = @systemName, ServerHost = @serverHost, Port = @port, 
                databaseName = @databaseName, Zone = @zone, databaseType = @databaseType, 
                connectionUsername = @connectionUsername, credentialReference = @credentialReference, 
                purposeNotes = @purposeNotes, ownerContact = @ownerContact, 
                updated_at = SYSDATETIMEOFFSET()
             WHERE inventoryID = @id`,
            { ...body, id }
        );

        if (result.rowsAffected[0] === 0) {
            return NextResponse.json({ message: 'Not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Updated successfully' });
    } catch (error: any) {
        return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
    }
}

// DELETE /api/databases/[id]
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    const { id } = params;

    try {
        const result = await queryAppDb(
            `DELETE FROM IT_ManagementDB.dbo.DatabaseInventory WHERE inventoryID = @id`,
            { id }
        );
        if (result.rowsAffected[0] === 0) {
            return NextResponse.json({ message: 'Not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Deleted successfully' });
    } catch (error: any) {
        return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
    }
}