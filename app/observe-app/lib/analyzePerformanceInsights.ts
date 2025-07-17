export function analyzePerformanceInsights(results: any[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];
  
    for (const result of results) {
      if (result.status === "fulfilled") {
        const { key, rows } = result.value;
  
        rows.forEach((row: unknown) => {
          insights.push({
            type: key,
            severity: key === "slowQueries" ? "high" : "medium",
            title: key === "slowQueries" ? "Slow Query" : "Frequent Query",
            message: row.query_text.slice(0, 100),
            meta: row
          });
        });
      }
    }
  
    return insights;
  }
  