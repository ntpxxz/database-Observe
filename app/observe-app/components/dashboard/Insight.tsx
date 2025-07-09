import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { PerformanceInsight } from "@/types";
import { PerformanceInsightsTable } from "@/components/dashboard/PerformanceInsightsTable"; // ใช้ component เดิมที่คุณมีอยู่

const InsightPage = () => {
  const router = useRouter();
  const { inventoryID, databaseName } = router.query;

  const [insights, setInsights] = useState<PerformanceInsight[] | { error: string } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!inventoryID || !databaseName) return;

    const fetchInsights = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/inventory/${inventoryID}/metrics`);
        if (!res.ok) {
          const err = await res.json();
          setInsights({ error: err.message || "Failed to fetch insights." });
        } else {
          const data = await res.json();
          setInsights(data);
        }
      } catch (error: any) {
        setInsights({ error: error.message || "Unknown error" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInsights();
  }, [inventoryID, databaseName]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <h1 className="text-2xl font-bold mb-6 text-sky-300">
        Database Insight: {databaseName}
      </h1>

      <PerformanceInsightsTable
        insights={insights}
        serverName={databaseName as string}
        isLoading={isLoading}
      />
    </div>
  );
};

export default InsightPage;
