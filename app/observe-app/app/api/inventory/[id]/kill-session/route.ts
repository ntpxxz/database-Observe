import { NextRequest, NextResponse } from "next/server";
import { getSQLConnectionByInventory } from "@/lib/connectionManager";
import mssqlDriver from "@/lib/drivers/mssqlDriver";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const { id } = context.params;
  const { sessionId } = await request.json();

  try {
    const db = await getInventoryById(id); // implement this
    const pool = await getSQLConnectionByInventory(db);
    await mssqlDriver.killSession(pool, sessionId);
    return NextResponse.json({ message: `Session ${sessionId} killed.` });
  } catch (err: unknown) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}
