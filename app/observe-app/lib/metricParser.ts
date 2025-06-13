export const parseNodeExporterMetrics = (metricsText: string): { cpu?: number, memory?: number } => {
    const lines = metricsText.split('\n');
    const metrics: { cpu?: number, memory?: number } = {};

    try {
        // --- Memory Parsing ---
        const memTotalLine = lines.find(line => line.startsWith('node_memory_MemTotal_bytes'));
        const memFreeLine = lines.find(line => line.startsWith('node_memory_MemFree_bytes'));
        const memBuffersLine = lines.find(line => line.startsWith('node_memory_Buffers_bytes'));
        // Use SReclaimable for modern kernels, fallback to Cached
        const memCachedLine = lines.find(line => line.startsWith('node_memory_Cached_SReclaimable_bytes') || line.startsWith('node_memory_Cached_bytes'));

        if (memTotalLine && memFreeLine && memBuffersLine && memCachedLine) {
            const total = parseFloat(memTotalLine.split(' ')[1]);
            const free = parseFloat(memFreeLine.split(' ')[1]);
            const buffers = parseFloat(memBuffersLine.split(' ')[1]);
            const cached = parseFloat(memCachedLine.split(' ')[1]);
            
            // In Linux, "used" memory is more accurately calculated by subtracting free, buffers, and cache from the total.
            const used = total - free - buffers - cached;
            const memoryUsagePercentage = (used / total) * 100;
            metrics.memory = Math.round(memoryUsagePercentage);
        }

        // --- CPU Parsing ---
        // Calculating real-time CPU usage is complex and requires comparing two points in time.
        // A simpler and effective alternative for a dashboard is to use the 1-minute load average.
        const load1Line = lines.find(line => line.startsWith('node_load1 '));
        if (load1Line) {
            const load1 = parseFloat(load1Line.split(' ')[1]);
            // This is a simplified conversion of load average to a percentage.
            // A more accurate method might involve dividing by the number of CPU cores.
            metrics.cpu = Math.min(Math.round(load1 * 25), 100); // Assuming 1.0 load roughly equals 25% utilization for this example.
        }
    } catch (e) {
        console.error("Error parsing agent metrics:", e);
    }
    
    return metrics;
};
