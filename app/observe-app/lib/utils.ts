import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function isReadOnlySQL(query: string): boolean {
  const forbiddenKeywords = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "MERGE",
    "CREATE", "GRANT", "REVOKE", "USE", "BACKUP", "RESTORE", "SHUTDOWN", "EXECUTE"
  ];

  const normalized = query.trim().toUpperCase();

  const statements = normalized.split(";").map(s => s.trim()).filter(Boolean);

  if (statements.length !== 1) return false;

  const stmt = statements[0];
  const isSafeStart = stmt.startsWith("SELECT") || stmt.startsWith("EXEC SP_");
  const hasDanger = forbiddenKeywords.some(keyword => stmt.includes(keyword));

  return isSafeStart && !hasDanger;
}
