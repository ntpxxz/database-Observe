import React, { FC, useState, useMemo } from 'react';
import { History, Filter, Trash2, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

export interface AlertHistoryItem {
  id: string;
  timestamp: Date;
  metric: string;
  level: 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
  resolved?: Date;
  duration?: number; // in minutes
}

interface AlertHistoryProps {
  alerts: AlertHistoryItem[];
  onClear: () => void;
}

type FilterType = 'all' | 'critical' | 'warning' | 'active' | 'resolved';

export const AlertHistory: FC<AlertHistoryProps> = ({ alerts, onClear }) => {
  const [filter, setFilter] = useState<FilterType>('all');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      switch (filter) {
        case 'critical':
          return alert.level === 'critical';
        case 'warning':
          return alert.level === 'warning';
        case 'active':
          return !alert.resolved;
        case 'resolved':
          return !!alert.resolved;
        default:
          return true;
      }
    });
  }, [alerts, filter]);

  const groupedAlerts = useMemo(() => {
    return filteredAlerts.reduce((acc, alert) => {
      const date = alert.timestamp.toDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(alert);
      return acc;
    }, {} as Record<string, AlertHistoryItem[]>);
  }, [filteredAlerts]);

  const stats = useMemo(() => {
    const total = alerts.length;
    const critical = alerts.filter(a => a.level === 'critical').length;
    const warning = alerts.filter(a => a.level === 'warning').length;
    const active = alerts.filter(a => !a.resolved).length;
    const resolved = alerts.filter(a => a.resolved).length;
    
    return { total, critical, warning, active, resolved };
  }, [alerts]);

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const getMetricIcon = (metric: string) => {
    switch (metric.toLowerCase()) {
      case 'cpu': return '🖥️';
      case 'memory': return '💾';
      case 'connections': return '🔌';
      case 'cache': return '⚡';
      default: return '📊';
    }
  };

  const filterOptions: { value: FilterType; label: string; count?: number }[] = [
    { value: 'all', label: 'All Alerts', count: stats.total },
    { value: 'critical', label: 'Critical', count: stats.critical },
    { value: 'warning', label: 'Warning', count: stats.warning },
    { value: 'active', label: 'Active', count: stats.active },
    { value: 'resolved', label: 'Resolved', count: stats.resolved },
  ];

  const handleClearHistory = () => {
    onClear();
    setShowConfirmClear(false);
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <History size={20} className="text-blue-400" />
            Alert History
          </h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowConfirmClear(true)}
              disabled={alerts.length === 0}
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} />
              Clear History
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`p-3 rounded-lg border text-left transition-all ${
                filter === option.value
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 hover:border-slate-600 text-slate-300'
              }`}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-lg font-bold">{option.count || 0}</div>
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Filter size={14} />
            Showing {filteredAlerts.length} of {alerts.length} alerts
          </div>
          
          {filteredAlerts.length > 0 && (
            <div className="text-xs text-slate-500">
              Latest: {filteredAlerts[0]?.timestamp.toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {Object.keys(groupedAlerts).length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-slate-500 mb-2">
              <History size={48} className="mx-auto opacity-50" />
            </div>
            <div className="text-slate-400">
              {filter === 'all' ? 'No alerts found' : `No ${filter} alerts found`}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {Object.entries(groupedAlerts)
              .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
              .map(([date, dayAlerts]) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="sticky top-0 bg-slate-800/95 backdrop-blur-sm px-6 py-2 border-b border-slate-700/50">
                    <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Clock size={14} />
                      {date}
                      <span className="text-xs text-slate-500">
                        ({dayAlerts.length} alerts)
                      </span>
                    </div>
                  </div>

                  {/* Alerts for this day */}
                  <div className="space-y-0">
                    {dayAlerts
                      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                      .map((alert, index) => (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-4 p-4 border-l-4 hover:bg-slate-800/50 transition-colors ${
                            alert.level === 'critical'
                              ? 'border-red-500 bg-red-900/5'
                              : 'border-yellow-500 bg-yellow-900/5'
                          } ${index < dayAlerts.length - 1 ? 'border-b border-slate-800/50' : ''}`}
                        >
                          {/* Icon & Indicator */}
                          <div className="flex flex-col items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              alert.level === 'critical'
                                ? 'bg-red-900/30 text-red-400'
                                : 'bg-yellow-900/30 text-yellow-400'
                            }`}>
                              {getMetricIcon(alert.metric)}
                            </div>
                            {alert.resolved && (
                              <CheckCircle size={14} className="text-green-400" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-sm font-medium ${
                                    alert.level === 'critical' ? 'text-red-400' : 'text-yellow-400'
                                  }`}>
                                    {alert.level === 'critical' ? '🚨 Critical' : '⚠️ Warning'}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {alert.metric.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-sm text-white mb-1">
                                  {alert.message}
                                </div>
                                <div className="text-xs text-slate-400">
                                  {alert.timestamp.toLocaleTimeString()}
                                  {alert.resolved && (
                                    <>
                                      <span className="mx-2">→</span>
                                      <span className="text-green-400">
                                        Resolved at {alert.resolved.toLocaleTimeString()}
                                      </span>
                                      {alert.duration && (
                                        <span className="ml-2">
                                          (Duration: {formatDuration(alert.duration)})
                                        </span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Value Badge */}
                              <div className={`px-2 py-1 rounded text-xs font-medium ${
                                alert.level === 'critical'
                                  ? 'bg-red-900/30 text-red-300'
                                  : 'bg-yellow-900/30 text-yellow-300'
                              }`}>
                                {alert.value.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Clear Confirmation Modal */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-yellow-400" size={20} />
              <h3 className="text-lg font-semibold text-white">Clear Alert History</h3>
            </div>
            <p className="text-slate-300 mb-6">
              Are you sure you want to clear all alert history? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};