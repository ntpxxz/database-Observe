import { PerformanceInsight } from "@/types";

export const SYSTEM_DATABASES = [
  "IT_ManagementDB",
  "ObservabilityDB",
  "master",
  "msdb",
  "tempdb",
  "model",
];

export function isSystemDatabase(dbName: string): boolean {
  return SYSTEM_DATABASES.includes(dbName);
}

export function flattenInsights(insightsObj: any): PerformanceInsight[] {
  if (!insightsObj || typeof insightsObj !== "object") return [];

  const keys = [
    "slowQueries",
    "longRunningQueries",
    "blockingQueries",
    "deadlocks",
    "tempdbUsage",
    "waitStats",
    "insights",
  ];

  const result: PerformanceInsight[] = [];

  for (const key of keys) {
    if (Array.isArray(insightsObj[key])) {
      result.push(
        ...insightsObj[key]
          .filter((item: any) => {
            const db = item?.database_name || item?.db_name || item?.database;
            return db && !isSystemDatabase(db);
          })
          .map((item: any, index: number) => ({
            id: item.id ?? `${key}_${index}`,
            type:
              key === "slowQueries"
                ? "slow_query"
                : key === "longRunningQueries"
                  ? "long_running_query"
                  : key === "blockingQueries"
                    ? "blocking_query"
                    : key === "deadlocks"
                      ? "deadlock_event"
                      : key === "tempdbUsage"
                        ? "high_tempdb_usage"
                        : key === "waitStats"
                          ? "wait_stats"
                          : "unknown",
            title: item.title ?? `Insight ${key}`,
            details: item,
          })),
      );
    }
  }

  return result;
}
