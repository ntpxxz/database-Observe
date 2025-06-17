import React, { FC, ReactNode } from 'react';

interface KPIWidgetProps {
  icon: ReactNode;
  title: string;
  value?: number | string;
  unit?: string;
  color: 'sky' | 'violet' | 'green' | 'amber';
}

export const KPIWidget: FC<KPIWidgetProps> = ({ icon, title, value, unit = '', color }) => {
  const isPercent = unit === '%';
  const displayValue = value ?? 'N/A';
  const percentValue = typeof value === 'number' && isPercent ? value : 0;

  const colorClasses = {
    sky: 'text-sky-400',
    violet: 'text-violet-400',
    green: 'text-green-400',
    amber: 'text-amber-400',
  };

  return (
    <div className={`bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4`}>
        <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg bg-slate-800 ${colorClasses[color]}`}>
                {icon}
            </div>
            <div>
                <p className="text-slate-400 text-sm">{title}</p>
                <p className="text-3xl font-bold text-white">{displayValue}<span className="text-xl ml-1">{unit}</span></p>
            </div>
        </div>
        {isPercent && (
            <div className="w-full bg-slate-800 rounded-full h-1.5">
                <div className={`bg-${color}-500 h-1.5 rounded-full`} style={{ width: `${percentValue}%` }}></div>
            </div>
        )}
    </div>
  );
};
