import { NextRequest, NextResponse } from "next/server";
import { getSQLConnectionByInventoryID } from "lib/db/connectionManager";
import { SQL_QUERIES } from "@/lib/connectionManager"; 
import { analyzePerformanceInsights } from "@/lib/db/insightProcessor";

export async function GET(
  req: NextRequest,
  { params }: { params: { inventoryID: string } }
) {
  const inventoryID = params.inventoryID;

  if (!inventoryID) {
    return NextResponse.json({ error: "Missing inventory ID" }, { status: 400 });
  }

  try {
    const pool = await getSQLConnectionByInventoryID(inventoryID);
    if (!pool) throw new Error("Connection failed");

    const result = await Promise.allSettled(
      Object.entries(SQL_QUERIES).map(async ([key, query]) => {
        const rows = await pool.query(query);
        return { key, rows: rows.recordset };
      })
    );

    const insightData = analyzePerformanceInsights(result);
    return NextResponse.json(insightData, { status: 200 });

  } catch (error: any) {
    console.error("Query Insight Error:", error);
    return NextResponse.json(
      { error: error.message || "Query Insight Failed" },
      { status: 500 }
    );
  }
}
