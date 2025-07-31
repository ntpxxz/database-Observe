import { PerformanceInsight } from "@/types";

interface QueryResult {
  status: "fulfilled" | "rejected";
  value?: {
    key: string;
    rows: Record<string, any>[];
  };
}

export function analyzePerformanceInsights(
  results: QueryResult[],
): PerformanceInsight[] {
  return results
    .filter((res): res is Required<QueryResult> => res.status === "fulfilled" && !!res.value)
    .flatMap(({ value }) => {
      const { key, rows } = value;

      return rows.map((row, index): PerformanceInsight => {
        const queryText =
          typeof row.query_text === "string"
            ? row.query_text
            : typeof row.query === "string"
            ? row.query
            : "N/A";

        return {
          id: `${key}_${index}`,
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
          severity: key === "slowQueries" ? "critical" : "warning",
          title: key === "slowQueries" ? "Slow Query" : "Frequent Query",
          message: queryText.slice(0, 100),
          query: queryText,
          timestamp: row.timestamp ?? new Date().toISOString(),
          details: row,
        };
      });
    });
}
