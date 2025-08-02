import { DatabaseInventory } from "@/types";
import { queryAppDb } from "../appDb";

export async function getDatabaseInventory(): Promise<Record<string, DatabaseInventory[]>> {
  const res = await queryAppDb("SELECT * FROM DatabaseInventory", {});
  const servers = res.recordset as DatabaseInventory[];

  // Group by zone
  const zones: Record<string, DatabaseInventory[]> = {};
  for (const server of servers) {
    const zone = server.zone ;
    if (!zones[zone]) zones[zone] = [];
    zones[zone].push(server);
  }
  return zones;
}