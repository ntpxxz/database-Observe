import { NextRequest, NextResponse } from "next/server";
import { getSQLConnectionByInventory } from "@/lib/connectionManager";
import { queryAppDb } from "@/lib/appDb";
import mssqlDriver from "@/lib/drivers/mssqlDriver";
import { isReadOnlySQL } from "@/lib/utils";
export async function POST(req: NextRequest) {
  try {
    const { inventoryId, query } = await req.json();

    if (!query || !inventoryId) {
      return NextResponse.json({ message: "Missing query or inventoryId" }, { status: 400 });
    }

    const result = await queryAppDb(
      `SELECT * FROM IT_ManagementDB.dbo.DatabaseInventory WHERE InventoryID = @id`,
      { id: inventoryId }
    );

    if (!result.recordset.length) {
      return NextResponse.json({ message: "Invalid inventoryId" }, { status: 404 });
    }


    const dbConfig = result.recordset[0];

    const pool = await getSQLConnectionByInventory(dbConfig);

    // 🚀 ใช้ driver ตามประเภทฐานข้อมูล
    const driver = mssqlDriver; // หรือ dynamic ได้ตาม dbConfig.databaseType
    const response = await driver.executeQuery(pool, query);
    if (!isReadOnlySQL(query)) {
      return NextResponse.json({ message: "Only read-only queries are allowed." }, { status: 403 });
    }
    console.log("✅ Query succeeded:", response);
    return NextResponse.json({ result: response });
    
  } catch (error: any) {
    console.error("[Manual Query Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
