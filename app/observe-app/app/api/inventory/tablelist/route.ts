// app/api/inventory/tablelist/route.ts
import { queryAppDb as queryAppStaticDb,  queryDatabaseDirect  } from "@/lib/appDb";
import { NextResponse, NextRequest } from "next/server";


export async function GET(request: NextRequest) {
  const inventoryId = request.nextUrl.searchParams.get("id");
  const dbName = request.nextUrl.searchParams.get("db");

  console.log("API Request:", { inventoryId, dbName }); // Debug log

  if (!inventoryId || !dbName) {
    return NextResponse.json(
      { error: "Missing inventoryId or db parameter" },
      { status: 400 }
    );
  }

  try {
    // ตรวจสอบว่า inventory ID มีอยู่จริงในระบบ
    const inventoryCheck = await queryAppStaticDb(
      `
      SELECT inventoryID FROM DatabaseInventory 
      WHERE inventoryID = @inventoryId
    `,
      { inventoryId }
    );

    if (inventoryCheck.recordset.length === 0) {
      return NextResponse.json(
        { error: "Inventory not found" },
        { status: 404 }
      );
    }

    // ดึงรายการ tables จากฐานข้อมูลที่ระบุ
   // 1. ดึงข้อมูลการเชื่อมต่อของ inventoryId
const dbConfigResult = await queryAppStaticDb(`
  SELECT serverHost, port, connectionUsername, credentialReference
  FROM DatabaseInventory
  WHERE inventoryID = @inventoryId
`, { inventoryId });

if (dbConfigResult.recordset.length === 0) {
  return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
}

const dbConfig = dbConfigResult.recordset[0];

// 2. ใช้ config ต่อเข้า database จริง
const result = await queryDatabaseDirect(dbConfig, `
  SELECT TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_TYPE = 'BASE TABLE'
  ORDER BY TABLE_NAME;
`);

    
    const tables = result.recordset.map((row) => row.TABLE_NAME);
    console.log(`Found ${tables.length} tables in database: ${dbName}`); // Debug log

    return NextResponse.json({
      tables,
      database: dbName,
      count: tables.length,
    });
  } catch (error) {
    console.error("API Error fetching tables:", error);

    // ส่งข้อมูล error ที่มีประโยชน์มากขึ้น
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to fetch table list",
        details: errorMessage,
        database: dbName,
      },
      { status: 500 }
    );
  }
}
