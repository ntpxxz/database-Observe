import React, { FC, useState } from 'react';
import { Settings, Save, RotateCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';

export interface AlertConfig {
  cpu: { warning: number; critical: number; enabled: boolean };
  memory: { warning: number; critical: number; enabled: boolean };
  connections: { warning: number; critical: number; enabled: boolean };
  cache: { warning: number; critical: number; enabled: boolean };
}

export const defaultAlertConfig: AlertConfig = {
  cpu: { warning: 70, critical: 85, enabled: true },
  memory: { warning: 80, critical: 90, enabled: true },
  connections: { warning: 70, critical: 85, enabled: true },
  cache: { warning: 70, critical: 60, enabled: true },
};

interface AlertConfigPanelProps {
  config: AlertConfig;
  onSave: (config: AlertConfig) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const AlertConfigPanel: FC<AlertConfigPanelProps> = ({ 
  config, 
  onSave, 
  isOpen, 
  onClose 
}) => {
  const [localConfig, setLocalConfig] = useState<AlertConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);

  const updateThreshold = (
    metric: keyof AlertConfig, 
    type: 'warning' | 'critical', 
    value: number
  ) => {
    setLocalConfig(prev => ({
      ...prev,
      [metric]: { ...prev[metric], [type]: value }
    }));
    setHasChanges(true);
  };

  const toggleEnabled = (metric: keyof AlertConfig) => {
    setLocalConfig(prev => ({
      ...prev,
      [metric]: { ...prev[metric], enabled: !prev[metric].enabled }
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // Validation: Critical should be higher than warning (except for cache)
    const errors: string[] = [];
    
    Object.entries(localConfig).forEach(([metric, settings]) => {
      if (!settings.enabled) return;
      
      if (metric === 'cache') {
        // For cache, critical should be lower than warning
        if (settings.critical > settings.warning) {
          errors.push(`${metric.toUpperCase()}: Critical threshold should be lower than warning threshold`);
        }
      } else {
        // For other metrics, critical should be higher than warning
        if (settings.critical <= settings.warning) {
          errors.push(`${metric.toUpperCase()}: Critical threshold should be higher than warning threshold`);
        }
      }
      
      // Check valid ranges
      if (settings.warning < 0 || settings.warning > 100) {
        errors.push(`${metric.toUpperCase()}: Warning threshold should be between 0-100`);
      }
      if (settings.critical < 0 || settings.critical > 100) {
        errors.push(`${metric.toUpperCase()}: Critical threshold should be between 0-100`);
      }
    });

    if (errors.length > 0) {
      toast.error(`Configuration errors:\n${errors.join('\n')}`);
      return;
    }

    onSave(localConfig);
    setHasChanges(false);
    toast.success('Alert configuration updated successfully!');
    onClose();
  };

  const handleReset = () => {
    setLocalConfig(defaultAlertConfig);
    setHasChanges(true);
  };

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        setLocalConfig(config);
        setHasChanges(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const metricDisplayNames = {
    cpu: 'CPU Usage',
    memory: 'Memory Usage',
    connections: 'Connection Usage',
    cache: 'Cache Hit Rate'
  };

  const metricDescriptions = {
    cpu: 'Triggers when CPU usage percentage is high',
    memory: 'Triggers when memory usage percentage is high',
    connections: 'Triggers when connection usage percentage is high',
    cache: 'Triggers when cache hit rate percentage is low (reverse logic)'
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700 flex-shrink-0">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <Settings size={20} className="text-blue-400" />
            Alert Configuration
          </h3>
          <button 
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-6">
            {Object.entries(localConfig).map(([metric, settings]) => (
              <div key={metric} className="bg-slate-900 rounded-lg p-6 border border-slate-700">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-lg font-medium text-white">
                        {metricDisplayNames[metric as keyof typeof metricDisplayNames]}
                      </h4>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={settings.enabled}
                          onChange={() => toggleEnabled(metric as keyof AlertConfig)}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span className="text-sm text-slate-300">Enabled</span>
                      </label>
                    </div>
                    <p className="text-sm text-slate-400">
                      {metricDescriptions[metric as keyof typeof metricDescriptions]}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-300">
                        Warning Threshold {metric === 'cache' ? '(≤)' : '(≥)'}
                      </label>
                      <span className="text-xs text-yellow-400">⚠️ Warning</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={settings.warning}
                        onChange={(e) => updateThreshold(metric as keyof AlertConfig, 'warning', Number(e.target.value))}
                        disabled={!settings.enabled}
                        className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                        min="0"
                        max="100"
                        step="1"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">%</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-300">
                        Critical Threshold {metric === 'cache' ? '(≤)' : '(≥)'}
                      </label>
                      <span className="text-xs text-red-400">🚨 Critical</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={settings.critical}
                        onChange={(e) => updateThreshold(metric as keyof AlertConfig, 'critical', Number(e.target.value))}
                        disabled={!settings.enabled}
                        className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        min="0"
                        max="100"
                        step="1"
                      />
                      <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">%</span>
                    </div>
                  </div>
                </div>

                {/* Visual Preview */}
                {settings.enabled && (
                  <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400 mb-2">Preview:</div>
                    <div className="flex items-center gap-2 text-sm">
                      {metric === 'cache' ? (
                        <>
                          <span className="text-green-400">Normal: &gt; {settings.warning}%</span>
                          <span className="text-yellow-400">Warning: {settings.critical}% - {settings.warning}%</span>
                          <span className="text-red-400">Critical: &lt; {settings.critical}%</span>
                        </>
                      ) : (
                        <>
                          <span className="text-green-400">Normal: &lt; {settings.warning}%</span>
                          <span className="text-yellow-400">Warning: {settings.warning}% - {settings.critical}%</span>
                          <span className="text-red-400">Critical: &gt; {settings.critical}%</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-blue-400 mt-0.5">ℹ️</div>
              <div className="text-sm text-blue-300">
                <strong>Configuration Tips:</strong>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  <li>CPU, Memory, Connections: Higher values trigger alerts</li>
                  <li>Cache Hit Rate: Lower values trigger alerts (reverse logic)</li>
                  <li>Critical thresholds should create meaningful escalation from warnings</li>
                  <li>Consider your system normal operating ranges when setting thresholds</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="flex items-center justify-between p-6 border-t border-slate-700 bg-slate-800/50 flex-shrink-0">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            <RotateCcw size={16} />
            Reset to Default
          </button>

          <div className="flex items-center gap-3">
            {hasChanges && (
              <span className="text-xs text-yellow-400">● Unsaved changes</span>
            )}
            <button
              onClick={handleClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Save size={16} />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};