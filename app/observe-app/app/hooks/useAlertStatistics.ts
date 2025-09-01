import { useMemo } from "react";

// Define proper types for the alert object
interface Alert {
  timestamp: string | Date;
  level: 'critical' | 'warning' | 'info';
  resolved: boolean;
  duration?: number;
  metric: string;
}

// Define return type for the hook
interface AlertStatistics {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  critical: number;
  warning: number;
  resolved: number;
  averageResolutionTime: number;
  mostFrequentMetric: string;
  peakAlertHours: number[];
}

export const useAlertStatistics = (history: Alert[]): AlertStatistics => {
  return useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats: AlertStatistics = {
      total: history.length,
      today: history.filter(a => new Date(a.timestamp) >= today).length,
      thisWeek: history.filter(a => new Date(a.timestamp) >= thisWeek).length,
      thisMonth: history.filter(a => new Date(a.timestamp) >= thisMonth).length,
      critical: history.filter(a => a.level === 'critical').length,
      warning: history.filter(a => a.level === 'warning').length,
      resolved: history.filter(a => a.resolved).length,
      averageResolutionTime: 0,
      mostFrequentMetric: '',
      peakAlertHours: []
    };

    // Calculate average resolution time
    const resolvedAlerts = history.filter(a => a.resolved && a.duration);
    if (resolvedAlerts.length > 0) {
      const totalDuration = resolvedAlerts.reduce((sum, a) => sum + (a.duration || 0), 0);
      stats.averageResolutionTime = Math.round(totalDuration / resolvedAlerts.length);
    }

    // Find most frequent metric
    const metricCounts = history.reduce((acc, alert) => {
      acc[alert.metric] = (acc[alert.metric] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    stats.mostFrequentMetric = Object.entries(metricCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([metric]) => metric)[0] || '';

    // Find peak alert hours
    const hourCounts = history.reduce((acc, alert) => {
      const hour = new Date(alert.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    stats.peakAlertHours = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    return stats;
  }, [history]);
};