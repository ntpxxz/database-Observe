export const parseNodeExporterMetrics = (metricsText: string): { cpu?: number, memory?: number } => {
    const lines = metricsText.split('\n');
    const metrics: { cpu?: number, memory?: number } = {};
    try {
        const memTotalLine = lines.find(line => line.startsWith('node_memory_MemTotal_bytes'));
        const memFreeLine = lines.find(line => line.startsWith('node_memory_MemFree_bytes'));
        const memBuffersLine = lines.find(line => line.startsWith('node_memory_Buffers_bytes'));
        const memCachedLine = lines.find(line => line.startsWith('node_memory_Cached_SReclaimable_bytes') || line.startsWith('node_memory_Cached_bytes'));

        if (memTotalLine && memFreeLine && memBuffersLine && memCachedLine) {
            const total = parseFloat(memTotalLine.split(' ')[1]);
            const free = parseFloat(memFreeLine.split(' ')[1]);
            const buffers = parseFloat(memBuffersLine.split(' ')[1]);
            const cached = parseFloat(memCachedLine.split(' ')[1]);
            const used = total - free - buffers - cached;
            metrics.memory = Math.round((used / total) * 100);
        }

        const load1Line = lines.find(line => line.startsWith('node_load1 '));
        if (load1Line) {
            const load1 = parseFloat(load1Line.split(' ')[1]);
            metrics.cpu = Math.min(Math.round(load1 * 25), 100);
        }
    } catch (e) {
        console.error("Error parsing agent metrics:", e);
    }
    return metrics;
};
