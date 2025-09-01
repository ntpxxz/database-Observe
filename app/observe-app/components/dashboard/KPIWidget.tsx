import React, { FC, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface KPIWidgetProps {
  icon: React.ReactNode;
  title: string;
  value?: number | null;
  max?: number | null;
  unit?: string;
  color?: 'sky' | 'violet' | 'green' | 'amber' | 'red';
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  // เพิ่ม Alert properties
  warningThreshold?: number;
  criticalThreshold?: number;
  alertType?: 'percentage' | 'absolute' | 'reverse'; // reverse สำหรับ cache hit rate ที่ต่ำ = แย่
}

const colorClasses = {
  sky: {
    icon: 'text-sky-400',
    progress: 'bg-sky-500',
    progressBg: 'bg-sky-500/20',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    bg: 'bg-slate-800',
    indicator: 'bg-sky-500'
  },
  violet: {
    icon: 'text-violet-400',
    progress: 'bg-violet-500',
    progressBg: 'bg-violet-500/20',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    bg: 'bg-slate-800',
    indicator: 'bg-violet-500'
  },
  green: {
    icon: 'text-green-400',
    progress: 'bg-green-500',
    progressBg: 'bg-green-500/20',
    text: 'text-green-400',
    border: 'border-green-500/30',
    bg: 'bg-slate-800',
    indicator: 'bg-green-500'
  },
  amber: {
    icon: 'text-amber-400',
    progress: 'bg-amber-500',
    progressBg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    bg: 'bg-slate-800',
    indicator: 'bg-amber-500'
  },
  red: {
    icon: 'text-red-400',
    progress: 'bg-red-500',
    progressBg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    bg: 'bg-slate-800',
    indicator: 'bg-red-500'
  }
};

// Alert color overrides
const alertColorClasses = {
  warning: {
    bg: 'bg-yellow-900/30',
    border: 'border-yellow-500/50',
    text: 'text-yellow-400',
    progress: 'bg-yellow-500',
    progressBg: 'bg-yellow-500/20',
    icon: 'text-yellow-400',
    indicator: 'bg-yellow-500'
  },
  critical: {
    bg: 'bg-red-900/30',
    border: 'border-red-500/50',
    text: 'text-red-400',
    progress: 'bg-red-500',
    progressBg: 'bg-red-500/20',
    icon: 'text-red-400',
    indicator: 'bg-red-500'
  }
};

export const KPIWidget: FC<KPIWidgetProps> = ({
  icon,
  title,
  value,
  max,
  unit = '',
  color = 'sky',
  subtitle,
  trend,
  trendValue,
  warningThreshold = 80,
  criticalThreshold = 90,
  alertType = 'percentage'
}) => {
  const colors = colorClasses[color];
  
  // Calculate percentage for progress bar
  const percentage = useMemo(() => {
    if (typeof value !== 'number' || typeof max !== 'number') return 0;
    if (max === 0) return 0;
    return Math.min(Math.max((value / max) * 100, 0), 100);
  }, [value, max]);

  // Calculate alert level
  const alertLevel = useMemo(() => {
    if (value === undefined || value === null) return 'normal';
    
    let checkValue = value;
    
    // สำหรับ percentage type ใช้ค่า percentage
    if (alertType === 'percentage' && max && max > 0) {
      checkValue = percentage;
    }
    
    // สำหรับ reverse type (เช่น cache hit rate) ค่าต่ำ = แย่
    if (alertType === 'reverse') {
      if (checkValue <= criticalThreshold) return 'critical';
      if (checkValue <= warningThreshold) return 'warning';
      return 'normal';
    }
    
    // สำหรับ absolute และ percentage type ค่าสูง = แย่
    if (checkValue >= criticalThreshold) return 'critical';
    if (checkValue >= warningThreshold) return 'warning';
    return 'normal';
  }, [value, percentage, warningThreshold, criticalThreshold, alertType, max]);

  // Get final colors based on alert level
  const finalColors = useMemo(() => {
    if (alertLevel === 'critical') return { ...colors, ...alertColorClasses.critical };
    if (alertLevel === 'warning') return { ...colors, ...alertColorClasses.warning };
    return colors;
  }, [alertLevel, colors]);

  // Determine if we should show a progress bar
  const showProgressBar = useMemo(() => {
    return typeof value === 'number' && typeof max === 'number' && max > 0;
  }, [value, max]);

  // Format display value
  const displayValue = useMemo(() => {
    if (typeof value !== 'number') return 'N/A';
    
    // Round to appropriate precision
    if (value >= 100) {
      return Math.round(value).toString();
    } else if (value >= 10) {
      return value.toFixed(1);
    } else {
      return value.toFixed(2);
    }
  }, [value]);

  // Format max value for display
  const displayMax = useMemo(() => {
    if (typeof max !== 'number') return '';
    
    if (max >= 100) {
      return Math.round(max).toString();
    } else if (max >= 10) {
      return max.toFixed(1);
    } else {
      return max.toFixed(2);
    }
  }, [max]);

  // Determine progress bar color based on alert level and percentage
  const getProgressColor = useMemo(() => {
    
    if (title === "Cache Hit Rate") {
      if (percentage > 80) return "bg-green-500";
      return "bg-red-500";
    }
    if (alertLevel === 'critical') return 'bg-red-500';
    if (alertLevel === 'warning') return 'bg-yellow-500';
    
    if (!showProgressBar) return colors.progress;
    
    // Original logic for non-alert states
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-amber-500';
    return colors.progress;
  }, [title, alertLevel, percentage, showProgressBar, colors.progress]);

  const getProgressBgColor = useMemo(() => {

    if (title === "Cache Hit Rate") {
      if (percentage > 80) return "bg-green-500/20";
      return "bg-red-500/20";
    }
    
    if (alertLevel === 'critical') return 'bg-red-500/20';
    if (alertLevel === 'warning') return 'bg-yellow-500/20';
    
    if (!showProgressBar) return colors.progressBg;
    
    // Original logic for non-alert states
    if (percentage >= 90) return 'bg-red-500/20';
    if (percentage >= 75) return 'bg-amber-500/20';
    return colors.progressBg;
  }, [title, alertLevel, percentage, showProgressBar, colors.progressBg]);

  // Alert message
  const alertMessage = useMemo(() => {
    if (alertLevel === 'normal') return null;
    
    const levelText = alertLevel === 'critical' ? '🚨 Critical' : '⚠️ Warning';
    const valueText = alertType === 'percentage' ? `${percentage.toFixed(1)}%` : 
                     alertType === 'reverse' ? `${displayValue}${unit}` :
                     `${displayValue}${unit}`;
    
    return `${levelText} (${valueText})`;
  }, [alertLevel, alertType, percentage, displayValue, unit]);

  return (
    <div className={`${finalColors.bg} rounded-xl p-6 border ${finalColors.border} transition-all duration-200 hover:bg-slate-750 relative overflow-hidden ${
      alertLevel === 'critical' ? 'animate-pulse' : ''
    }`}>
      {/* Alert indicator dot */}
      {alertLevel !== 'normal' && (
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${finalColors.indicator} ${
            alertLevel === 'critical' ? 'animate-ping' : ''
          }`} />
          <AlertTriangle size={16} className={finalColors.text} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${finalColors.progressBg}`}>
          <div className={finalColors.icon}>
            {icon}
          </div>
        </div>
        {trend && !alertMessage && ( // Hide trend when showing alert
          <div className={`text-xs px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-green-500/20 text-green-400' :
            trend === 'down' ? 'bg-red-500/20 text-red-400' :
            'bg-slate-600 text-slate-300'
          }`}>
            {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}
            {trendValue && ` ${trendValue}%`}
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="text-slate-300 text-sm font-medium mb-2">{title}</h3>

      {/* Value Display */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${finalColors.text}`}>
            {displayValue}
          </span>
          {unit && (
            <span className="text-slate-400 text-sm">{unit}</span>
          )}
          {showProgressBar && (
            <span className="text-slate-500 text-sm ml-1">
              / {displayMax}{unit}
            </span>
          )}
        </div>

        {/* Alert Message */}
        {alertMessage && (
          <div className={`text-xs font-medium ${finalColors.text} py-1`}>
            {alertMessage}
          </div>
        )}

        {/* Subtitle (show only if no alert) */}
        {subtitle && !alertMessage && (
          <div className="text-xs text-slate-400">
            {subtitle}
          </div>
        )}

        {/* Progress Bar */}
        {showProgressBar && (
          <div className="mt-3">
            <div className={`w-full h-2 rounded-full ${getProgressBgColor} overflow-hidden`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${getProgressColor}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0</span>
              <span className={`font-medium ${
                alertLevel !== 'normal' ? finalColors.text : ''
              }`}>
                {percentage.toFixed(1)}%
              </span>
              <span>{displayMax}{unit}</span>
            </div>
          </div>
        )}
      </div>

      {/* Alert glow effect for critical */}
      {alertLevel === 'critical' && (
        <div className="absolute inset-0 bg-red-500/5 rounded-xl pointer-events-none" />
      )}
    </div>
  );
};