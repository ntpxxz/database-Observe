import React, { FC, useState } from "react";
import { Wifi } from "lucide-react";
import { ServerFormData } from "@/types/index";

interface NetworkScannerPanelProps {
  onAdd: (partialServer: Partial<ServerFormData>) => void;
}

export const NetworkScannerPanel: FC<NetworkScannerPanelProps> = ({
  onAdd,
}) => {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [foundHosts, setFoundHosts] = useState<string[]>([]);
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const handleScan = async () => {
    setIsScanning(true);
    setFoundHosts([]);
    try {
      const response = await fetch(`${API_URL}/network/scan`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Network scan failed");
      }
      const data: string[] = await response.json();
      setFoundHosts(data);
    } catch (error) {
      console.error("Scan failed:", error);
      // Optionally, set an error state to display to the user
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="bg-slate-800/50 p-6 rounded-xl border border-white/10">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold flex items-center text-white">
          <Wifi className="mr-3 text-sky-400" />
          Network Scanner
        </h3>
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-sm disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
        >
          {isScanning ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Scanning...
            </>
          ) : (
            "Start Scan"
          )}
        </button>
      </div>

      {isScanning && (
        <p className="text-center text-slate-400 my-4">
          Scanning for active hosts on the local network. This may take a few
          minutes...
        </p>
      )}

      {!isScanning && foundHosts.length === 0 && (
        <p className="text-center text-slate-500 my-4">Click to Start Scan.</p>
      )}

      {foundHosts.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          <h4 className="font-semibold text-slate-300 mb-3">
            Found {foundHosts.length} Active Host(s):
          </h4>
          {foundHosts.map((host) => (
            <div
              key={host}
              className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg animate-fade-in"
            >
              <span className="font-mono text-green-400">{host}</span>
              <button
                onClick={() => onAdd({ ipAddress: host })}
                className="text-xs py-1 px-3 rounded-md bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                Add Server
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
