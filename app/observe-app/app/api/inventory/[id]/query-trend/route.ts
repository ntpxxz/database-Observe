import { getSQLConnectionByInventory } from '@/lib/connectionManager';
import { NextRequest, NextResponse } from 'next/server';
import { getInventoryById } from '@/lib/appDb';
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const inventory = await getInventoryById(params.id); 

    if (!inventory) {
      return NextResponse.json({ error: `Inventory ID ${params.id} not found.` }, { status: 404 });
    }

    const pool = await getSQLConnectionByInventory(inventory); 
    const result = await pool.request().query(`
      SELECT
        FORMAT(start_time, 'yyyy-MM-dd HH:mm') AS time_bucket,
        AVG(duration_ms) AS avg_duration
      FROM QueryLogs
      GROUP BY FORMAT(start_time, 'yyyy-MM-dd HH:mm')
      ORDER BY time_bucket ASC
    `);

    const rows = result.recordset;

    return NextResponse.json({
      timestamps: rows.map(r => r.time_bucket),
      avgDurations: rows.map(r => r.avg_duration),
    });
  } catch (err: any) {
    console.error("🔥 Query trend failed:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}