import React, { FC, useState, useEffect } from 'react';
import { DatabaseInventory, ServerMetrics } from '@/types';
import { KPIWidget } from './KPIWidget';
import { PerformanceInsightsTable } from './PerformanceInsightsTable';
import { Cpu, MemoryStick, HardDrive, Activity, AlertCircle } from 'lucide-react';

interface ServerDetailViewProps {
    server: DatabaseInventory;
}

const useServerMetrics = (serverId: string | null) => {
    const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!serverId) return;
        const fetchMetrics = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/servers/${serverId}/metrics`);
                if (!res.ok) throw new Error('Failed to fetch server metrics');
                const data: ServerMetrics = await res.json();
                setMetrics(data);
                setError(null);
            } catch (err: any) {
                setError(err.message);
                setMetrics(null);
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

    if (isLoading) return <p className="text-center py-20 text-slate-400">Loading metrics for {server.systemName}...</p>;
    if (error) return <div className="text-red-400 p-3 bg-red-500/10 rounded-lg flex items-center gap-2"><AlertCircle size={16} />{error}</div>;
    if (!metrics) return <p className="text-center py-20 text-slate-500">No metrics available for this server.</p>;

    return (
        <div className="space-y-8">
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
               <KPIWidget icon={<Cpu size={24}/>} title="CPU" value={metrics.kpi.cpu} unit="%" color="sky" />
               <KPIWidget icon={<MemoryStick size={24}/>} title="Memory" value={metrics.kpi.memory} unit="%" color="violet" />
               <KPIWidget icon={<HardDrive size={24}/>} title="Disk I/O" value={metrics.kpi.disk} unit="%" color="green" />
               <KPIWidget icon={<Activity size={24}/>} title="Active Connections" value={metrics.kpi.connections} unit="" color="amber" />
            </section>
            <div className="bg-slate-800/50 p-6 rounded-xl border border-white/10">
                <PerformanceInsightsTable insights={metrics.performanceInsights} onAnalyze={() => {}} />
            </div>
        </div>
    );
};
