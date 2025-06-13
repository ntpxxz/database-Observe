import { NextResponse } from 'next/server';
import { getConnection, sql } from '@/lib/db';
import { ServerMetrics } from '@/types/index';

export async function GET(
  _request: Request,
  context: { params: { id: string } }
): Promise<NextResponse> {
  try {
    // Validate and parse ID first
    const id = parseInt(context.params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid server ID' },
        { status: 400 }
      );
    }

    const pool = await getConnection();
    // Fetch server details from the database
    
    const serverResult = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          InventoryID as id,
          SystemName as name,
          ServerHost as host,
          Port as port,
          DatabaseType as type,
          DatabaseName as db_name  
        FROM IT_ManagementDB.dbo.DatabaseInventory 
        WHERE InventoryID = @id
      `);

    if (!serverResult.recordset[0]) {
      return NextResponse.json(
        { success: false, error: 'Server not found' },
        { status: 404 }
      );
    }

    const metrics: ServerMetrics = {
      server: serverResult.recordset[0],
      performance: {
        cpu_usage: Math.round(Math.random() * 100),
        memory_usage: Math.round(Math.random() * 100),
        disk_usage: Math.round(Math.random() * 100),
        active_connections: Math.floor(Math.random() * 1000)
      },
      status: 'active',
      last_checked: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      data: metrics
    });

  } catch (err) {
    console.error('Failed to fetch server metrics:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch server metrics' },
      { status: 500 }
    );
  }
}

