"use client";

import { useState, useEffect, FC } from "react";

interface TableListResponse {
  tables: string[];
}

interface Props {
  inventoryId: string;
  dbName: string;
}

const TableList: FC<Props> = ({ inventoryId, dbName }) => {
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const response = await fetch(`/api/inventory/tablelist?id=${inventoryId}&db=${dbName}`)

        if (!response.ok) throw new Error("Failed to fetch table list");

        const data: TableListResponse = await response.json();
        setTables(data.tables);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [inventoryId, dbName]);

  if (loading)
    return <p className="text-slate-400 italic text-sm px-4 py-2">Loading tables...</p>;

  if (error)
    return (
      <div className="text-red-500 bg-red-100 border border-red-300 px-4 py-3 rounded-md">
        ⚠️ Error: {error}
      </div>
    );

  return (
    <section className="bg-slate-800/40 rounded-lg p-6 border border-white/10">
      <h2 className="text-lg font-semibold text-white mb-4">
      Database Tables in <span className="text-sky-400">{dbName}</span>
      </h2>
      {tables.length > 0 ? (
        <ul className="list-disc list-inside space-y-1 text-slate-300">
          {tables.map((table, idx) => (
            <li key={idx}>{table}</li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500 italic">No tables found in this database.</p>
      )}
    </section>
  );
};

export default TableList;
