import React, { FC, ReactNode } from 'react';

interface KPIWidgetProps {
  icon: ReactNode;
  title: string;
  value: string | number | undefined;
  unit?: string;
  color: string;
}

export const KPIWidget: FC<KPIWidgetProps> = ({ icon, title, value, unit = '', color }) => (
    <div className="bg-slate-800/50 p-5 rounded-xl border border-white/10 flex items-center">
        <div className={`p-3 rounded-lg mr-4 bg-slate-700/50 text-${color}-400`}>{icon}</div>
        <div>
            <p className="text-slate-400 text-sm">{title}</p>
            <p className="text-3xl font-bold text-white">{value ?? 'N/A'}<span className="text-lg ml-1">{unit}</span></p>
        </div>
    </div>
);
