import React, { FC} from 'react';
import { TrendingUp, Target, AlertTriangle } from 'lucide-react';
import { useAlertStatistics } from '@/app/hooks/useAlertStatistics';

interface AlertDashboardProps {
  stats: ReturnType<typeof useAlertStatistics>;
  onViewHistory: () => void;
  onConfigureAlerts: () => void;
}

export const AlertDashboard: FC<AlertDashboardProps> = ({ 
  stats, 
  onViewHistory,
}) => {
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  // ✅ Remove the conflicting local function
  // The onConfigureAlerts from props will be used instead

  return (
    <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Target size={20} className="text-blue-400" />
          Alert Overview
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onViewHistory}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            View History
          </button>
          {/*<button
            onClick={onConfigureAlerts} // ✅ Now properly typed
            className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            Configure
          </button>*/}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-sm text-slate-400">Total Alerts</div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.thisWeek} this week
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{stats.critical}</div>
          <div className="text-sm text-slate-400">Critical</div>
          <div className="text-xs text-slate-500 mt-1">
            {((stats.critical / (stats.total || 1)) * 100).toFixed(1)}% of total
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{stats.resolved}</div>
          <div className="text-sm text-slate-400">Resolved</div>
          <div className="text-xs text-slate-500 mt-1">
            {((stats.resolved / (stats.total || 1)) * 100).toFixed(1)}% resolved
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-400">
            {stats.averageResolutionTime > 0 ? formatDuration(stats.averageResolutionTime) : 'N/A'}
          </div>
          <div className="text-sm text-slate-400">Avg Resolution</div>
          <div className="text-xs text-slate-500 mt-1">
            Time to resolve
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-2">Most Active Metric</h4>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-amber-400">
              {stats.mostFrequentMetric || 'None'}
            </span>
            {stats.mostFrequentMetric && (
              <TrendingUp size={16} className="text-amber-400" />
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-lg p-4">
          <h4 className="text-sm font-medium text-white mb-2">Peak Alert Hours</h4>
          <div className="flex gap-2">
            {stats.peakAlertHours.slice(0, 3).map((hour) => (
              <span key={hour} className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                {hour.toString().padStart(2, '0')}:00
              </span>
            ))}
            {stats.peakAlertHours.length === 0 && (
              <span className="text-sm text-slate-500">No data</span>
            )}
          </div>
        </div>
      </div>

      {stats.today > 0 && (
        <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-400 text-sm">
            <AlertTriangle size={14} />
            <strong>{stats.today} alerts today</strong>
            {stats.today > stats.thisWeek / 7 && (
              <span className="text-xs">• Above average</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};