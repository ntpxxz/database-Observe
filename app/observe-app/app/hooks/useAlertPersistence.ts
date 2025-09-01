// 1. Alert Persistence Hook
import type { AlertConfig } from '@/types';

const STORAGE_KEYS = {
  alertConfig: 'server-alert-config',
  alertHistory: 'server-alert-history',
  alertSettings: 'server-alert-settings'
};

export const useAlertPersistence = () => {
  const saveAlertConfig = (config: AlertConfig) => {
    try {
      localStorage.setItem(STORAGE_KEYS.alertConfig, JSON.stringify(config));
    } catch (error) {
      console.warn('Failed to save alert config:', error);
    }
  };

  const loadAlertConfig = (): AlertConfig | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.alertConfig);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.warn('Failed to load alert config:', error);
      return null;
    }
  };

  const saveAlertHistory = (history: any[]) => {
    try {
      // Keep only last 50 items for storage efficiency
      const limited = history.slice(0, 50);
      localStorage.setItem(STORAGE_KEYS.alertHistory, JSON.stringify(limited));
    } catch (error) {
      console.warn('Failed to save alert history:', error);
    }
  };

  const loadAlertHistory = (): any[] => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.alertHistory);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load alert history:', error);
      return [];
    }
  };

  return {
    saveAlertConfig,
    loadAlertConfig,
    saveAlertHistory,
    loadAlertHistory
  };
};