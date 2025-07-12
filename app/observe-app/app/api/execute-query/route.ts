import { NextRequest, NextResponse } from "next/server";
import { getSQLConnectionByInventory } from "@/lib/connectionManager";
import { queryAppDb } from "@/lib/appDb";
import mssqlDriver from "@/lib/drivers/mssqlDriver";

// 🔐 OPTIONAL: ตรวจสอบ auth ได้ที่นี่

export async function POST(req: NextRequest) {
  try {
    const { inventoryId, query } = await req.json();

    if (!query || !inventoryId) {
      return NextResponse.json({ error: "Missing query or inventoryId" }, { status: 400 });
    }

    // ✅ ดึงข้อมูล config จาก IT_ManagementDB
    const result = await queryAppDb(
      `SELECT * FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id: inventoryId }
    );

    if (!result.recordset.length) {
      return NextResponse.json({ error: "Invalid inventoryId" }, { status: 404 });
    }

    const dbConfig = result.recordset[0];

    const pool = await getSQLConnectionByInventory(dbConfig);

    // 🚀 ใช้ driver ตามประเภทฐานข้อมูล
    const driver = mssqlDriver; // หรือ dynamic ได้ตาม dbConfig.databaseType

    const response = await driver.executeQuery(pool, query);

    return NextResponse.json({ result: response });

  } catch (error: any) {
    console.error("[Manual Query Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
