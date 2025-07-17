import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

interface QueryTrendChartProps {
  inventoryID: string;
}

export const QueryTrendChart: React.FC<QueryTrendChartProps> = ({ inventoryID }) => {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    fetch(`/api/inventory/${inventoryID}/query-trend`)
      .then((res) => res.json())
      .then((json) => setData(json));
      console.log("QueryTrendChart fetched:", json);
  }, [inventoryID]);

  if (!data) return <p className="text-sm text-slate-400">Loading Query Trends...</p>;

  const chartData = {
    labels: data.timestamps,
    datasets: [
      {
        label: 'Avg Duration (ms)',
        data: data.avgDurations,
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  return (
    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
      <h3 className="text-lg font-semibold mb-4 text-white">Query Duration Trend</h3>
      <Line data={chartData} />
    </div>
  );
};