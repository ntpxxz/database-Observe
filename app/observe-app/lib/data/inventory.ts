import { queryAppDb } from "@/lib/appDb"; // ใช้ connection จากไฟล์ static (สำหรับ IT_ManagementDB)
import { DatabaseInventory } from "@/types";

/**
 * ดึงข้อมูลการเชื่อมต่อของ Server ตาม inventoryID
 * @param id inventory ID
 * @returns DatabaseInventory object (เช่น host, port, user, password, dbName)
 */
export async function getInventoryById(id: string): Promise<DatabaseInventory | null> {
  const query = `
    SELECT TOP 1 *
    FROM Inventory
    WHERE id = @id
  `;

  const result = await queryAppDb(query, { id });

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];

  // คุณอาจต้อง mapping ให้ตรงกับ interface DatabaseInventory
  return {
    id: row.id,
    serverHost: row.serverHost,
    port: row.port || 1433,
    databaseName: row.databaseName,
    databaseType: row.databaseType || "mssql",
    connectionUsername: row.connectionUsername,
    connectionPassword: row.connectionPassword,
    systemName: row.systemName,
    zone: row.zone,
    ownerContact: row.ownerContact,
    purposeNotes: row.purposeNotes,
  };
}
