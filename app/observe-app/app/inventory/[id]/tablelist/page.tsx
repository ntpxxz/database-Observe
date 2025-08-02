"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Database, Table } from "lucide-react";
import { Button } from "@/components/ui/button";

// A mock interface for the API response
interface TableListResponse {
  tables: string[];
}

export default function TableListPage() {
  // We're using a hardcoded value for the app id and database name
  // since the next/navigation hooks are not available in this environment.
  const [id] = useState("some-app-id");
  const [dbName] = useState("example-db");
  
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // We'll simulate fetching data from a hardcoded endpoint
    // since the next/navigation hooks are not available.
    const fetchTables = async () => {
      try {
        setLoading(true);
        // This is a placeholder fetch call. You will need to replace this
        // with your actual API endpoint or data source.
        // For now, we'll simulate a fetch with dummy data.
        const response = await new Promise<TableListResponse>((resolve) => {
          setTimeout(() => {
            resolve({ tables: ["users", "products", "orders", "analytics"] });
          }, 1500);
        });

        setTables(response.tables || []);
      } catch (err) {
        console.error("Fetch tables error:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [id, dbName]);

  const handleBack = () => {
    // Since we don't have Next.js router, we'll use the browser's history API
    window.history.back();
  };

  const handleTableClick = (tableName: string) => {
    // This is where you would add your navigation logic, e.g., to a table details page.
    // For now, we'll just log it to the console.
    console.log(`Navigating to table: ${tableName}`);
    // Example navigation for a different environment: window.location.href = `/inventory/${id}/table/${tableName}`;
  };

  if (!dbName) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-8 sm:p-12 lg:p-16">
        <div className="container mx-auto max-w-2xl">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 text-center shadow-lg">
            <div className="flex flex-col items-center gap-4 text-red-400">
              <Database size={48} className="animate-pulse" />
              <h1 className="text-2xl font-bold">Error</h1>
            </div>
            <p className="mt-4 text-red-300">
              The database name is missing from the URL. Please go back and select a database to view its tables.
            </p>
            <Button
              onClick={handleBack}
              className="mt-6 bg-red-500/20 hover:bg-red-500/30 transition-colors duration-200"
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
    <div className="min-h-screen bg-slate-950 text-white p-6 sm:p-8 md:p-12">
      <div className="container mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 sm:mb-12">
          <div className="flex items-center gap-4 mb-4 sm:mb-0">
            <Button
              onClick={handleBack}
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <Database className="text-sky-400" size={32} />
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                  Database Tables
                </h1>
                <p className="text-slate-400 text-sm sm:text-base">
                  Viewing tables for: <span className="text-sky-400 font-bold">{dbName}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          {loading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-b-sky-500 mx-auto mb-6" />
              <p className="text-slate-400 text-lg">Loading tables...</p>
            </div>
          ) : error ? (
            <div className="p-12">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-8 text-center">
                <div className="flex flex-col items-center gap-4 text-red-400 mb-6">
                  <Database size={48} />
                  <h2 className="text-2xl font-bold">Error Loading Tables</h2>
                </div>
                <p className="text-red-300 mb-6">{error}</p>
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-red-500/20 hover:bg-red-500/30 transition-colors duration-200"
                >
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-8">
              <div className="flex items-center gap-4 mb-8">
                <Table className="text-sky-400" size={24} />
                <h2 className="text-2xl font-bold text-white">
                  Tables ({tables.length})
                </h2>
              </div>

              {tables.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {tables.map((table, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleTableClick(table)}
                      className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800 hover:border-sky-500/50 transition-all duration-200 cursor-pointer group shadow-md hover:shadow-lg transform hover:-translate-y-1"
                    >
                      <div className="flex items-center gap-4">
                        <Table
                          size={20}
                          className="text-slate-400 group-hover:text-sky-400 transition-colors"
                        />
                        <span className="text-slate-300 text-lg group-hover:text-white transition-colors font-semibold">
                          {table}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center gap-4 mb-6">
                    <Table size={64} className="text-slate-600" />
                    <h3 className="text-xl font-bold text-slate-400">
                      No Tables Found
                    </h3>
                  </div>
                  <p className="text-slate-500 max-w-sm mx-auto">
                    This database does not contain any tables, or you do not have permission to view them.
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
