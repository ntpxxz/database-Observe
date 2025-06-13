import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { DatabaseInventory } from '@/types';

export async function GET(): Promise<NextResponse> {
  try {
    const pool = await getConnection();
    
    const result = await pool.request()
      .query(`
        SELECT 
          InventoryID as inventoryID,
          SystemName as systemName,
          ServerHost as serverHost,
          Port as port,
          DatabaseType as databaseType,
          DatabaseName as databaseName,
          ConnectionUsername as connectionUsername,
          CredentialReference as credentialReference,
          PurposeNotes as purposeNotes,
          OwnerContact as ownerContact,
          CreatedDate as createdDate
        FROM IT_ManagementDB.dbo.DatabaseInventory
        ORDER BY SystemName
      `);

    console.log('API response:', result.recordset); // Debug log

    return NextResponse.json({
      success: true,
      data: result.recordset
    });

  } catch (err) {
    console.error('Failed to fetch inventory:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch inventory list' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
    try {
        const data: DatabaseInventory = await request.json();
        
        const pool = await getConnection();
        const result = await pool.request()
            .input('systemName', data.systemName)
            .input('serverHost', data.serverHost)
            .input('port', data.port)
            .input('databaseName', data.databaseName)
            .input('databaseType', data.databaseType)
            .input('connectionUsername', data.connectionUsername)
            .input('credentialReference', data.credentialReference)
            .input('purposeNotes', data.purposeNotes)
            .input('ownerContact', data.ownerContact)
            .query(`
                INSERT INTO IT_ManagementDB.dbo.DatabaseInventory (
                    SystemName, ServerHost, Port, DatabaseName, 
                    DatabaseType, ConnectionUsername, CredentialReference,
                    PurposeNotes, OwnerContact
                ) VALUES (
                    @systemName, @serverHost, @port, @databaseName,
                    @databaseType, @connectionUsername, @credentialReference,
                    @purposeNotes, @ownerContact
                );
                SELECT SCOPE_IDENTITY() as id;
            `);

        return NextResponse.json({
            success: true,
            data: { ...data, inventoryID: result.recordset[0].id }
        });
    } catch (err) {
        console.error('Failed to create inventory:', err);
        return NextResponse.json(
            { success: false, error: 'Failed to create database inventory entry' },
            { status: 500 }
        );
    }
}