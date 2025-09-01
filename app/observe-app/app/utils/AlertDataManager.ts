import { AlertConfig } from "@/types";

export const AlertDataManager = {
    exportAlertData: (config: AlertConfig, history: any[]) => {
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        config,
        history: history.slice(0, 100), // Limit export size
      };
  
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `alert-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
  
    importAlertData: (file: File): Promise<{config: AlertConfig, history: any[]}> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target?.result as string);
            if (data.version && data.config) {
              resolve({
                config: data.config,
                history: data.history || []
              });
            } else {
              reject(new Error('Invalid file format'));
            }
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }
  };