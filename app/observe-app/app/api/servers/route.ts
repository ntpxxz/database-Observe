import { NextResponse } from 'next/server';
import sql from 'mssql';
import { pool } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
  try {
    // ดึงข้อมูลจาก DatabaseInventory แต่เพิ่มการตรวจสอบสถานะ
    const result = await pool!.request()
      .query(`
        SELECT 
          InventoryID as id,
          SystemName as name,
          ServerHost as host,
          Port as port,
          DatabaseType as type,
          DatabaseName as database,
          ConnectionUsername as username
        FROM IT_ManagementDB.dbo.DatabaseInventory
      `);

    // เพิ่มการตรวจสอบสถานะของแต่ละ server
    const serversWithStatus = await Promise.all(
      result.recordset.map(async (server) => {
        try {
          // ทดสอบการเชื่อมต่อกับ server
          await pool.request()
            .input('host', sql.NVarChar, server.host)
            .input('port', sql.Int, server.port)
            .query('SELECT 1');
          
          return {
            ...server,
            status: 'active',
            lastChecked: new Date().toISOString()
          };
        } catch (error) {
          return {
            ...server,
            status: 'inactive',
            lastChecked: new Date().toISOString()
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: serversWithStatus
    });

  } catch (err) {
    console.error('Failed to fetch servers:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch server list' },
      { status: 500 }
    );
  }
}