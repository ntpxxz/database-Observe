// app/inventory/[id]/tablelist/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Database,
  Table,
  GitBranch,
  Search,
  Grid3X3,
  Eye,  
  MoreVertical,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// === React Flow ===
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";
import dagre from 'dagre'
interface TableInfo {
  name: string;
  rows?: number;
  columns?: number;
  type?: "table" | "view";
}

interface Relation {
  id: string;
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
}

interface TableListResponse {
  tables: string[] | TableInfo[];
  relations?: Relation[];
}

type TabType = "tables" | "relations";

// Pagination helper
const usePagination = <T,>(items: T[], pageSize: number, currentPage: number) => {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = items.slice(startIndex, startIndex + pageSize);
  return { paginatedItems, totalPages };
};

export default function TableListPage() {
  const params = useParams();
  const id = params?.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const dbName = searchParams.get("db");

  const [activeTab, setActiveTab] = useState<TabType>("tables");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination for Tables
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;


  
  // Reset page when switching tabs, search, or database changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, dbName]);

  useEffect(() => {
    if (!dbName) {
      setError("Missing database name in query string");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/inventory/tablelist?id=${encodeURIComponent(
            id
          )}&db=${encodeURIComponent(dbName)}&include_relations=true`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: Failed to fetch table list`);
        }

        const data: TableListResponse = await response.json();

        // Normalize tables
        const tableList = (data.tables || []).map((table) =>
          typeof table === "string"
            ? {
                name: table,
                type: "table" as const,
              }
            : table
        );

        setTables(tableList);
        setRelations(data.relations || []);
        setError(null);
      } catch (err) {
        console.error("Fetch tables error:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, dbName]);

  const handleBack = () => {
    router.back();
  };

  /*const handleTableClick = (tableName: string) => {
    router.push(
      `/inventory/${id}/table/${tableName}?db=${encodeURIComponent(dbName ? dbName : "")}`
    );
  };*/

  // ---- Filtering (memoized) ----
  const filteredTables = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return tables.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, searchQuery]);

  const filteredRelations = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return relations.filter(
      (r) =>
        r.fromTable.toLowerCase().includes(q) ||
        r.toTable.toLowerCase().includes(q) ||
        r.fromColumn.toLowerCase().includes(q) ||
        r.toColumn.toLowerCase().includes(q)
    );
  }, [relations, searchQuery]);

  // ---- Pagination (after filtering) for Tables only ----
  const {
    paginatedItems: paginatedTables,
    totalPages: totalTablePages,
  } = usePagination(filteredTables, pageSize, currentPage);

  // ---- UI helpers ----
  const PaginationControls = ({ totalPages }: { totalPages: number }) => (
    <div className="flex justify-center items-center gap-4 mt-6">
      <Button
        variant="ghost"
        size="sm"
        disabled={currentPage === 1}
        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
      >
        <ChevronLeft size={16} />
        Prev
      </Button>
      <span className="text-slate-400">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={currentPage === totalPages}
        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
      >
        Next
        <ChevronRight size={16} />
      </Button>
    </div>
  );

  const getRelationIcon = (type: Relation["type"]) => {
    switch (type) {
      case "one-to-one":
        return "1:1";
      case "one-to-many":
        return "1:N";
      case "many-to-many":
        return "N:N";
    }
  };

  // --- Dagre layout helper ---
const nodeWidth = 160;
const nodeHeight = 48;

function layout(nodes: any[], edges: any[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 60, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width: nodeWidth, height: nodeHeight }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    return {
      ...n,
      position: { x: p.x - nodeWidth / 2, y: p.y - nodeHeight / 2 },
    };
  });
}

// ---- Build nodes & edges from filteredRelations, then apply layout ----
const { diagramNodes, diagramEdges } = useMemo(() => {
  // สร้างชุดชื่อ table จาก relations
  const tableSet = new Set<string>();
  filteredRelations.forEach((r) => {
    tableSet.add(r.fromTable);
    tableSet.add(r.toTable);
  });

  // nodes ดิบ (ยังไม่จัดตำแหน่ง)
  const rawNodes = Array.from(tableSet).map((t) => ({
    id: t,
    data: { label: t },
    position: { x: 0, y: 0 }, // จะถูกแทนด้วย dagre
    style: {
      border: "1px solid #475569",
      padding: 10,
      borderRadius: 8,
      background: "#0b1220",
      color: "#e2e8f0",
      fontSize: 12,
      boxShadow: "0 4px 14px rgba(14,165,233,.15)",
    },
  }));

  // กัน edge ซ้ำด้วย key ที่อิงจาก from/to/columns
  const seen = new Set<string>();
  const rawEdges = filteredRelations
    .map((r, idx) => {
      const key = `${r.fromTable}__${r.fromColumn}__${r.toTable}__${r.toColumn}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        id: `edge-${idx}-${key}`,
        source: r.fromTable,
        target: r.toTable,
        label: `${r.fromColumn} → ${r.toColumn} (${getRelationIcon(r.type)})`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#0ea5e9" },
        labelStyle: { fill: "#e2e8f0", fontSize: 10 },
      };
    })
    .filter(Boolean) as any[];

  // จัด layout ด้วย dagre
  const laidOutNodes = layout(rawNodes, rawEdges);

  return { diagramNodes: laidOutNodes, diagramEdges: rawEdges };
}, [filteredRelations]);

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
              Missing database name in query string. Please navigate back and try again.
            </p>
            <Button onClick={handleBack} className="mt-4 bg-red-500/20 hover:bg-red-500/30">
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
            <Button onClick={handleBack} variant="ghost" size="sm" className="border-slate-900 hover:bg-slate-600">
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sky-500/20 rounded-lg">
                <Database className="text-sky-400" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Database Explorer</h1>
                <p className="text-slate-400">
                  Exploring <span className="text-sky-400 font-medium">{dbName}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab("tables")}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                activeTab === "tables"
                  ? "text-sky-400 border-b-2 border-sky-400 bg-slate-800/50"
                  : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/30"
              }`}
            >
              <Table size={18} />
              Tables ({tables.length})
            </button>
            <button
              onClick={() => setActiveTab("relations")}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                activeTab === "relations"
                  ? "text-sky-400 border-b-2 border-sky-400 bg-slate-800/50"
                  : "text-slate-400 hover:text-slate-300 hover:bg-slate-800/30"
              }`}
            >
              <GitBranch size={18} />
              Relations ({relations.length})
            </button>
          </div>

          {/* Search */}
          <div className="p-6 border-b border-slate-800 bg-slate-900/50">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-slate-800 border-slate-700 focus:border-sky-500"
                />
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto mb-4" />
              <p className="text-slate-400">Loading {activeTab}...</p>
            </div>
          ) : error ? (
            <div className="p-8">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                <div className="flex items-center gap-3 text-red-400 mb-3">
                  <Database size={20} />
                  <h2 className="text-lg font-semibold">Error Loading {activeTab}</h2>
                </div>
                <p className="text-red-300 mb-4">{error}</p>
                <Button onClick={() => window.location.reload()} className="bg-red-500/20 hover:bg-red-500/30">
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-6">
              {activeTab === "tables" ? (
                <>
                  {paginatedTables.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginatedTables.map((table, idx) => (
                          <div
                            key={`${table.name}-${idx}`}
                            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg hover:shadow-sky-500/10 transition-all duration-200 cursor-pointer group"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-2 rounded-lg ${
                                    table.type === "view" ? "bg-purple-500/20" : "bg-sky-500/20"
                                  }`}
                                >
                                  <Table
                                    size={16}
                                    className={`${
                                      table.type === "view" ? "text-purple-400" : "text-sky-400"
                                    } group-hover:scale-110 transition-transform`}
                                  />
                                </div>
                                <div>
                                  <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors">
                                    {table.name}
                                  </h3>
                                  <p className="text-xs text-slate-500 capitalize">{table.type || "table"}</p>
                                </div>
                              </div>
                              <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-all">
                                <MoreVertical size={14} className="text-slate-400" />
                              </button>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1 text-slate-400">
                                  <Grid3X3 size={12} />
                                  <span>{table.rows?.toLocaleString() || 0} rows</span>
                                </div>
                                <div className="flex items-center gap-1 text-slate-400">
                                  <Database size={12} />
                                  <span>{table.columns || 0} cols</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-sky-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Eye size={12} />
                                <span className="text-xs">View</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <PaginationControls totalPages={totalTablePages} />
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <Table size={48} className="text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-400 mb-2">
                        {searchQuery ? "No Tables Found" : "No Tables Available"}
                      </h3>
                      <p className="text-slate-500">
                        {searchQuery
                          ? `No tables match "${searchQuery}". Try adjusting your search.`
                          : "This database doesn't contain any tables, or you don't have permission to view them."}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                // ===== Relations Diagram =====
                <>
                  {filteredRelations.length > 0 ? (
                    <div className="rounded-lg border border-slate-800 overflow-hidden">
                      <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60 text-slate-300 text-sm">
                        Relation Diagram (drag to move, scroll to zoom)
                      </div>
                      <div style={{ height: 600, background: "#0f172a" }}>
                      <ReactFlow nodes={diagramNodes} edges={diagramEdges} fitView>
  <Background color="#334155" gap={16} />
  <Controls />
</ReactFlow>

                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <GitBranch size={48} className="text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-400 mb-2">
                        {searchQuery ? "No Relations Found" : "No Relations Available"}
                      </h3>
                      <p className="text-slate-500">
                        {searchQuery
                          ? `No relations match "${searchQuery}". Try adjusting your search.`
                          : "No foreign key relationships were found in this database."}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div> 
  );
}
