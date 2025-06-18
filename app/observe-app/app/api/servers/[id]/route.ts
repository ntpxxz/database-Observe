import { NextResponse } from 'next/server';
import { queryAppDb } from '@/lib/db';
import { DatabaseInventory } from '@/types';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    try {
        const body: Omit<DatabaseInventory, 'id' | 'inventoryID'> = await request.json();
        
        // This is a simplified update. A more robust version would dynamically build the SET clause.
        const result = await queryAppDb(
            `UPDATE servers 
             SET systemName = @systemName, zone = @zone, serverHost = @serverHost, port = @port, 
                 databaseName = @databaseName, databaseType = @databaseType, 
                 connectionUsername = @connectionUsername, purposeNotes = @purposeNotes, 
                 ownerContact = @ownerContact, updated_at = GETDATE()
             WHERE inventoryID = @id`,
            { ...body, id }
        );
        
        if (result.rowsAffected[0] === 0) {
            return NextResponse.json({ message: 'Server not found' }, { status: 404 });
        }
        return NextResponse.json({ message: 'Update successful' });

    } catch (error: any) {
        return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
    const { id } = params;
    try {
        const result = await queryAppDb('DELETE FROM servers WHERE inventoryID = @id', { id });
        if (result.rowsAffected[0] === 0) {
            return NextResponse.json({ message: 'Server not found' }, { status: 404 });
        }
        return new Response(null, { status: 204 }); // No Content
    } catch (error: any) {
        return NextResponse.json({ message: `Server Error: ${error.message}` }, { status: 500 });
    }
  }