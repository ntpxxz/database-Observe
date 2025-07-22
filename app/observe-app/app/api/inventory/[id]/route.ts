import { NextRequest, NextResponse } from "next/server";
import { queryAppDb as queryStaticAppDb } from "@/lib/appDb";
import { queryAppDb as queryDynamicAppDb } from "@/lib/connectionManager";
import { DatabaseInventory } from "@/types";
import { updateInventoryById, getInventoryById } from "@/lib/appDb";

// GET /api/inventory/[id]
export async function GET(
  request: NextRequest,
  // Change params to Promise<{ id: string }>
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await the params promise

  try {
    const result = await queryStaticAppDb(
      `SELECT * FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id },
    );

    if (result.recordset.length === 0) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    const server: DatabaseInventory = result.recordset[0];

    const databaseList = await queryDynamicAppDb(
      server,
      `
      SELECT name, sizeMB = CAST(size AS FLOAT) / 128, state_desc as state
      FROM sys.databases
      WHERE state_desc = 'ONLINE'
    `,
    );

    return NextResponse.json({
      ...server,
      databases: databaseList.recordset,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[GET /inventory/${id}]`, message);
    return NextResponse.json(
      { message: `Error: ${message}` },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  // Change params to Promise<{ id: string }>
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await the params promise

  try {
    const body = await req.json();

    const existing = await getInventoryById(id);
    if (!existing) {
      return NextResponse.json(
        { error: `Server with ID ${id} not found` },
        { status: 404 },
      );
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
      connectionUsername:
        body.connectionUsername?.trim() || existing.connectionUsername,
      credentialReference:
        body.credentialReference || existing.credentialReference,
      zone: body.zone || existing.zone,
      purposeNotes: body.purposeNotes || existing.purposeNotes,
      ownerContact: body.ownerContact || existing.ownerContact,
    };

    await updateInventoryById(id, updatedServer);

    return NextResponse.json({ success: true, data: updatedServer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[PUT /inventory/${id}]`, message);
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

// DELETE /api/inventory/[id]
export async function DELETE(
  _req: NextRequest,
  // Change params to Promise<{ id: string }>
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params; // Await the params promise

  try {
    const result = await queryStaticAppDb(
      `DELETE FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id },
    );

    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[DELETE /inventory/${id}]`, message);
    return NextResponse.json(
      { message: `Error: ${message}` },
      { status: 500 },
    );
  }
}