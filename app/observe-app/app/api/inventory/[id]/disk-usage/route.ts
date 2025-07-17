import { NextRequest } from 'next/server';
// import { getServerConnection } from '@/lib/db/connection';


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const inventoryId = params.id;

  try {
    const pool = await getServerConnection(inventoryId);

    const result = await pool.request().query(`
      SELECT 
        volume_mount_point AS mountPoint,
        total_bytes / 1024 / 1024 AS totalMB,
        available_bytes / 1024 / 1024 AS availableMB,
        (total_bytes - available_bytes) / 1024 / 1024 AS usedMB
      FROM sys.dm_os_volume_stats(NULL, NULL)
    `);

    const data = result.recordset.map((row: any) => ({
      mountPoint: row.mountPoint,
      total: row.totalMB,
      available: row.availableMB,
      used: row.usedMB,
    }));

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Disk usage error:', error);
    return new Response(JSON.stringify({ error.message }), {
      status: 500,
    });
  }
}
