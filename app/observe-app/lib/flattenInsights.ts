import { PerformanceInsight, InsightItem } from "@/types";

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
          .filter((item: unknown) => {
            const insight = item as InsightItem;
            const db =
              insight.database || insight["db_name"] || insight["database_name"] || "";
            return typeof db === "string" && !isSystemDatabase(db);
          })
          .map((item: unknown, index: number): PerformanceInsight => {
            const insight = item as InsightItem;

            return {
              id: insight.id ?? `${key}_${index}`,
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
              severity: "warning", // default, can be improved if insight.severity is added
              title: `Insight from ${key}`,
              message:
                typeof insight.query === "string"
                  ? insight.query.slice(0, 200)
                  : "No query available",
              timestamp: new Date().toISOString(), // best-effort fallback
              query: insight.query ?? "N/A",
              sessionId: typeof insight.session_id === "string" || typeof insight.session_id === "number"
                ? String(insight.session_id)
                : undefined,
              details: insight,
            };
          })
      );
    }
  }

  return result;
}
