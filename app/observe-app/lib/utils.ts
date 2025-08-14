import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function isReadOnlySQL(query: string): boolean {
  const forbiddenKeywords = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "MERGE", "CREATE", "GRANT", "REVOKE", "USE", "BACKUP",
    "RESTORE", "SHUTDOWN", "ATTACH", "DETACH"
  ];

  const normalized = query.trim().toUpperCase();

  // ❌ บล็อกกรณีมีหลาย statement หรือมี GO
  if (normalized.includes(";") || normalized.includes("\nGO")) return false;

  // ✅ ตรวจว่าขึ้นต้นด้วย SELECT หรือ WITH หรือ EXEC SP_
  const isSafeStart = /^\s*(SELECT|WITH|EXEC\s+SP_)/i.test(query);
  if (!isSafeStart) return false;

  // ❌ ตรวจว่ามี keyword อันตราย
  for (const kw of forbiddenKeywords) {
    const pattern = new RegExp(`\\b${kw}\\b`, "i");
    if (pattern.test(normalized)) return false;
  }

  // ✅ อนุญาต DMV ที่ปลอดภัย (sys.dm_*)
  const isUsingSafeDMV = /FROM\s+SYS\.DM_/i.test(normalized);
  return isUsingSafeDMV || isSafeStart;
}
