"use client";

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { KPIWidget } from '@/components/dashboard/KPIWidget';
import { PerformanceInsightsTable } from '@/components/dashboard/PerformanceInsightsTable';
import { ManagementPanel } from '@/components/shared/ManagementPanel';
import { NetworkScannerPanel } from '@/components/shared/NetworkScannerPanel';
import { QueryAnalysisModal } from '@/components/dashboard/QueryAnalysisModal';
import { ServerFormModal } from '@/components/shared/ServerFormModal';
import { Server, ServerMetrics, ServerFormData, PerformanceInsight, DatabaseInventory } from '@/types/index';
import { Cpu, MemoryStick, ShieldCheck, Activity, BarChart, Settings, Wifi, AlertCircle, TrendingUp } from 'lucide-react';

export default function Home() {
  const [servers, setServers] = useState<DatabaseInventory[]>([]);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);

  // State for UI and interaction
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'manage' | 'scan'>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<Server | Partial<ServerFormData> | null>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [selectedQuery, setSelectedQuery] = useState<PerformanceInsight | null>(null);
    
    const API_URL = '/api'; // Use relative path for API calls

    const fetchServers = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/inventory');
            if (!response.ok) {
                throw new Error('Failed to fetch servers');
            }
            const data = await response.json();
            console.log('Fetched data:', data); // Debug log
            setServers(data.data);
        } catch (error) {
            console.error('Error:', error);
            setError('Could not load server list. Is the backend running?');
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchServers();
    }, []);

    useEffect(() => {
        if (!activeServerId) {
            setMetrics(null);
            return;
        };

        const fetchMetrics = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(`${API_URL}/servers/${activeServerId}/metrics`);
                if (!res.ok) {
                    const errorData = await res.json();
                    throw new Error(errorData.message || 'An unknown error occurred while fetching metrics.');
                }
                const data: ServerMetrics = await res.json();
                setMetrics(data);
            } catch (err: any) {
                console.error(`Failed to fetch metrics for server ${activeServerId}:`, err);
                setError(err.message);
                setMetrics(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetrics();
        const intervalId = setInterval(fetchMetrics, 30000);
        return () => clearInterval(intervalId);
    }, [activeServerId]);

    const handleSelectServer = (id: number) => {
        setActiveServerId(id);
        setActiveTab('dashboard');
    };

    const handleSaveServer = async (serverData: ServerFormData) => {
        const method = 'id' in serverData && serverData.id ? 'PUT' : 'POST';
        const endpoint = method === 'PUT' ? `${API_URL}/servers/${serverData.id}` : `${API_URL}/servers`;
        
        try {
            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverData)
            });
            if (!response.ok) {
                 const errorBody = await response.json();
                 throw new Error(errorBody.message || 'Failed to save server');
            }
            await fetchServers();
            setIsFormModalOpen(false);
            setEditingServer(null);
        } catch (err: any) {
            console.error(err);
            alert(`Error saving server: ${err.message}`);
        }
    };

    const handleDeleteServer = async (id: number) => {
        if (window.confirm('Are you sure you want to delete this server configuration?')) {
            try {
                const response = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Failed to delete server');
                // Refetch servers and reset active server if needed
                setActiveServerId(null); 
                fetchServers();
            } catch (err: any) {
                console.error(err);
                 alert(`Error deleting server: ${err.message}`);
            }
        }
    };
    
    const openAddModal = (partialServer?: Partial<ServerFormData>) => {
        setEditingServer(partialServer || null);
        setIsFormModalOpen(true);
    };

    const openEditModal = (server: Server) => {
        setEditingServer(server);
        setIsFormModalOpen(true);
    };
    
    const openAnalysisModal = (query: PerformanceInsight) => {
        setSelectedQuery(query);
        setIsAnalysisModalOpen(true);
    };

    const activeServer = servers.find(s => s.id === activeServerId);

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div className="error">{error}</div>;

    return (
        <div className="bg-slate-900 text-slate-300 min-h-screen flex font-sans">
            <Sidebar servers={servers} activeServerId={activeServerId} onSelectServer={handleSelectServer} />
            <ServerFormModal isOpen={isFormModalOpen} onClose={() => setIsFormModalOpen(false)} onSave={handleSaveServer} serverToEdit={editingServer} />
            <QueryAnalysisModal isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} query={selectedQuery} />

            <main className="flex-1 p-8 overflow-y-auto">
                 <div className="flex justify-between items-center mb-8">
                     <div className="flex space-x-2">
                        <button onClick={() => setActiveTab('dashboard')} className={`py-2 px-4 rounded-lg font-semibold text-sm flex items-center ${activeTab === 'dashboard' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><BarChart size={16} className="mr-2"/>Dashboard</button>
                        <button onClick={() => setActiveTab('manage')} className={`py-2 px-4 rounded-lg font-semibold text-sm flex items-center ${activeTab === 'manage' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Settings size={16} className="mr-2"/>Manage Connections</button>
                        <button onClick={() => setActiveTab('scan')} className={`py-2 px-4 rounded-lg font-semibold text-sm flex items-center ${activeTab === 'scan' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Wifi size={16} className="mr-2"/>Network Scan</button>
                    </div>
                     {isLoading && <div className="text-sky-400 animate-pulse">Loading data...</div>}
                </div>

                {activeTab === 'dashboard' && (
                    <>
                        <header className="mb-8">
                            <h2 className="text-4xl font-bold text-white">{activeServer?.name ?? 'Select a Server'}</h2>
                            {error && <div className="mt-4 text-red-400 p-3 bg-red-500/10 rounded-lg text-sm flex items-center"><AlertCircle size={16} className="mr-2"/><strong>Error:</strong> {error}</div>}
                        </header>
                         {activeServerId && !isLoading && metrics ? (
                            <div className="space-y-8">
                                 {metrics.hardwareError && 
                                    <div className="text-amber-400 p-3 bg-amber-500/10 rounded-lg text-sm flex items-center">
                                        <AlertCircle size={16} className="mr-2"/>
                                        <strong>Hardware metrics unavailable:</strong> {metrics.hardwareError}
                                    </div>
                                }
                                 <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                   <KPIWidget icon={<Cpu size={24}/>} title="CPU" value={metrics.kpi.cpu} unit="%" color="sky" />
                                   <KPIWidget icon={<MemoryStick size={24}/>} title="Memory" value={metrics.kpi.memory} unit="%" color="violet" />
                                   <KPIWidget icon={<ShieldCheck size={24}/>} title="Cache Hit Rate" value={metrics.stats?.cache_hit_rate} unit="%" color="green" />
                                   <KPIWidget icon={<Activity size={24}/>} title="Active Connections" value={metrics.kpi.connections} unit="" color="amber" />
                                </section>
                                <div className="bg-slate-800/50 p-6 rounded-xl border border-white/10">
                                    <h3 className="text-xl font-semibold mb-4 flex items-center text-white"><TrendingUp className="mr-3 text-sky-400"/>Top Slow Queries</h3>
                                    <PerformanceInsightsTable insights={metrics.performanceInsights} onAnalyze={openAnalysisModal} />
                                </div>
                            </div>
                        ) : (
                             !isLoading && <div className="text-center py-10 text-slate-500">{!error && "Please select a server to view metrics."}</div>
                        )}
                    </>
                )}
                
                {activeTab === 'manage' && <ManagementPanel servers={servers} onAdd={openAddModal} onEdit={openEditModal} onDelete={handleDeleteServer} />}
                {activeTab === 'scan' && <NetworkScannerPanel onAdd={openAddModal} />}
            </main>
        </div>
    );
};
