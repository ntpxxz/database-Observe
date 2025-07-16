import { useEffect, useState } from "react";

interface DiskUsageData {
  timestamp: string;
  used: number;
  total: number;
}

export function DiskUsageChart(serverId: string) {
  const [data, setData] = useState<DiskUsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/inventory/${serverId}/hardware`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch disk usage");
        return res.json();
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [serverId]);

  return { data, loading, error };
}
