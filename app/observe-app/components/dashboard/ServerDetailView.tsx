import React, { FC, useState } from 'react';
import { DatabaseInventory, ServerMetrics } from '@/types';
import { KPIWidget } from './KPIWidget';
import { PerformanceInsightsTable } from '@/components/dashboard/PerformanceInsightsTable';

import { Cpu, MemoryStick, HardDrive, Activity, AlertCircle, BarChart, Server as ServerIcon, TrendingUp } from 'lucide-react';
// Props ที่รับมาจากหน้า Page หลัก
interface ServerDetailViewProps {
    server: DatabaseInventory;
    metrics: ServerMetrics | null;
    isLoading: boolean;
    error: string | null;
}

// Sub-component for displaying individual key-value details
const DetailItem: FC<{ label: string; value: string | number | undefined }> = ({ label, value }) => (
    <div className="flex justify-between border-b border-slate-700/50 py-3">
        <dt className="text-sm text-slate-400">{label}</dt>
        <dd className="text-sm font-medium text-white text-right">{value ?? 'N/A'}</dd>
    </div>
);

export const ServerDetailView: FC<ServerDetailViewProps> = ({ server, metrics, isLoading, error }) => {
    const [activeTab, setActiveTab] = useState<'performance' | 'hardware'>('performance');

    if (isLoading) {
        return <div className="text-center py-20 text-slate-400 animate-pulse">Loading metrics for {server.systemName}...</div>;
    }

    if (error) {
        return <div className="text-red-400 p-4 bg-red-500/10 rounded-lg flex items-center gap-3"><AlertCircle size={18} /> <strong>Error:</strong> {error}</div>;
    }
    
    if (!metrics) {
        return <p className="text-center py-20 text-slate-500">No metrics available for this server.</p>;
        
    }


    return (
        <div className="space-y-8">
            {/* Tabs for Performance/Hardware */}
            <div className="border-b border-slate-800">
                <nav className="-mb-px flex space-x-6">
                    <button onClick={() => setActiveTab('performance')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'performance' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                        <BarChart size={16} className="inline-block mr-2"/>Performance
                    </button>
                    <button onClick={() => setActiveTab('hardware')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'hardware' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
                        <ServerIcon size={16} className="inline-block mr-2"/>Hardware
                    </button>
                </nav>
            </div>

            {/* Hardware Error Display (if agent is unreachable) */}
            {metrics.hardwareError && 
                <div className="text-amber-400 p-3 bg-amber-500/10 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle size={16}/>
                    <strong>Hardware metrics unavailable:</strong> {metrics.hardwareError}
                </div>
            }

            {/* Content for "Performance" Tab */}
            {activeTab === 'performance' && (
                <div className="space-y-8">
                    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                       <KPIWidget icon={<Cpu size={24}/>} title="CPU" value={metrics.kpi.cpu} unit="%" color="sky" />
                       <KPIWidget icon={<MemoryStick size={24}/>} title="Memory" value={metrics.kpi.memory} unit="%" color="violet" />
                       <KPIWidget icon={<HardDrive size={24}/>} title="Disk I/O" value={metrics.kpi.disk} unit="%" color="green" />
                       <KPIWidget icon={<Activity size={24}/>} title="Active Connections" value={metrics.kpi.connections} unit="" color="amber" />
                    </section>
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                        <h3 className="text-xl font-semibold mb-4 flex items-center text-white"><TrendingUp className="mr-3 text-sky-400"/>Database Performance Insights</h3>
                        <PerformanceInsightsTable insights={metrics.performanceInsights} onAnalyze={() => {}} />
                    </div>
                </div>
            )}
            
            {/* Content for "Hardware" Tab - UPDATED */}
            {activeTab === 'hardware' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Column 1: Static Connection & System Details */}
                    <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                        <h3 className="text-xl font-semibold mb-4 text-white">Connection & System Details</h3>
                        <dl className="space-y-2">
                            <DetailItem label="System Name" value={server.systemName} />
                            <DetailItem label="Zone" value={server.zone} />
                            <DetailItem label="Server Host" value={server.serverHost} />
                            <DetailItem label="Port" value={server.port} />
                            <DetailItem label="Database Name" value={server.databaseName} />
                            <DetailItem label="Database Type" value={server.databaseType} />
                            <DetailItem label="Connection Username" value={server.connectionUsername} />
                            <DetailItem label="Owner Contact" value={server.ownerContact} />
                        </dl>
                    </div>
                    {/* Column 2: Live Hardware Status */}
                     <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                        <h3 className="text-xl font-semibold mb-4 text-white">Live Hardware Status</h3>
                        {metrics.hardwareError ? (
                            <div className="text-amber-400 text-sm p-3 bg-amber-500/10 rounded-lg">
                                Could not retrieve live hardware data.
                            </div>
                        ) : (
                            <dl className="space-y-2">
                                <DetailItem label="CPU Usage" value={`${metrics.kpi.cpu}%`} />
                                <DetailItem label="Memory Usage" value={`${metrics.kpi.memory}%`} />
                                {/* More live hardware stats parsed from the agent can be added here */}
                            </dl>
                        )}
                         <div className="mt-6 pt-4 border-t border-slate-800">
                            <h4 className="text-sm font-medium text-slate-400 mb-2">Purpose Notes</h4>
                            <div className="bg-slate-800/50 p-3 rounded-lg text-slate-300 text-sm whitespace-pre-wrap">
                                {server.purposeNotes || 'No notes provided.'}
                            </div>
                         </div>
                    </div>
                </div>
            )}
        </div>
    );
};
