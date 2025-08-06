// app/inventory/[id]/tablelist/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { 
  ArrowLeft, 
  Database, 
  Table, 
  GitBranch, 
  Search, 
  Grid3X3, 
  Eye,
  Link,

  MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TableInfo {
  name: string;
  rows?: number;
  columns?: number;
  type?: 'table' | 'view';
}

interface Relation {
  id: string;
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

interface TableListResponse {
  tables: string[] | TableInfo[];
  relations?: Relation[];
}

type TabType = 'tables' | 'relations';

export default function TableListPage() {
  const params = useParams();
  const id = params?.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const dbName = searchParams.get("db");
  
  const [activeTab, setActiveTab] = useState<TabType>('tables');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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
          `/api/inventory/tablelist?id=${encodeURIComponent(id)}&db=${encodeURIComponent(dbName)}&include_relations=true`
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: Failed to fetch table list`
          );
        }

        const data: TableListResponse = await response.json();
        
        // Handle both string[] and TableInfo[] formats
        const tableList = (data.tables || []).map((table) => {
          if (typeof table === 'string') {
            return { 
              name: table, 
              type: 'table' as const,
            };
          }
          return table;
        });
        
        setTables(tableList);
        setRelations(data.relations || generateMockRelations(tableList));
      } catch (err) {
        console.error("Fetch tables error:", err);
        setError(
          err instanceof Error ? err.message : "An unknown error occurred"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [params.id, dbName, id]);

  // Mock relations generator (remove this when you have real API)
  const generateMockRelations = (tableList: TableInfo[]): Relation[] => {
    if (tableList.length < 2) return [];
    
    const relations: Relation[] = [];
    for (let i = 0; i < Math.min(tableList.length - 1, 3); i++) {
      relations.push({
        id: `rel_${i}`,
        fromTable: tableList[i].name,
        toTable: tableList[i + 1].name,
        fromColumn: 'id',
        toColumn: `${tableList[i].name}_id`,
        type: Math.random() > 0.5 ? 'one-to-many' : 'one-to-one'
      });
    }
    return relations;
  };

  const handleBack = () => {
    router.back();
  };

  const handleTableClick = (tableName: string) => {
    router.push(`/inventory/${id}/table/${tableName}?db=${encodeURIComponent(dbName? dbName : '')}`);
  };

  const filteredTables = tables.filter(table => {
    const matchesSearch = table.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch 
  });

  const filteredRelations = relations.filter(relation => 
    relation.fromTable.toLowerCase().includes(searchQuery.toLowerCase()) ||
    relation.toTable.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRelationIcon = (type: Relation['type']) => {
    switch (type) {
      case 'one-to-one': return '1:1';
      case 'one-to-many': return '1:N';
      case 'many-to-many': return 'N:N';
    }
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
              Missing database name in query string. Please navigate back and try again.
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
              variant="ghost"
              size="sm"
              className="border-slate-900 hover:bg-slate-600"
            >
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
                  Exploring{" "}
                  <span className="text-sky-400 font-medium">{dbName}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab('tables')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                activeTab === 'tables'
                  ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-800/50'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/30'
              }`}
            >
              <Table size={18} />
              Tables ({tables.length})
            </button>
            <button
              onClick={() => setActiveTab('relations')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                activeTab === 'relations'
                  ? 'text-sky-400 border-b-2 border-sky-400 bg-slate-800/50'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/30'
              }`}
            >
              <GitBranch size={18} />
              Relations ({relations.length})
            </button>
          </div>

          {/* Search and Filter Bar */}
          <div className="p-6 border-b border-slate-800 bg-slate-900/50">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
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
              {activeTab === 'tables' ? (
                <>
                  {filteredTables.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredTables.map((table, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleTableClick(table.name)}
                          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg hover:shadow-sky-500/10 transition-all duration-200 cursor-pointer group"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${
                                table.type === 'view' ? 'bg-purple-500/20' : 'bg-sky-500/20'
                              }`}>
                                <Table
                                  size={16}
                                  className={`${
                                    table.type === 'view' ? 'text-purple-400' : 'text-sky-400'
                                  } group-hover:scale-110 transition-transform`}
                                />
                              </div>
                              <div>
                                <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors">
                                  {table.name}
                                </h3>
                                <p className="text-xs text-slate-500 capitalize">
                                  {table.type || 'table'}
                                </p>
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
                  ) : (
                    <div className="text-center py-12">
                      <Table size={48} className="text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-400 mb-2">
                        {searchQuery ? 'No Tables Found' : 'No Tables Available'}
                      </h3>
                      <p className="text-slate-500">
                        {searchQuery 
                          ? `No tables match "${searchQuery}". Try adjusting your search.`
                          : 'This database doesn\'t contain any tables, or you don\'t have permission to view them.'
                        }
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {filteredRelations.length > 0 ? (
                    <div className="space-y-4">
                      {filteredRelations.map((relation) => (
                        <div
                          key={relation.id}
                          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 hover:bg-slate-800 hover:border-slate-600 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="p-2 bg-emerald-500/20 rounded-lg">
                                <Link size={16} className="text-emerald-400" />
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-slate-200">{relation.fromTable}</span>
                                <span className="text-slate-500">({relation.fromColumn})</span>
                                <div className="flex items-center gap-2">
                                  <div className="h-px w-6 bg-slate-600"></div>
                                  <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">
                                    {getRelationIcon(relation.type)}
                                  </span>
                                  <div className="h-px w-6 bg-slate-600"></div>
                                </div>
                                <span className="text-slate-500">({relation.toColumn})</span>
                                <span className="font-medium text-slate-200">{relation.toTable}</span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500 capitalize">
                              {relation.type.replace('-', ' ')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <GitBranch size={48} className="text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-400 mb-2">
                        {searchQuery ? 'No Relations Found' : 'No Relations Available'}
                      </h3>
                      <p className="text-slate-500">
                        {searchQuery 
                          ? `No relations match "${searchQuery}". Try adjusting your search.`
                          : 'No foreign key relationships were found in this database.'
                        }
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