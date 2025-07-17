import { NextRequest, NextResponse } from 'next/server';
import { queryAppDb as queryStaticAppDb } from '@/lib/appDb';
import { queryAppDb as queryDynamicAppDb } from '@/lib/connectionManager';
import { DatabaseInventory } from '@/types';
import { updateInventoryById, getInventoryById } from '@/lib/appDb';

// GET /api/inventory/[id]
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    // 1. ดึงข้อมูล config server จากฐานข้อมูลกลาง
    const result = await queryStaticAppDb(
      `SELECT * FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id }
    );

    if (result.recordset.length === 0) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const server: DatabaseInventory = result.recordset[0];

    // 2. ใช้ config นั้น connect ไปยัง database จริง
    const databaseList = await queryDynamicAppDb(server, `
      SELECT name, sizeMB = CAST(size AS FLOAT) / 128, state_desc as state
      FROM sys.databases
      WHERE state_desc = 'ONLINE'
    `);

    return NextResponse.json({
      ...server,
      databases: databaseList.recordset,
    });
  } catch (error: unknown) {
    console.error(`[GET /inventory/${id}]`, error.message);
    return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  try {
    const body = await req.json();

    // ตรวจสอบว่ามี server เดิมอยู่หรือไม่
    const existing = await getInventoryById(id);
    if (!existing) {
      return NextResponse.json({ error: `Server with ID ${id} not found` }, { status: 404 });
    }

    const updatedServer: DatabaseInventory = {
      ...existing,
      ...body,
      inventoryID: id,
      systemName: body.systemName?.trim() || existing.systemName,
      serverHost: body.serverHost?.trim() || existing.serverHost,
      port: Number(body.port) || existing.port,
      databaseName: body.databaseName?.trim() || existing.databaseName,
      databaseType: body.databaseType || existing.databaseType,
      connectionUsername: body.connectionUsername?.trim() || existing.connectionUsername,
      credentialReference: body.credentialReference || existing.credentialReference,
      zone: body.zone || existing.zone,
      purposeNotes: body.purposeNotes || existing.purposeNotes,
      ownerContact: body.ownerContact || existing.ownerContact,
    };

    await updateInventoryById(id, updatedServer);

    return NextResponse.json({ success: true, data: updatedServer });
  } catch (err: unknown) {
    console.error('PUT /api/inventory/[id] error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/inventory/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const result = await queryStaticAppDb(
      `DELETE FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id }
    );

    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Deleted successfully' });
  } catch (error: unknown) {
    console.error(`[DELETE /inventory/${id}]`, error.message);
    return NextResponse.json({ message: `Error: ${error.message}` }, { status: 500 });
  }
}
