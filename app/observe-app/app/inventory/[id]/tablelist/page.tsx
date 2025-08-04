// app/inventory/[id]/tablelist/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Database, Table } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TableListResponse {
  tables: string[];
}

export default function TableListPage() {
  const params = useParams();
  const id = params?.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const dbName = searchParams.get("db");
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!dbName) {
      setError("Missing database name in query string");
      setLoading(false);
      return;
    }

    const fetchTables = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/inventory/tablelist?id=${encodeURIComponent(id)}&db=${encodeURIComponent(dbName)}`
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: Failed to fetch table list`
          );
        }

        const data: TableListResponse = await response.json();
        setTables(data.tables || []);
      } catch (err) {
        console.error("Fetch tables error:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [params.id, dbName, id]);

  const handleBack = () => {
    router.back();
  };

  if (!dbName) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="container mx-auto px-6 py-8">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
            <div className="flex items-center gap-3 text-red-400">
              <Database size={20} />
              <h1 className="text-lg font-semibold">Error</h1>
            </div>
            <p className="mt-2 text-red-300">
              Missing database name in query string. Please navigate back and
              try again.
            </p>
            <Button
              onClick={handleBack}
              className="mt-4 bg-red-500/20 hover:bg-red-500/30"
            >
              <ArrowLeft size={16} className="mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleBack}
              variant="outline"
              size="sm"
              className="border-slate-700 hover:bg-slate-800"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <Database className="text-sky-400" size={24} />
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Database Tables
                </h1>
                <p className="text-slate-400">
                  Tables in{" "}
                  <span className="text-sky-400 font-medium">{dbName}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto mb-4" />
              <p className="text-slate-400">Loading tables...</p>
            </div>
          ) : error ? (
            <div className="p-8">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                <div className="flex items-center gap-3 text-red-400 mb-3">
                  <Database size={20} />
                  <h2 className="text-lg font-semibold">
                    Error Loading Tables
                  </h2>
                </div>
                <p className="text-red-300 mb-4">{error}</p>
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-red-500/20 hover:bg-red-500/30"
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <Table className="text-sky-400" size={20} />
                <h2 className="text-xl font-semibold text-white">
                  Tables ({tables.length})
                </h2>
              </div>

              {tables.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {tables.map((table, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 hover:bg-slate-800 hover:border-slate-600 transition-all duration-200 cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <Table
                          size={16}
                          className="text-slate-400 group-hover:text-sky-400 transition-colors"
                        />
                        <span className="text-slate-300 group-hover:text-white transition-colors font-medium">
                          {table}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Table size={48} className="text-slate-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-400 mb-2">
                    No Tables Found
                  </h3>
                  <p className="text-slate-500">
                    This database dont contain any tables, or you have
                    permission to view them.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
