import React, { FC, useState, useEffect } from 'react';
import { DatabaseInventory, ServerMetrics } from '@/types';
import { KPIWidget } from './KPIWidget';
import { PerformanceInsightsTable } from './PerformanceInsightsTable';
import { Cpu, MemoryStick, HardDrive, Activity, BarChart, Server as ServerIcon } from 'lucide-react';

interface ServerDetailViewProps {
    server: DatabaseInventory;
}

const useServerMetrics = (serverId: string | null) => {
    const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!serverId) return;
        const fetchMetrics = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/servers/${serverId}/metrics`);
                if (!res.ok) throw new Error('Failed to fetch server metrics');
                const data: ServerMetrics = await res.json();
                setMetrics(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchMetrics();
    }, [serverId]);

    return { metrics, isLoading, error };
};

export const ServerDetailView: FC<ServerDetailViewProps> = ({ server }) => {
    const { metrics, isLoading, error } = useServerMetrics(server.inventoryID);
    const [activeTab, setActiveTab] = useState<'performance' | 'hardware'>('performance');

    return (
        <div>
            <header className="flex justify-between items-center mb-8">
                <h2 className="text-4xl font-bold text-white">{server.systemName}</h2>
                {metrics && (
                     <div className={`px-3 py-1 rounded-full font-bold text-xs flex items-center capitalize bg-green-500/10 text-green-300`}>
                        <div className={`w-2 h-2 rounded-full mr-2 bg-green-400`}></div>
                        Healthy
                    </div>
                )}
            </header>
            <div className="border-b border-slate-800 mb-8">
                <nav className="-mb-px flex space-x-6">
                    <button onClick={() => setActiveTab('performance')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'performance' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                        Performance
                    </button>
                    <button onClick={() => setActiveTab('hardware')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'hardware' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                        Hardware
                    </button>
                </nav>
            </div>
            
            {isLoading && <p>Loading metrics for {server.systemName}...</p>}
            {error && <div className="text-red-400 p-3 bg-red-500/10 rounded-lg">{error}</div>}

            {metrics && activeTab === 'performance' && (
                <div className="space-y-8">
                    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                       <KPIWidget icon={<Cpu size={24}/>} title="CPU" value={metrics?.kpi?.cpu} unit="%" color="sky" />
                       <KPIWidget icon={<MemoryStick size={24}/>} title="Memory" value={metrics?.kpi?.memory} unit="%" color="violet" />
                       <KPIWidget icon={<HardDrive size={24}/>} title="Disk I/O" value={metrics?.kpi?.disk} unit="%" color="green" />
                       <KPIWidget icon={<Activity size={24}/>} title="Active Connections" value={metrics?.kpi?.connections} unit="" color="amber" />
                    </section>
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                        <PerformanceInsightsTable insights={metrics?.performanceInsights} onAnalyze={() => {}} />
                    </div>
                </div>
            )}

            {activeTab === 'hardware' && <p>Hardware details will be displayed here.</p>}
        </div>
    );
};
